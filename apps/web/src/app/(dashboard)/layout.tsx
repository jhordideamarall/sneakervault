import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { RightSidebar } from "@/components/dashboard/right-sidebar";
import { getCurrentUser } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { hasRouteAccess } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@sneakervault/ui";

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
    <div className="flex h-screen w-full overflow-hidden bg-[#1F1F1E]">
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left Sidebar */}
        <ResizablePanel defaultSize={15} minSize={5} maxSize={50} className="bg-[#262626] border-r border-white/[0.04]">
          <Sidebar roles={roles} fullName={profile.full_name} />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Main Content */}
        <ResizablePanel defaultSize={85}>
          <main className="h-full overflow-y-auto bg-[#1F1F1E] px-8 pt-16 pb-8">
            <div className="mx-auto max-w-4xl">
              {children}
            </div>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Right Sidebar - FIXED Width */}
      <div className="w-[300px] flex-shrink-0 border-l border-white/[0.04] bg-[#262626] overflow-y-auto">
        <RightSidebar 
          fullName={profile.full_name} 
          roles={profile.roles as string[]} 
          avatarUrl={profile.avatar_url}
        />
      </div>
    </div>
  );
  }
