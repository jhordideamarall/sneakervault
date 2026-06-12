"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@sneakervault/supabase/client";

/**
 * Global realtime listener — subscribes to key tables and triggers
 * router.refresh() so server components re-fetch fresh data.
 * Debounced to avoid excessive refreshes on burst events.
 */
export function useRealtimeRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const debouncedRefresh = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => router.refresh(), 300);
    };

    const channelName = `global-realtime:${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_logs" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "packing_sessions" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "packing_items" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "returns" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "delete_requests" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_batches" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_invoices" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_invoices" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_opname_sessions" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "bank_transactions" }, debouncedRefresh)
      .subscribe();

    return () => {
      if (timeout) clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [router]);
}
