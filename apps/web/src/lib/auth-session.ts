import { cache } from "react";
import { createClient } from "@sneakervault/supabase/server";

/**
 * Request-scoped current user lookup.
 *
 * Wrapped in React `cache()` so that within a single server render the auth
 * round-trip (`auth.getUser()`) and the `profiles` query run exactly once, even
 * when the layout, the page's `requireRole()`, and nested server components all
 * ask for the current user. This removes the duplicate `getUser()` network
 * calls that made every navigation feel sluggish.
 *
 * Inactive profiles resolve to `null` (same gate as before) so callers keep
 * treating them as unauthenticated.
 */
export const getCurrentUserCached = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, roles, avatar_url, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active) return null;
  return profile;
});
