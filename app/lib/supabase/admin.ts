import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. Use ONLY from server routes, never
// expose to the browser. Writes to `call_sessions` and `answers` go through
// this client so the public anon key can't insert answers directly.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var.",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
