import type { Role } from "@sneakervault/shared";

// Role priority for choosing "primary" role when user has multiple.
// Higher index = higher priority.
export const ROLE_PRIORITY: Role[] = ["shopkeeper", "admin_online", "admin_gudang", "owner"];

export function primaryRole(roles: Role[] | string[] | null | undefined): Role {
  const userRoles = (roles ?? []) as Role[];
  if (userRoles.length === 0) return "shopkeeper";
  // Pick the highest-priority role the user has
  for (let i = ROLE_PRIORITY.length - 1; i >= 0; i--) {
    const candidate = ROLE_PRIORITY[i];
    if (candidate && userRoles.includes(candidate)) return candidate;
  }
  return userRoles[0] as Role;
}

export function hasAnyRole(userRoles: string[] | null | undefined, allowed: Role[]): boolean {
  if (!userRoles) return false;
  return allowed.some((r) => userRoles.includes(r));
}
