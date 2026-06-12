"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUserCached, VIEW_AS_COOKIE } from "@/lib/auth-session";
import { ROLES, type Role } from "@sneakervault/shared";

/**
 * Owner-only "view as role" toggle.
 *
 * Sets/clears the `view_as_role` cookie. Authorization uses `real_roles` (never
 * the effective/previewed roles) so an owner mid-preview can still reset. The
 * preview only ever narrows the owner to a single lower role — it cannot
 * escalate privileges, and DB RLS continues to use the real owner session.
 */
export async function setViewAsRole(
  role: Role | null,
): Promise<{ ok?: true; error?: string }> {
  const profile = await getCurrentUserCached();
  const realRoles = (profile?.real_roles ?? []) as Role[];
  if (!realRoles.includes("owner")) {
    return { error: "Hanya owner yang bisa mengubah tampilan role" };
  }

  const store = await cookies();
  if (role === null || role === "owner") {
    store.delete(VIEW_AS_COOKIE);
  } else if ((ROLES as string[]).includes(role)) {
    store.set(VIEW_AS_COOKIE, role, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  } else {
    return { error: "Role tidak valid" };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
