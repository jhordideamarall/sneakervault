"use client";

import { usePathname } from "next/navigation";
import { User, CalendarDays, Activity, PanelRightClose, PanelRightOpen } from "lucide-react";
import { RightSidebar } from "./right-sidebar";
import { useRightPanel } from "@/lib/use-right-panel";

/**
 * Renders the right sidebar on every dashboard page EXCEPT POS kasir.
 * Collapsible to a thin icon rail to give the main content more room. Collapse
 * state is shared (useRightPanel) so the main content widens in tandem; it
 * persists in localStorage and the mount-effect avoids SSR/hydration mismatch.
 */
export function RightSidebarSlot(props: {
  fullName: string;
  roles: string[];
  avatarUrl: string | null;
  userId: string;
}) {
  const pathname = usePathname();
  const { collapsed, mounted, setCollapsed } = useRightPanel();
  const setState = setCollapsed;

  if (pathname.startsWith("/penjualan/pos")) return null;

  // Collapsed rail — icons re-open the panel.
  if (mounted && collapsed) {
    return (
      <div className="flex w-12 flex-shrink-0 flex-col items-center gap-1 rounded-md bg-[#262626] py-3">
        <RailButton title="Buka panel" onClick={() => setState(false)}>
          <PanelRightOpen size={18} />
        </RailButton>
        <div className="mt-2 flex flex-col items-center gap-2">
          <RailButton title="Profil" onClick={() => setState(false)}>
            <User size={17} />
          </RailButton>
          <RailButton title="Kalender" onClick={() => setState(false)}>
            <CalendarDays size={17} />
          </RailButton>
          <RailButton title="Aktivitas" onClick={() => setState(false)}>
            <Activity size={17} />
          </RailButton>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-[300px] flex-shrink-0 overflow-y-auto rounded-md bg-[#262626]">
      <button
        type="button"
        title="Sembunyikan panel"
        onClick={() => setState(true)}
        className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-md text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/70"
      >
        <PanelRightClose size={16} />
      </button>
      <RightSidebar {...props} />
    </div>
  );
}

function RailButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
    >
      {children}
    </button>
  );
}
