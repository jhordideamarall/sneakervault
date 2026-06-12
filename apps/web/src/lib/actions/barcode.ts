"use server";

import { createClient } from "@sneakervault/supabase/server";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";

const ROLES = ["owner", "admin_gudang"] as const;

export type LabelProduct = {
  id: string;
  brand: string;
  model: string;
  color: string | null;
  size: number;
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
    .select("id, brand, model, color, size, sku, barcode, quantity")
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
    sku: p.sku,
    barcode: p.barcode,
    quantity: Number(p.quantity),
  }));
}

function genCode(): string {
  return String(Date.now()).slice(-7) + String(Math.floor(Math.random() * 90) + 10);
}

/**
 * Assign a fresh UNIQUE barcode to a product and persist it (products.barcode).
 * Use when a product's barcode is a placeholder (e.g. = SKU) and you want a
 * dedicated scannable code. Returns the new barcode.
 */
export async function regenerateProductBarcode(
  productId: string,
): Promise<{ barcode?: string; error?: string }> {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();

  // Find a code not yet used by any product.
  let code = "";
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = genCode();
    const { data: clash } = await supabase
      .from("products")
      .select("id")
      .eq("barcode", candidate)
      .maybeSingle();
    if (!clash) {
      code = candidate;
      break;
    }
  }
  if (!code) return { error: "Gagal membuat kode unik, coba lagi" };

  const { error } = await supabase
    .from("products")
    .update({ barcode: code, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "product",
    entity_id: productId,
    new_data: { barcode: code },
  });
  return { barcode: code };
}
