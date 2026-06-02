import { Sidebar } from "@/components/dashboard/sidebar";
import { RightSidebarSlot } from "@/components/dashboard/right-sidebar-slot";
import { MainShell } from "@/components/dashboard/main-shell";
import { getCurrentUser } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { hasRouteAccess } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@sneakervault/ui";
import { MailGlobalDialog } from "@/components/dashboard/mail/mail-global-dialog";
import { RealtimeProvider } from "@/components/dashboard/realtime-provider";
import { DateFilterProvider } from "@/lib/use-date-filter";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];

  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? hdrs.get("x-invoke-path") ?? "";
  if (pathname && !hasRouteAccess(pathname, roles)) {
    redirect("/workspace");
  }

  return (
    <DateFilterProvider>
    <div className="flex h-screen w-full overflow-hidden bg-[#1F1F1E] gap-2 p-2">
      <MailGlobalDialog userId={profile.id} />
      <RealtimeProvider />
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left Sidebar — resizable */}
        <ResizablePanel 
          defaultSize={15}
          className="bg-[#262626] rounded-md overflow-hidden"
        >
          <Sidebar roles={roles} fullName={profile.full_name} userId={profile.id} />
        </ResizablePanel>

        <ResizableHandle />

        {/* Main Content */}
        <ResizablePanel 
          defaultSize={85}
          className="bg-[#1F1F1E] rounded-md overflow-hidden"
        >
          <MainShell>{children}</MainShell>
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
    </DateFilterProvider>
  );
  }
