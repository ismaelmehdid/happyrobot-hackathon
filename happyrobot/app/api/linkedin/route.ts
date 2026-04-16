import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const key = process.env.NETROWS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "NETROWS_API_KEY manquante côté serveur." },
      { status: 500 }
    );
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url || !/linkedin\.com\/in\//i.test(url)) {
    return NextResponse.json(
      { error: "URL LinkedIn invalide. Format attendu: https://www.linkedin.com/in/<slug>" },
      { status: 400 }
    );
  }

  const endpoint = `https://api.netrows.com/v1/people/profile-by-url?url=${encodeURIComponent(url)}`;

  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `Netrows ${res.status}`, details: data },
      { status: res.status }
    );
  }

  return NextResponse.json(data);
}
