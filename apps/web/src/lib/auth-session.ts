import { cache } from "react";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { createClient } from "@sneakervault/supabase/server";
import { AUTH_USER_ID_HEADER } from "@sneakervault/supabase/middleware";
import { ROLES, type Role } from "@sneakervault/shared";
import { measureServer } from "@/lib/server-perf";

/**
 * Cookie that lets a real owner preview the app as another role (view-as).
 * Only honored when the signed-in user actually holds the `owner` role, and
 * never escalates privileges (owner -> a single lower role). See setViewAsRole.
 */
export const VIEW_AS_COOKIE = "view_as_role";

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
 *
 * `roles` returns the EFFECTIVE roles: for an owner previewing another role it
 * is the previewed role, so every consumer (layout gating, requireRole,
 * canSeeHpp, sidebar) reflects the preview with no per-page change. `real_roles`
 * always holds the true roles for the few places that must ignore the preview
 * (the view-as toggle itself, the banner gate).
 */
export const getCurrentUserCached = cache(async () => measureServer("auth.currentUser", async () => {
  const supabase = await createClient();
  const requestHeaders = await headers();
  let userId = requestHeaders.get(AUTH_USER_ID_HEADER);

  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    userId = user.id;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, roles, avatar_url, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.is_active) return null;

  const realRoles = (profile.roles ?? []) as Role[];
  let effectiveRoles = realRoles;
  let viewAs: Role | null = null;

  if (realRoles.includes("owner")) {
    const store = await cookies();
    const v = store.get(VIEW_AS_COOKIE)?.value as Role | undefined;
    if (v && v !== "owner" && (ROLES as string[]).includes(v)) {
      effectiveRoles = [v];
      viewAs = v;
    }
  }

  return {
    ...profile,
    roles: effectiveRoles,
    real_roles: realRoles,
    view_as: viewAs,
    is_preview: viewAs !== null,
  };
}));
