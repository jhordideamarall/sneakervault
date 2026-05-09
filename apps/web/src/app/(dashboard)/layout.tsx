import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { RightSidebar } from "@/components/dashboard/right-sidebar";
import { getCurrentUser } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { hasRouteAccess } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];

  // Enforce per-route role access using the current pathname.
  // next/headers exposes x-invoke-path / referer; use the matched pathname.
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? hdrs.get("x-invoke-path") ?? "";
  if (pathname && !hasRouteAccess(pathname, roles)) {
    redirect("/workspace");
  }

  return (
    <div className="grid h-screen grid-cols-[240px_1fr_300px] overflow-hidden">
      {/* Left Sidebar */}
      <div className="h-full bg-gradient-to-b from-[var(--color-sidebar-dark)] to-[var(--color-sidebar)]">
        <Sidebar roles={roles} fullName={profile.full_name} />
      </div>

      {/* Main Content */}
      <main className="overflow-y-auto bg-[var(--color-page-bg)] px-8 pt-16 pb-8">
        <div className="mx-auto max-w-4xl">
          {children}
        </div>
      </main>

      {/* Right Sidebar */}
      <div className="border-l border-white/[0.04] bg-gradient-to-b from-[var(--color-sidebar-dark)] to-[var(--color-sidebar)] overflow-y-auto">
        <RightSidebar fullName={profile.full_name} roles={profile.roles as string[]} />
      </div>
    </div>
  );
}
