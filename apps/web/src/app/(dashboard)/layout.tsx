import { Suspense } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { SidebarWithSignals } from "@/components/dashboard/sidebar-signals-loader";
import { RightSidebarSlot } from "@/components/dashboard/right-sidebar-slot";
import { MainShell } from "@/components/dashboard/main-shell";
import { getCurrentUser } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { hasRouteAccess } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@sneakervault/ui";
import { MailGlobalHost } from "@/components/dashboard/mail/mail-global-host";
import { RealtimeProvider } from "@/components/dashboard/realtime-provider";
import { ViewAsBanner } from "@/components/dashboard/view-as-banner";
import { FeedbackFab } from "@/components/feedback/feedback-fab";
import { DateFilterProvider } from "@/lib/use-date-filter";
import { RightPanelProvider } from "@/lib/use-right-panel";
import { FeatureTourGate } from "@/components/dashboard/feature-tour-gate";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  // `roles` is EFFECTIVE (owner previewing another role -> the previewed role).
  // `real_roles` is the true set; owner keeps the always-available preview bar.
  const roles = (profile.roles ?? []) as Role[];
  const realRoles = (profile.real_roles ?? []) as Role[];
  const isOwner = realRoles.includes("owner");

  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? hdrs.get("x-invoke-path") ?? "";
  // Anti-lockout: a previewed role with no access lands on /workspace (allowed
  // to every role), never a redirect loop or logout — the bar resets it.
  if (pathname && !hasRouteAccess(pathname, roles)) {
    redirect("/workspace");
  }

  return (
    <DateFilterProvider>
    <RightPanelProvider>
    <div className="flex h-screen w-full overflow-hidden bg-[#1F1F1E] gap-2 p-2">
      <MailGlobalHost userId={profile.id} />
      <FeedbackFab userId={profile.id} />
      <RealtimeProvider />
      <FeatureTourGate roles={roles} />
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left Sidebar — resizable */}
        <ResizablePanel 
          defaultSize={15}
          className="bg-[#262626] rounded-md overflow-hidden"
        >
          <Suspense
            fallback={
              <Sidebar roles={roles} fullName={profile.full_name} userId={profile.id} />
            }
          >
            <SidebarWithSignals roles={roles} fullName={profile.full_name} userId={profile.id} />
          </Suspense>
        </ResizablePanel>

        <ResizableHandle />

        {/* Main Content */}
        <ResizablePanel
          defaultSize={85}
          className="bg-[#1F1F1E] rounded-md overflow-hidden"
        >
          <div className="flex h-full flex-col">
            {isOwner && (
              <ViewAsBanner current={(profile.view_as ?? null) as Role | null} />
            )}
            <div className="flex-1 overflow-hidden">
              <MainShell>{children}</MainShell>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Right Sidebar — disembunyikan HANYA di POS kasir (client-side per route). */}
      <RightSidebarSlot
        fullName={profile.full_name}
        roles={profile.roles as string[]}
        avatarUrl={profile.avatar_url}
        userId={profile.id}
      />
    </div>
    </RightPanelProvider>
    </DateFilterProvider>
  );
  }
