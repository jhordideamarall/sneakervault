import { getSidebarSignals } from "@/lib/sidebar-signals";
import { Sidebar } from "./sidebar";
import type { Role } from "@sneakervault/shared";

/**
 * Async server wrapper that fetches sidebar activity signals (11 count queries)
 * and renders the Sidebar with them. Rendered inside a <Suspense> so the dots
 * stream in AFTER the page — the page render no longer blocks on these queries.
 */
export async function SidebarWithSignals({
  roles,
  fullName,
  userId,
}: {
  roles: Role[];
  fullName?: string;
  userId: string;
}) {
  const signals = await getSidebarSignals(roles);
  return (
    <Sidebar roles={roles} fullName={fullName} userId={userId} signals={signals} />
  );
}
