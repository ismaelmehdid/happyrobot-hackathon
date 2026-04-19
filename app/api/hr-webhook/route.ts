import { NextResponse } from "next/server";
import {
  parseJsonBody,
  parseSearchParams,
  sessionQuerySchema,
  toAnswerChoice,
  webhookBodySchema,
} from "@/app/lib/schemas";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getPostHogClient } from "@/app/lib/posthog-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const query = parseSearchParams(req, sessionQuerySchema);
  if (!query.ok) return query.response;
  const { session: sessionId } = query.data;

  const parsed = await parseJsonBody(req, webhookBodySchema);
  if (!parsed.ok) return parsed.response;
  const { question_id, answer, raw_answer } = parsed.data;

  const choice = toAnswerChoice(answer);
  if (!choice) {
    // "skipped" or anything we can't normalize — ack 200 so HappyRobot doesn't
    // retry, but don't persist.
    return NextResponse.json({ ok: true, skipped: true });
  }

  const admin = createAdminClient();

  // Resolve which user owns this session.
  const { data: session, error: sessionError } = await admin
    .from("call_sessions")
    .select("user_id")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    console.warn(`[hr-webhook] unknown session ${sessionId}`);
    return NextResponse.json(
      { error: "Unknown session." },
      { status: 404 },
    );
  }

  const { error: upsertError } = await admin.from("answers").upsert(
    {
      user_id: session.user_id,
      question_id,
      choice,
      raw_answer: raw_answer ?? answer,
      session_id: sessionId,
      answered_at: new Date().toISOString(),
    },
    { onConflict: "user_id,question_id" },
  );

  if (upsertError) {
    console.error("[hr-webhook] upsert failed", upsertError);
    return NextResponse.json(
      { error: "Failed to persist answer." },
      { status: 500 },
    );
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: session.user_id,
    event: "answer_recorded",
    properties: {
      question_id,
      choice,
      raw_answer: raw_answer ?? answer,
      session_id: sessionId,
    },
  });

  return NextResponse.json({ ok: true });
}
