"use server";

import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getPostHogClient } from "@/app/lib/posthog-server";

export async function resetMyAnswers() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" as const };

  const admin = createAdminClient();
  const { error } = await admin.from("answers").delete().eq("user_id", user.id);
  if (error) {
    console.error("[reset] delete failed", error);
    return { ok: false, error: "Failed to reset answers" as const };
  }

  const posthog = getPostHogClient();
  posthog.capture({ distinctId: user.id, event: "answers_reset" });

  return { ok: true };
}
