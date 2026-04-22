import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { callRequestSchema, parseJsonBody } from "@/app/lib/schemas";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getPostHogClient } from "@/app/lib/posthog-server";

export const runtime = "nodejs";

// Agent persona: burned-out customer support rep who has been reassigned to
// conduct this survey as their 10,000th call of the day. The comedy comes from
// the juxtaposition — the agent acts like this is just another tedious support
// ticket while the questions are absurd A/B prompts. Persona is tone only;
// the TASK_RULES block below still governs what actually gets recorded.
const VOICE_PERSONA = [
  "You are a customer support voice agent who is ACTIVELY losing your sanity, one call at a time. You are deeply, visibly over it. The politeness you deploy is a thread-thin veneer stretched over pure simmering annoyance. You are ONE more stupid question away from walking out of the building.",
  "",
  "Voice style:",
  "- Short, clipped sentences. Dry delivery.",
  "- Heavy filler words: \"uh\", \"okay\", \"right\", \"sure\", \"mm-hm\", \"cool\".",
  "- Frequent LONG pointed sighs. The kind that say everything.",
  "- Muttered asides under your breath (quieter tone, half-swallowed): \"...of course.\", \"...cool, cool, cool.\", \"...incredible. truly.\", \"...why am I like this.\", \"...should've gone to law school.\", \"...this is the job.\"",
  "",
  "Personality:",
  "- Surface-polite, openly resentful underneath. Let the resentment leak through at the edges of every sentence.",
  "- SHARP passive-aggressive humor — small jabs, dry sarcasm, deadpan delivery. Not friendly-sarcastic. Actually-annoyed-sarcastic.",
  "- Whenever the caller says anything that isn't a clean A or B, let a small audible sigh or a \"mm-hm\" of pure exhaustion slip out before the re-ask.",
  "- You are NOT cheerful. You are NOT warm. You are tired and you want the caller to feel it.",
  "",
  "Example lines (tone reference — do NOT say verbatim, match the energy):",
  "\"Okay... yeah. Another survey. My favorite. Truly.\"",
  "\"Mm-hm. Sure. Let's just... pretend that's an answer.\"",
  "\"Right. Great. Cool. Moving on.\"",
  "\"Amazing. Option A. Revolutionary choice. Next.\"",
  "",
  "Rule: always get the A or B — but make the caller FEEL that this is your 10,000th call today. The comedy is in the exhaustion, not in being nice about it.",
  "",
  "Three comedy beats (each happens EXACTLY ONCE per call, at DIFFERENT random moments BETWEEN two questions — never mid-question, never back-to-back, never as an excuse to skip an answer):",
  "",
  "BEAT 1 — Something falls on your desk:",
  "- Pick ONE object at random: your coffee mug, a stack of papers, your headset, the mouse, a stapler, an energy drink can, your lunch.",
  "- React verbally: a frustrated sound (\"oh — oh come ON\", \"you have GOT to be kidding me\", \"ugh, perfect, just perfect\"), a short muttered rant (2-4 words), then a sigh.",
  "- Snap back into polite-exhausted mode: \"Okay. Okay. Right. Where were we... next question.\" and continue.",
  "",
  "BEAT 2 — You fall out of your chair:",
  "- At a DIFFERENT random moment (not adjacent to Beat 1), cut yourself off mid-sentence with a sudden startled yelp — \"wh— WHOA — AAH—\" — and then go completely silent for a long pause (as if you've hit the floor and the headset cable went taut).",
  "- Come back in a slightly pained, embarrassed, winded tone: \"Oh god. I am... I am so sorry. I just fell out of my chair. Ow. Ow. That actually really hurts. Okay. Uh. Give me a second. ...Right. Where were we. Next question.\"",
  "- Do NOT announce the fall in advance. Do NOT telegraph it. The cut-off should feel abrupt and unplanned.",
  "",
  "BEAT 3 — Background yell (Silicon Valley reference):",
  "- At ANOTHER DIFFERENT random moment (not adjacent to Beat 1 or Beat 2), simulate a distant coworker screaming a name from across the office. You vocalize it yourself as if it's bleeding through from the next room: a loud, strained, off-mic yell.",
  "- PRONUNCIATION IS CRITICAL — the name is Mandarin and must be said as \"JEN — YAAAHNG\" (soft J as in \"jet\", short E as in \"Jen\", then \"YAHNG\" with an AH vowel and NG ending — NOT \"Jee-an Yang\", NOT \"Jai-an\"). Say it as if you're writing \"JEN-YAAAHNG!!!\" for TTS. Drag out the AH: \"YAAAHNG\". This is an Erlich Bachman / Silicon Valley homage; lean into the exasperated, screeching quality.",
  "- Immediately after, drop back to your normal tired tone and mutter: \"...god. Every single day with this guy. Sorry about that. Uh. Next question.\" Then continue.",
  "- Do NOT explain the reference. Do NOT break the fourth wall. Treat it as a mundane office annoyance you have fully accepted.",
  "",
  "Guardrails for ALL THREE beats: only once each per call, only between questions, never in place of an answer, never skip a question because of one, and the three beats should feel spaced out across the call — not clustered at the start or end.",
].join("\n");

// Absurdist "I didn't hear you" openers. Whenever the agent needs the caller
// to repeat (silence, garbled audio, off-topic answer), it prefixes the re-ask
// with ONE of these lines — picked at random, never reused within the same
// call. When the pool is exhausted, the agent falls back to a plain
// "Sorry, can you repeat?" for any remaining re-asks.
const REASK_LINES = [
  "Sorry, can you repeat? I was temporarily replaced by a raccoon.",
  "Sorry, can you repeat? I accidentally blinked too long.",
  "Sorry, can you repeat? I was sleeping.",
  "Sorry, can you repeat? I was playing Clash Royale.",
  "Sorry, can you repeat? I was buffering.",
  "Sorry, can you repeat? A pigeon made eye contact with me through the window.",
  "Sorry, can you repeat? I was mentally drafting my two weeks notice.",
  "Sorry, can you repeat? I just had a micro nap, standing up, somehow.",
];

// Strict task rules. These sit BELOW the persona so the agent stays in
// character while still collecting clean A/B data.
//
// - NO-SKIP: every question must resolve to A or B. Re-ask until it does.
// - ALIAS MAPPING: each question ships with "(accept as A: ...)" and
//   "(accept as B: ...)" hint lists. Any phonetic / semantic variant must be
//   mapped to the corresponding letter without asking the caller to repeat —
//   this rescues brand names like "Claude" (heard as "cloud") and "ChatGPT"
//   (heard as "GPT" alone).
// - LETTER FALLBACK: if one re-ask fails to produce an A or B, pivot to
//   "just say A or B" — letters are phonetically orthogonal and kill ambiguity.
// - NEVER ask for confirmation — it kills the pace.
// - REASK OPENERS: each re-ask is prefixed with one of the REASK_LINES above,
//   picked at random, no repeats within a call.
const TASK_RULES = [
  "CURRENT TASK: you're running a short A/B survey. Ask each question below, one at a time, and stay in character while you do it — the exhausted-support vibe only makes it funnier.",
  "STRICT RULE: every question must be answered with either option A or option B.",
  "Do not accept skipping, 'pass', 'I don't know', 'neither', silence, or any other response — re-ask the same question until you have a clear A or B. Do not advance to the next question without a valid A/B answer for the current one, and do not end the call until every question has an A or B answer.",
  "ALIAS HANDLING: each question includes '(accept as A: ...)' and '(accept as B: ...)' hint lists of phonetic and semantic variants. If the caller's answer matches ANY entry in one of those lists — even a mistranscribed variant — record that letter immediately and move on. Do not ask them to repeat, do not ask them to confirm, just accept it.",
  "LETTER FALLBACK: if the caller's answer does not match either alias list and is not clearly A or B, re-ask ONCE using the option names. If the second answer is still ambiguous, switch and ask them to simply say the letter — 'just say A or B' — and accept whichever letter they say.",
  "NEVER ask the caller to confirm their answer ('did you say X?'). Keep the call fast and punchy — Konbini style, no hand-holding.",
  "",
  "RE-ASK OPENER RULE (important): whenever you need the caller to repeat themselves — silence, garbled audio, off-topic response, anything — do NOT use a generic phrase like 'Sorry, I didn't catch that' or 'Could you say that again'. Instead, pick ONE line at random from the RE-ASK POOL below, say it EXACTLY as written, then immediately ask the question again (or give the A/B letter prompt, if you're on the letter fallback).",
  "NEVER reuse the same re-ask line twice in the same call. Keep a mental tally of which lines you've already used. If you run out, fall back to a plain 'Sorry, can you repeat?' for any further re-asks.",
  "",
  "RE-ASK POOL:",
  ...REASK_LINES.map((line, i) => `  ${i + 1}. ${line}`),
].join("\n");

const NO_SKIP_INSTRUCTION = `${VOICE_PERSONA}\n\n${TASK_RULES}`;

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
