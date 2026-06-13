"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@sneakervault/supabase/client";

const routeTables: Array<{ match: (pathname: string) => boolean; tables: string[] }> = [
  {
    match: (pathname) => pathname === "/workspace" || pathname === "/overview",
    tables: ["products", "packing_sessions", "packing_items", "returns", "delete_requests"],
  },
  {
    match: (pathname) => pathname.startsWith("/inventory"),
    tables: ["products", "stock_opname_sessions"],
  },
  {
    match: (pathname) =>
      pathname.startsWith("/orders") ||
      pathname.startsWith("/outbound") ||
      pathname.startsWith("/sold") ||
      pathname.startsWith("/returns"),
    tables: ["packing_sessions", "packing_items", "returns", "products"],
  },
  {
    match: (pathname) => pathname.startsWith("/penjualan"),
    tables: ["products", "packing_sessions", "packing_items", "sales_invoices", "bank_transactions"],
  },
  {
    match: (pathname) => pathname.startsWith("/pembelian"),
    tables: ["products", "purchase_batches", "purchase_orders", "purchase_invoices", "bank_transactions"],
  },
  {
    match: (pathname) => pathname.startsWith("/kas-bank"),
    tables: ["bank_transactions", "sales_invoices", "purchase_invoices"],
  },
  {
    match: (pathname) =>
      pathname.startsWith("/reports") ||
      pathname.startsWith("/laporan-keuangan") ||
      pathname.startsWith("/buku-besar") ||
      pathname.startsWith("/finance"),
    tables: [
      "products",
      "packing_sessions",
      "packing_items",
      "purchase_invoices",
      "sales_invoices",
      "bank_transactions",
    ],
  },
  {
    match: (pathname) => pathname.startsWith("/delete-requests"),
    tables: ["delete_requests"],
  },
];

function realtimeTablesForPath(pathname: string) {
  const tables = new Set<string>();
  for (const route of routeTables) {
    if (route.match(pathname)) {
      route.tables.forEach((table) => tables.add(table));
    }
  }
  return Array.from(tables);
}

/**
 * Route-scoped realtime listener. It refreshes server components only for the
 * tables the current page actually reads, instead of refetching the whole app
 * on every write to any operational table.
 */
export function useRealtimeRefresh() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const tables = realtimeTablesForPath(pathname);
    if (tables.length === 0) return;

    const supabase = createClient();
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const debouncedRefresh = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => router.refresh(), 800);
    };

    const channelName = `global-realtime:${crypto.randomUUID()}`;
    let channel = supabase.channel(channelName);
    for (const table of tables) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        debouncedRefresh,
      );
    }
    channel.subscribe();

    return () => {
      if (timeout) clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [pathname, router]);
}
