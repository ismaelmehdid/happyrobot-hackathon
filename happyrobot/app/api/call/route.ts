import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const WORKFLOW_SLUG = process.env.HAPPYROBOT_WORKFLOW_SLUG ?? "2wp08hzdnbu6";
const HR_BASE_URL = process.env.HAPPYROBOT_BASE_URL ?? "https://platform.happyrobot.ai";

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
      { error: "HAPPYROBOT_API_KEY manquante côté serveur." },
      { status: 500 }
    );
  }

  let body: {
    phone_number?: string;
    contact_name?: string;
    questions?: string;
    environment?: "production" | "staging" | "development";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const phone_number = body.phone_number?.trim();
  const contact_name = body.contact_name?.trim() || "l'invité";
  const questions = body.questions?.trim();
  const environment = body.environment ?? "production";

  if (!phone_number) {
    return NextResponse.json({ error: "phone_number requis." }, { status: 400 });
  }
  if (!questions) {
    return NextResponse.json({ error: "questions requises." }, { status: 400 });
  }

  const sessionId = randomUUID();
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
    return NextResponse.json(
      { error: `HappyRobot ${hrRes.status}`, details: hrData },
      { status: hrRes.status }
    );
  }

  return NextResponse.json({ sessionId, webhook_url, hr: hrData });
}
