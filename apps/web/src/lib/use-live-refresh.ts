"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@sneakervault/supabase/client";

/**
 * Subscribe to postgres_changes on a list of tables and call router.refresh()
 * whenever any of them change. Keeps server-rendered pages fresh without
 * polling.
 */
export function useLiveRefresh(tables: string[], debounceMs = 400) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const channels = tables.map((table) =>
      supabase
        .channel(`live-${table}:${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => router.refresh(), debounceMs);
          }
        )
        .subscribe()
    );

    return () => {
      if (timer) clearTimeout(timer);
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [tables, debounceMs, router]);
}
