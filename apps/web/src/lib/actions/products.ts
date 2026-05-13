"use server";

import { createClient } from "@sneakervault/supabase/server";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { notifyEvent } from "./notify";
import {
  productUpdateSchema,
  productConditionInputSchema,
} from "@sneakervault/shared";
import { z } from "zod";

const importRowSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  sku: z.string().min(1),
  size: z.coerce.number().positive(),
  color: z.string().optional(),
  barcode: z.string().min(1),
  sell_price: z.coerce.number().nonnegative().default(0),
  price_offline: z.coerce.number().nonnegative().default(0),
});

export type ImportProductRow = z.infer<typeof importRowSchema>;

const createProductSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  sku: z.string().min(1),
  size: z.coerce.number().positive(),
  color: z.string().optional(),
  barcode: z.string().min(1),
  sell_price: z.coerce.number().nonnegative().default(0),
  price_offline: z.coerce.number().nonnegative().default(0),
  image_url: z.string().url().nullable().optional().or(z.literal("")),
  quantity: z.number().default(0),
  hpp: z.number().default(0),
});

export async function createProduct(input: unknown) {
  const profile = await requireRole(["owner", "admin_gudang"]);
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const payload = {
    ...parsed.data,
    // price_offline default to sell_price if not set
    price_offline: parsed.data.price_offline || parsed.data.sell_price,
    image_url: parsed.data.image_url || null,
    is_active: true,
  };

  const { data, error } = await supabase
    .from("products")
    .insert(payload)
    .select()
    .single();

  if (error) return { error: { _form: [error.message] } };
  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "product",
    entity_id: data.id,
    new_data: data,
  });
  return { data };
}

export async function bulkImportProducts(rows: unknown[]): Promise<{
  inserted: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}> {
  const profile = await requireRole(["owner", "admin_gudang"]);
  const supabase = await createClient();

  let inserted = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const parsed = importRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      errors.push({
        row: i + 2, // header + 1-indexed
        reason: parsed.error.issues
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("; "),
      });
      continue;
    }

    // Check if already exists by barcode
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("barcode", parsed.data.barcode)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from("products").insert({
      ...parsed.data,
      price_offline: parsed.data.price_offline || parsed.data.sell_price,
      quantity: 0,
      hpp: 0,
      is_active: true,
    });

    if (error) {
      errors.push({ row: i + 2, reason: error.message });
    } else {
      inserted++;
    }
  }

  if (inserted > 0) {
    await logActivity({
      user_id: profile.id,
      action: "create",
      entity_type: "product",
      new_data: { imported: inserted, skipped, errors: errors.length },
    });
  }

  return { inserted, skipped, errors };
}

/**
 * Legacy: manual HPP override per model. Kept for Phase 1 backward compat.
 * In Phase 2+ saat auto-journal active, manual HPP override wajib lewat
 * journal adjustment (audit trail).
 */
export async function updateModelHpp(
  brand: string,
  model: string,
  newHpp: number,
) {
  const profile = await requireRole(["owner"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("products")
    .update({ hpp: newHpp, updated_at: new Date().toISOString() })
    .eq("brand", brand)
    .eq("model", model)
    .eq("is_active", true);

  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "product",
    new_data: {
      brand,
      model,
      manual_hpp: newHpp,
      note: "Manual HPP override by owner",
    },
  });

  return { success: true };
}

export async function updateProduct(input: unknown) {
  const profile = await requireRole(["owner", "admin_gudang", "finance"]);
  const parsed = productUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { id, ...patch } = parsed.data;
  const supabase = await createClient();

  // Role-based field gating:
  //  - owner:        can edit everything (price, color, image, supplier)
  //  - finance:      can edit prices only (role is finance-focused)
  //  - admin_gudang: can edit color, image, supplier (operational data)
  const isOwner = profile.roles?.includes("owner");
  const isFinance = profile.roles?.includes("finance");
  const canEditPrice = isOwner || isFinance;

  if (!canEditPrice) {
    delete (patch as { sell_price?: number }).sell_price;
    delete (patch as { price_offline?: number }).price_offline;
  }
  // Admin gudang cannot edit supplier (locked to owner/finance)
  if (!isOwner && !isFinance) {
    delete (patch as { default_supplier_id?: string | null }).default_supplier_id;
  }

  // Normalize image_url: empty string → null (DB constraint-friendly)
  if ((patch as { image_url?: string | null }).image_url === "") {
    (patch as { image_url?: string | null }).image_url = null;
  }

  const { error } = await supabase.from("products").update(patch).eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "product",
    entity_id: id,
    new_data: patch,
  });

  return { success: true };
}

/**
 * Ubah status fisik produk (normal / defect / dormant).
 *
 * Dipanggil dari inventory UI. Memakai RPC `update_product_condition` yang
 * sudah include audit log ke `product_condition_history`. Owner di-notify
 * secara realtime via activity log feed.
 */
export async function updateProductCondition(input: unknown) {
  const profile = await requireRole(["owner", "admin_gudang"]);
  const parsed = productConditionInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { product_id, new_condition, reason } = parsed.data;
  const supabase = await createClient();

  // Fetch product before change for notification context
  const { data: before } = await supabase
    .from("products")
    .select("brand, model, size, condition")
    .eq("id", product_id)
    .maybeSingle();

  const { error } = await supabase.rpc("update_product_condition", {
    p_product_id: product_id,
    p_new_condition: new_condition,
    p_reason: reason ?? null,
  });

  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "product",
    entity_id: product_id,
    old_data: before ? { condition: before.condition } : undefined,
    new_data: { condition: new_condition, reason },
  });

  // Notify owner if condition changed (untuk visibility — aktivitas di gudang)
  if (before) {
    const productLabel = `${before.brand} ${before.model} size ${before.size}`;
    await notifyEvent(
      {
        type: "product.condition_changed",
        productId: product_id,
        productLabel,
        previousCondition: before.condition ?? "normal",
        newCondition: new_condition,
        reason,
      },
      { actorId: profile.id },
    );
  }

  return { success: true };
}

/**
 * Fuzzy search produk (samba ≈ cloud white). Menggunakan pg_trgm via
 * SQL function `search_products_fuzzy`. Fallback ke ILIKE kalau extension
 * belum ter-install (migration belum di-apply).
 */
export async function searchProductsFuzzy(
  query: string,
  limit = 50,
): Promise<unknown[]> {
  await requireRole([
    "owner",
    "admin_gudang",
    "admin_online",
    "shopkeeper",
    "finance",
  ]);
  if (!query || query.trim().length < 2) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_products_fuzzy", {
    p_query: query.trim(),
    p_limit: limit,
    p_threshold: 0.2,
  });

  if (error) {
    // Fallback to ILIKE if RPC not available (pre-migration)
    const pattern = `%${query.trim()}%`;
    const { data: fallback } = await supabase
      .from("products")
      .select(
        "id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, price_offline, image_url, condition",
      )
      .or(
        `brand.ilike.${pattern},model.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern},color.ilike.${pattern}`,
      )
      .eq("is_active", true)
      .limit(limit);
    return fallback ?? [];
  }

  return data ?? [];
}
