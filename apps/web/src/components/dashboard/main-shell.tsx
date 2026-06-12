"use client";

import { usePathname } from "next/navigation";
import { useRightPanel } from "@/lib/use-right-panel";

/**
 * Wraps the dashboard main content. POS kasir runs full-bleed; every other
 * page keeps a padded column that WIDENS when the right sidebar is collapsed —
 * so collapsing genuinely gives more room instead of just empty margin.
 */
export function MainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { collapsed, mounted } = useRightPanel();
  const isPos = pathname.startsWith("/penjualan/pos");
  const wide = mounted && collapsed;

  return (
    <main
      className={
        isPos
          ? "h-full overflow-hidden p-2"
          : "h-full overflow-y-auto px-8 pt-16 pb-8"
      }
    >
      <div
        className={
          isPos
            ? "h-full"
            : `mx-auto w-full ${wide ? "max-w-none" : "max-w-5xl"}`
        }
      >
        {children}
      </div>
    </main>
  );
}
