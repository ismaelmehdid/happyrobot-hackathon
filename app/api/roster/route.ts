import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import type { Person } from "@/app/lib/schemas/participant";

export const runtime = "nodejs";

type UserMeta = {
  display_name?: string;
  full_name?: string;
  profile_picture_url?: string;
  linkedin_url?: string;
};

function handleFromLinkedin(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? u.hostname;
  } catch {
    return url;
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  // Hackathon scale — one page (default 50) is enough. Revisit if the roster grows.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) {
    console.error("[roster] listUsers failed", error);
    return NextResponse.json(
      { error: "Failed to load roster." },
      { status: 500 },
    );
  }

  const roster: Person[] = data.users.flatMap<Person>((u) => {
    const meta = (u.user_metadata ?? {}) as UserMeta;
    if (!meta.linkedin_url) return [];
    const name = meta.display_name || meta.full_name || "Anonymous";
    return [
      {
        id: u.id,
        name,
        handle: handleFromLinkedin(meta.linkedin_url),
        city: "",
        profilePicture: meta.profile_picture_url || undefined,
        linkedinUrl: meta.linkedin_url,
      },
    ];
  });
  roster.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(roster);
}
