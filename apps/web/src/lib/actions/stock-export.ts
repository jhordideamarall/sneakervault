"use server";

import { createClient } from "@sneakervault/supabase/server";
import { requireRole } from "./auth";
import type { ExportChannel } from "@/lib/marketplace/export";

const ROLES = ["owner", "finance", "admin_online"] as const;

export type StockExportRow = {
  quantity: number;
  sell_price: number;
};

/**
 * Resolve marketplace seller SKUs to current system stock + price, by exact SKU
 * first then the learned marketplace_sku_map. Read-only: stock export never
 * mutates the database. Returns a map keyed by the marketplace SKU passed in.
 */
export async function getStockForExport(
  channel: ExportChannel,
  skus: string[],
): Promise<Record<string, StockExportRow>> {
  await requireRole([...ROLES]);
  const supabase = await createClient();

  const unique = Array.from(new Set(skus.map((s) => s.trim()).filter(Boolean)));
  if (unique.length === 0) return {};

  const out: Record<string, StockExportRow> = {};

  // 1. Exact SKU match.
  const { data: exact } = await supabase
    .from("products")
    .select("sku, quantity, sell_price")
    .in("sku", unique);
  for (const p of exact ?? []) {
    out[p.sku] = { quantity: Number(p.quantity), sell_price: Number(p.sell_price) };
  }

  // 2. Learned map for the rest.
  const remaining = unique.filter((s) => !(s in out));
  if (remaining.length > 0) {
    const { data: maps } = await supabase
      .from("marketplace_sku_map")
      .select("marketplace_sku, product_id")
      .eq("channel", channel)
      .in("marketplace_sku", remaining);
    const pids = Array.from(new Set((maps ?? []).map((m) => m.product_id)));
    if (pids.length > 0) {
      const { data: prods } = await supabase
        .from("products")
        .select("id, quantity, sell_price")
        .in("id", pids);
      const byId = new Map(
        (prods ?? []).map((p) => [p.id, { quantity: Number(p.quantity), sell_price: Number(p.sell_price) }]),
      );
      for (const m of maps ?? []) {
        const row = byId.get(m.product_id);
        if (row) out[m.marketplace_sku] = row;
      }
    }
  }

  return out;
}
