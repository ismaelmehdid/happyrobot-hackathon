import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { callRequestSchema, parseJsonBody } from "@/app/lib/schemas";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";

export const runtime = "nodejs";

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
  const { phone_number, contact_name, questions, environment } = parsed.data;

  const sessionId = randomUUID();

  // Persist the session first so the webhook can map session → user_id when
  // answers start arriving. Service role bypasses RLS.
  const admin = createAdminClient();
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
      payload: { phone_number, contact_name, questions, webhook_url },
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
    return NextResponse.json(
      { error: `HappyRobot ${hrRes.status}`, details: hrData },
      { status: hrRes.status },
    );
  }

  return NextResponse.json({ sessionId, webhook_url, hr: hrData });
}
