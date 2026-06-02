"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps the dashboard main content. POS kasir runs full-bleed; every other
 * page keeps the standard padded, max-width column. Client-side so it reacts
 * to soft navigation (the server layout persists across route changes).
 */
export function MainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPos = pathname.startsWith("/penjualan/pos");

  return (
    <main
      className={
        isPos
          ? "h-full overflow-hidden p-2"
          : "h-full overflow-y-auto px-8 pt-16 pb-8"
      }
    >
      <div className={isPos ? "h-full" : "mx-auto max-w-4xl"}>{children}</div>
    </main>
  );
}
