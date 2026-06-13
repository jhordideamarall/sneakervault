"use server";

import { createClient } from "@sneakervault/supabase/server";
import { requireRole } from "./auth";
import type { ExportChannel } from "@/lib/marketplace/export";

const ROLES = ["owner", "finance", "admin_online"] as const;
const QUERY_CHUNK_SIZE = 100;

export type StockExportRow = {
  quantity: number;
  sell_price: number;
};

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

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
  for (const chunk of chunks(unique, QUERY_CHUNK_SIZE)) {
    const { data: exact, error } = await supabase
      .from("products")
      .select("sku, quantity, sell_price")
      .in("sku", chunk);
    if (error) throw new Error(`Gagal membaca stok produk: ${error.message}`);
    for (const p of exact ?? []) {
      out[p.sku] = { quantity: Number(p.quantity), sell_price: Number(p.sell_price) };
    }
  }

  // 2. Learned map for the rest.
  const remaining = unique.filter((s) => !(s in out));
  if (remaining.length > 0) {
    const maps: Array<{ marketplace_sku: string; product_id: string }> = [];
    for (const chunk of chunks(remaining, QUERY_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from("marketplace_sku_map")
        .select("marketplace_sku, product_id")
        .eq("channel", channel)
        .in("marketplace_sku", chunk);
      if (error) throw new Error(`Gagal membaca mapping marketplace: ${error.message}`);
      maps.push(...(data ?? []));
    }

    const pids = Array.from(new Set((maps ?? []).map((m) => m.product_id)));
    if (pids.length > 0) {
      const prods: Array<{ id: string; quantity: number; sell_price: number }> = [];
      for (const chunk of chunks(pids, QUERY_CHUNK_SIZE)) {
        const { data, error } = await supabase
          .from("products")
          .select("id, quantity, sell_price")
          .in("id", chunk);
        if (error) throw new Error(`Gagal membaca produk hasil mapping: ${error.message}`);
        prods.push(...(data ?? []));
      }
      const byId = new Map(
        prods.map((p) => [p.id, { quantity: Number(p.quantity), sell_price: Number(p.sell_price) }]),
      );
      for (const m of maps ?? []) {
        const row = byId.get(m.product_id);
        if (row) out[m.marketplace_sku] = row;
      }
    }
  }

  return out;
}
