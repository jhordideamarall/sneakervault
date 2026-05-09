import type { Role } from "@sneakervault/shared";

export const routePermissions: Record<string, Role[]> = {
  "/workspace": ["owner", "admin_gudang", "admin_online", "shopkeeper"],
  "/overview": ["owner"],
  "/inventory": ["owner", "admin_gudang", "admin_online", "shopkeeper"],
  "/inbound": ["owner", "admin_gudang"],
  "/outbound": ["owner", "shopkeeper"],
  "/orders": ["owner", "admin_gudang", "admin_online", "shopkeeper"],
  "/sold": ["owner", "admin_online"],
  "/returns": ["owner", "admin_gudang", "admin_online"],
  "/suppliers": ["owner", "admin_gudang"],
  "/reports": ["owner"],
  "/settings": ["owner"],
  "/activity-log": ["owner"],
  "/delete-requests": ["owner"],
  "/barcode-generate": ["owner", "admin_gudang"],
};

export function hasRouteAccess(pathname: string, roles: Role[]): boolean {
  const route = Object.keys(routePermissions).find((r) => pathname.startsWith(r));
  if (!route) return true; // unprotected route
  const allowed = routePermissions[route];
  if (!allowed) return true;
  return allowed.some((r) => roles.includes(r));
}
