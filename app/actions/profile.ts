"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import {
  ALLOWED_PICTURE_MIME,
  MAX_PICTURE_BYTES,
  onboardingFormSchema,
} from "@/app/lib/schemas/profile";

const BUCKET = "profile-pictures";

type ActionResult = { ok: true } | { ok: false; error: string };

function extensionFor(mime: string, fallback: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return fallback;
  }
}

export async function saveProfile(formData: FormData): Promise<ActionResult> {
  const parsed = onboardingFormSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    linkedinUrl: formData.get("linkedinUrl"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const key = issue?.path[0];
    const field =
      key === "lastName"
        ? "Last name"
        : key === "linkedinUrl"
          ? "LinkedIn URL"
          : "First name";
    return { ok: false, error: `${field}: ${issue?.message ?? "Invalid"}` };
  }
  const { firstName, lastName, linkedinUrl } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();

  let profile_picture_url: string | undefined;
  const raw = formData.get("profilePicture");
  if (raw instanceof File && raw.size > 0) {
    if (!ALLOWED_PICTURE_MIME.includes(raw.type as (typeof ALLOWED_PICTURE_MIME)[number])) {
      return {
        ok: false,
        error: "Profile picture must be JPEG, PNG, WebP, or GIF.",
      };
    }
    if (raw.size > MAX_PICTURE_BYTES) {
      return { ok: false, error: "Profile picture must be under 5MB." };
    }
    const ext = extensionFor(raw.type, "jpg");
    // Keep one file per user — overwrite on re-upload. The bucket is public
    // so a stable CDN URL makes the avatar cacheable.
    const path = `${user.id}/avatar.${ext}`;
    const bytes = new Uint8Array(await raw.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: raw.type, upsert: true });
    if (upErr) {
      return { ok: false, error: `Upload failed: ${upErr.message}` };
    }
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    // Bust any stale CDN cache when a user re-uploads.
    profile_picture_url = `${pub.publicUrl}?v=${Date.now()}`;
  }

  const displayName = `${firstName} ${lastName}`;

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...user.user_metadata,
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
      ...(profile_picture_url ? { profile_picture_url } : {}),
      ...(linkedinUrl ? { linkedin_url: linkedinUrl } : {}),
    },
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAccount(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const admin = createAdminClient();

  // Don't rely solely on `references auth.users on delete cascade`:
  // auth.admin.deleteUser can soft-delete depending on project config, in
  // which case cascade never fires. Wipe everything explicitly first.
  const { error: answersError } = await admin
    .from("answers")
    .delete()
    .eq("user_id", user.id);
  if (answersError) {
    throw new Error(`Couldn't delete answers: ${answersError.message}`);
  }
  const { error: sessionsError } = await admin
    .from("call_sessions")
    .delete()
    .eq("user_id", user.id);
  if (sessionsError) {
    throw new Error(`Couldn't delete call sessions: ${sessionsError.message}`);
  }

  // Storage: auth.admin.deleteUser doesn't touch Storage buckets.
  const { data: files } = await admin.storage.from(BUCKET).list(user.id);
  if (files && files.length > 0) {
    await admin.storage
      .from(BUCKET)
      .remove(files.map((f) => `${user.id}/${f.name}`));
  }

  // Clear LinkedIn URL + display name + avatar from user_metadata so nothing
  // lingers if the auth row is soft-deleted rather than hard-deleted.
  await admin.auth.admin.updateUserById(user.id, { user_metadata: {} });

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    throw new Error(`Couldn't delete account: ${error.message}`);
  }

  await supabase.auth.signOut();
  redirect("/sign-in");
}
