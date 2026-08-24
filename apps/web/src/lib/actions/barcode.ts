"use server";

import { createClient } from "@sneakervault/supabase/server";
import { requireRole } from "./auth";

const ROLES = ["owner", "admin_gudang"] as const;

export type LabelProduct = {
  id: string;
  brand: string;
  model: string;
  color: string | null;
  size: number;
  size_label: string;
  sku: string;
  barcode: string;
  quantity: number;
};

/**
 * Search products for printing barcode labels. Labels MUST use a product's real
 * stored `barcode` so a later scan actually resolves to that product — no more
 * orphan/random codes.
 */
export async function searchProductsForLabel(query: string): Promise<LabelProduct[]> {
  await requireRole([...ROLES]);
  const q = query.trim();
  if (q.length < 1) return [];
  const supabase = await createClient();
  const pattern = `%${q}%`;
  const { data } = await supabase
    .from("products")
    .select("id, brand, model, color, size, size_label, sku, barcode, quantity")
    .or(`brand.ilike.${pattern},model.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern}`)
    .eq("is_active", true)
    .order("brand")
    .limit(20);
  return (data ?? []).map((p) => ({
    id: p.id,
    brand: p.brand,
    model: p.model,
    color: p.color,
    size: Number(p.size),
    size_label: p.size_label,
    sku: p.sku,
    barcode: p.barcode,
    quantity: Number(p.quantity),
  }));
}
