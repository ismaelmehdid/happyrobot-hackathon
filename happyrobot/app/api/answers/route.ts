import { NextResponse } from "next/server";
import { getHistory } from "../../lib/hr-bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session");
  if (!sessionId) {
    return NextResponse.json({ error: "session requis." }, { status: 400 });
  }
  return NextResponse.json({ session: sessionId, answers: getHistory(sessionId) });
}
