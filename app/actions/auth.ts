"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { getPostHogClient } from "@/app/lib/posthog-server";

export async function signOut() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const posthog = getPostHogClient();
    posthog.capture({ distinctId: user.id, event: "user_signed_out" });
    await posthog.shutdown();
  }
  await supabase.auth.signOut();
  redirect("/sign-in");
}
