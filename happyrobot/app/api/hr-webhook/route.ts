import { NextResponse } from "next/server";
import { recordAnswer } from "../../lib/hr-bus";

export const runtime = "nodejs";

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session");
  if (!sessionId) {
    return NextResponse.json({ error: "session requis." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const qn = toNumber(body.question_number);
  const answer = typeof body.answer === "string" ? body.answer : String(body.answer ?? "");

  if (qn === null) {
    return NextResponse.json(
      { error: "question_number requis (numérique)." },
      { status: 400 }
    );
  }

  console.log(
    `[hr-webhook] session=${sessionId} q=${qn} answer=${answer.slice(0, 80)}`
  );
  recordAnswer(sessionId, {
    question_number: qn,
    answer,
    phone_number: typeof body.phone_number === "string" ? body.phone_number : undefined,
    contact_name: typeof body.contact_name === "string" ? body.contact_name : undefined,
    received_at: Date.now(),
  });

  return NextResponse.json({ ok: true });
}
