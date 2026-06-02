"use client";

import { usePathname } from "next/navigation";
import { RightSidebar } from "./right-sidebar";

/**
 * Renders the right sidebar on every dashboard page EXCEPT POS kasir.
 * Client-side (usePathname) so it reacts to soft navigation correctly.
 */
export function RightSidebarSlot(props: {
  fullName: string;
  roles: string[];
  avatarUrl: string | null;
  userId: string;
}) {
  const pathname = usePathname();
  if (pathname.startsWith("/penjualan/pos")) return null;

  return (
    <div className="w-[300px] flex-shrink-0 overflow-y-auto rounded-md bg-[#262626]">
      <RightSidebar {...props} />
    </div>
  );
}
