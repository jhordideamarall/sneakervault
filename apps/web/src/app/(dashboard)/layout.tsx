import { Sidebar } from "@/components/dashboard/sidebar";
import { RightSidebar } from "@/components/dashboard/right-sidebar";
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
          <main className="h-full overflow-y-auto px-8 pt-16 pb-8">
            <div className="mx-auto max-w-4xl">
              {children}
            </div>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Right Sidebar — FIXED width, tidak resize */}
      <div className="w-[300px] flex-shrink-0 bg-[#262626] rounded-md overflow-y-auto">
        <RightSidebar
          fullName={profile.full_name}
          roles={profile.roles as string[]}
          avatarUrl={profile.avatar_url}
          userId={profile.id}
        />
      </div>
    </div>
    </DateFilterProvider>
  );
  }
