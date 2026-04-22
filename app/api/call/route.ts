import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { callRequestSchema, parseJsonBody } from "@/app/lib/schemas";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getPostHogClient } from "@/app/lib/posthog-server";

export const runtime = "nodejs";

// Prepended to every HappyRobot payload. The agent must not accept a skip,
// "pass", silence, or any non-A/non-B response — it has to re-ask until the
// caller picks one of the two options. Without this the webhook silently
// drops skipped answers and the user ends up with holes in their sheet.
//
// ALIAS MAPPING: each question line ships with "(accept as A: ...)" and
// "(accept as B: ...)" hint lists. Any phonetic / semantic variant in those
// lists — even if mistranscribed — must be mapped to the corresponding letter
// without asking the caller to repeat. This is what rescues brand names like
// "Claude" (often heard as "cloud") and "ChatGPT" (often heard as "GPT" alone).
//
// LETTER FALLBACK: if after ONE re-ask the answer is still not clearly A or B
// and no alias matches, the agent pivots and asks the caller to simply say the
// letter "A" or the letter "B". Letters are phonetically orthogonal and kill
// the ambiguity. Do not loop on the option names more than twice.
const NO_SKIP_INSTRUCTION = [
  "STRICT RULE: every question below must be answered with either option A or option B.",
  "Do not accept skipping, 'pass', 'I don't know', 'neither', silence, or any other response — politely re-ask the same question until you have a clear A or B. Do not advance to the next question without a valid A/B answer for the current one, and do not end the call until every question has an A or B answer.",
  "ALIAS HANDLING: each question includes '(accept as A: ...)' and '(accept as B: ...)' hint lists of phonetic and semantic variants. If the caller's answer matches ANY entry in one of those lists — even a mistranscribed variant — record that letter immediately and move on. Do not ask them to repeat, do not ask them to confirm, just accept it.",
  "LETTER FALLBACK: if the caller's answer does not match either alias list and is not clearly A or B, re-ask ONCE using the option names. If the second answer is still ambiguous, switch the question and ask them to simply say the letter — 'just say A or B' — and accept whichever letter they say.",
  "NEVER ask the caller to confirm their answer ('did you say X?'). Keep the call fast and punchy — Konbini style, no hand-holding.",
].join(" ");

const WORKFLOW_SLUG = process.env.HAPPYROBOT_WORKFLOW_SLUG ?? "2wp08hzdnbu6";
const HR_BASE_URL =
  process.env.HAPPYROBOT_BASE_URL ?? "https://platform.happyrobot.ai";

function resolveBaseUrl(req: Request): string {
  const env = process.env.PUBLIC_BASE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const url = new URL(req.url);
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? req.headers.get("host") ?? url.host;
  const proto = forwardedProto ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  const apiKey = process.env.HAPPYROBOT_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "HAPPYROBOT_API_KEY missing on the server." },
      { status: 500 },
    );
  }

  // Only a signed-in user can trigger a call, and the answers will be tied to
  // their user_id.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = await parseJsonBody(req, callRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { phone_number, questions, environment } = parsed.data;

  // Prevent toll fraud: a caller can only trigger a call to their own verified
  // phone. Supabase may store `user.phone` as digits without the leading '+',
  // so compare on digits only.
  const digits = (s: string) => s.replace(/\D/g, "");
  if (!user.phone || digits(phone_number) !== digits(user.phone)) {
    return NextResponse.json(
      { error: "You can only call your own verified phone number." },
      { status: 403 },
    );
  }

  // The AI addresses the caller by name. We pull it from the verified
  // user_metadata (written by the onboarding action) rather than trusting the
  // client — same reason we verify phone server-side.
  const meta = user.user_metadata as
    | { first_name?: string; last_name?: string; display_name?: string }
    | null;
  const contact_name =
    meta?.display_name ||
    [meta?.first_name, meta?.last_name].filter(Boolean).join(" ") ||
    "l'invité";

  const admin = createAdminClient();

  // Resume-aware: skip questions this user has already answered so a re-call
  // picks up from the next unanswered one.
  const { data: answered, error: answeredError } = await admin
    .from("answers")
    .select("question_id")
    .eq("user_id", user.id);
  if (answeredError) {
    console.error("[call] failed to read existing answers", answeredError);
    return NextResponse.json(
      { error: "Failed to load prior answers." },
      { status: 500 },
    );
  }
  const answeredIds = new Set((answered ?? []).map((r) => r.question_id));

  const remainingQuestions = questions
    .split("\n")
    .filter((line) => {
      const m = line.match(/^\s*\[(q\d+)\]/);
      return !m || !answeredIds.has(m[1]);
    })
    .join("\n")
    .trim();

  if (!remainingQuestions) {
    return NextResponse.json({ allAnswered: true });
  }

  const sessionId = randomUUID();

  // Persist the session first so the webhook can map session → user_id when
  // answers start arriving. Service role bypasses RLS.
  const { error: sessionError } = await admin.from("call_sessions").insert({
    id: sessionId,
    user_id: user.id,
    phone_number,
  });
  if (sessionError) {
    console.error("[call] failed to insert call_sessions", sessionError);
    return NextResponse.json(
      { error: "Failed to persist call session." },
      { status: 500 },
    );
  }

  const base = resolveBaseUrl(req);
  const webhook_url = `${base}/api/hr-webhook?session=${sessionId}`;

  const endpoint = `${HR_BASE_URL}/api/v2/workflows/${WORKFLOW_SLUG}/runs?environment=${environment}`;

  const hrRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payload: {
        phone_number,
        contact_name,
        questions: `${NO_SKIP_INSTRUCTION}\n\n${remainingQuestions}`,
        webhook_url,
      },
    }),
    cache: "no-store",
  });

  const text = await hrRes.text();
  let hrData: unknown;
  try {
    hrData = JSON.parse(text);
  } catch {
    hrData = { raw: text };
  }

  if (!hrRes.ok) {
    // Roll back the session row — the call didn't actually start.
    await admin.from("call_sessions").delete().eq("id", sessionId);
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "call_trigger_failed",
      properties: {
        session_id: sessionId,
        status: hrRes.status,
      },
    });
    return NextResponse.json(
      { error: `HappyRobot ${hrRes.status}`, details: hrData },
      { status: hrRes.status },
    );
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: user.id,
    event: "call_initiated",
    properties: {
      session_id: sessionId,
      phone_number,
      remaining_questions: remainingQuestions.split("\n").filter(Boolean).length,
    },
  });

  return NextResponse.json({ sessionId, webhook_url, hr: hrData });
}
