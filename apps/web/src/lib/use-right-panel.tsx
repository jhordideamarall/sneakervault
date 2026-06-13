"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "rsb:collapsed";

type RightPanelCtx = {
  collapsed: boolean;
  mounted: boolean;
  setCollapsed: (next: boolean) => void;
};

const Ctx = createContext<RightPanelCtx>({
  collapsed: false,
  mounted: false,
  setCollapsed: () => {},
});

/**
 * Shared right-sidebar collapse state so BOTH the right panel and the main
 * content react together — collapsing the panel genuinely widens the content
 * instead of just adding empty margin. Persisted to localStorage; mount-effect
 * avoids SSR/hydration mismatch.
 */
export function RightPanelProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
      setCollapsedState(localStorage.getItem(STORAGE_KEY) === "1");
    });
  }, []);

  function setCollapsed(next: boolean) {
    setCollapsedState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  return (
    <Ctx.Provider value={{ collapsed, mounted, setCollapsed }}>
      {children}
    </Ctx.Provider>
  );
}

export function useRightPanel() {
  return useContext(Ctx);
}
