"use server";

import { createClient } from "@sneakervault/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { notifyEvent } from "./notify";
import { createStockMovement } from "./stock-movements";
import {
  addProductVariantsToSkuSchema,
  createProductVariantsBatchSchema,
  productUpdateSchema,
  productConditionInputSchema,
} from "@sneakervault/shared";
import { z } from "zod";
import type { ProductImportChannel } from "@/lib/marketplace/product-import";

const importRowSchema = z.object({
  brand: z.string().trim().min(1),
  model: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  // Free-text size label (mis. "42 2/3"). Dipetakan ke kolom size_label;
  // numerik `size` diturunkan trigger DB. coerce agar angka CSV (40) jadi "40".
  size: z.coerce.string().trim().min(1),
  color: z.string().trim().optional(),
  // Barcode berasal dari Accurate dan wajib unik untuk setiap variant size.
  barcode: z.preprocess(
    (value) => (value == null ? "" : String(value)),
    z.string().trim().min(1, "Barcode Accurate wajib diisi"),
  ),
  quantity: z.preprocess(numberInputOrZero, z.coerce.number().int().nonnegative()),
  hpp: z.preprocess(numberInputOrZero, z.coerce.number().nonnegative()),
  sell_price: z.preprocess(numberInputOrZero, z.coerce.number().nonnegative()),
  price_offline: z.preprocess(numberInputOrZero, z.coerce.number().nonnegative()),
  // Harga per-channel (opsional; kosong = fallback ke sell_price).
  price_website: z.preprocess(numberInputOrUndefined, z.coerce.number().nonnegative().optional()),
  price_shopee: z.preprocess(numberInputOrUndefined, z.coerce.number().nonnegative().optional()),
  price_tiktok: z.preprocess(numberInputOrUndefined, z.coerce.number().nonnegative().optional()),
  price_tokopedia: z.preprocess(numberInputOrUndefined, z.coerce.number().nonnegative().optional()),
});

function normalizeNumberInput(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-" || /^Rp\s*-$/i.test(raw)) return undefined;
  const cleaned = raw
    .replace(/Rp/gi, "")
    .replace(/\s/g, "")
    .replace(/,/g, "");
  if (!cleaned || cleaned === "-") return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : value;
}

function numberInputOrZero(value: unknown) {
  return normalizeNumberInput(value) ?? 0;
}

function numberInputOrUndefined(value: unknown) {
  return normalizeNumberInput(value);
}

export type ImportProductRow = z.infer<typeof importRowSchema>;

const marketplaceProductImportRowSchema = importRowSchema.extend({
  marketplace_sku: z.string().trim().min(1),
  marketplace_product_id: z.string().trim().optional(),
  marketplace_variation_id: z.string().trim().optional(),
  // size numerik utk match lintas-sumber (38 1/2 & 38.5 → 38.5).
  size_value: z.coerce.number().optional(),
});

type MarketplaceProductImportRow = z.infer<typeof marketplaceProductImportRowSchema>;

type ParsedImportProductRow = {
  row: number;
  data: ImportProductRow;
  seedKey: string;
};

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function parseSeedSize(value: unknown) {
  const raw = String(value ?? "")
    .trim()
    .replace(/,/g, ".")
    .replace(/^[^0-9]+/, "")
    .trim();
  if (!raw) return null;

  if (/^[0-9]{2}5$/.test(raw)) {
    return Number(raw.slice(0, 2)) + 0.5;
  }

  const mixedFraction = raw.match(/^([0-9]+) +([0-9]+)\/([0-9]+)$/);
  if (mixedFraction) {
    const denominator = Number(mixedFraction[3]);
    if (denominator === 0) return null;
    return Number(mixedFraction[1]) + Number(mixedFraction[2]) / denominator;
  }

  const pureFraction = raw.match(/^([0-9]+)\/([0-9]+)$/);
  if (pureFraction) {
    const denominator = Number(pureFraction[2]);
    if (denominator === 0) return null;
    return Number(pureFraction[1]) / denominator;
  }

  const plain = raw.match(/^[0-9]+\.?[0-9]*/)?.[0];
  const parsed = Number(plain);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function seedSizeValue(row: { size: string; size_value?: number | null }) {
  if (typeof row.size_value === "number" && Number.isFinite(row.size_value) && row.size_value > 0) {
    return row.size_value;
  }
  return parseSeedSize(row.size);
}

function seedProductKey(sku: string, sizeNum: number) {
  return `${sku}\u0000${Math.round(sizeNum * 100) / 100}`;
}

function importPayload(row: ImportProductRow) {
  const fallbackPrice = row.price_offline || row.sell_price;
  return {
    brand: row.brand,
    model: row.model,
    sku: row.sku,
    size_label: row.size,
    color: row.color || null,
    barcode: row.barcode,
    quantity: row.quantity,
    hpp: row.hpp,
    sell_price: row.sell_price,
    price_offline: fallbackPrice,
    price_website: row.price_website ?? fallbackPrice,
    price_shopee: row.price_shopee ?? fallbackPrice,
    price_tiktok: row.price_tiktok ?? fallbackPrice,
    price_tokopedia: row.price_tokopedia ?? fallbackPrice,
    is_active: true,
    first_inbound_at: row.quantity > 0 ? new Date().toISOString() : null,
  };
}

export async function createProductVariantsBatch(input: unknown) {
  const profile = await requireRole(["owner", "admin_gudang", "finance"]);
  const parsed = createProductVariantsBatchSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const canEditPrice =
    profile.roles?.includes("owner") || profile.roles?.includes("finance");
  const shared = parsed.data.sharedProduct;
  const payload = parsed.data.variants.map((variant) => ({
    brand: shared.brand,
    model: shared.model,
    sku: shared.sku,
    color: shared.color,
    image_url: shared.image_url || null,
    hpp: canEditPrice ? shared.hpp : 0,
    size_label: variant.size_label,
    barcode: variant.barcode,
    sell_price: canEditPrice ? variant.sell_price : 0,
    price_offline: canEditPrice ? variant.price_offline : 0,
    price_website: canEditPrice ? variant.price_website : 0,
    price_shopee: canEditPrice ? variant.price_shopee : 0,
    price_tiktok: canEditPrice ? variant.price_tiktok : 0,
    price_tokopedia: canEditPrice ? variant.price_tokopedia : 0,
    quantity: 0,
    is_active: true,
  }));

  const { data, error } = await supabase
    .from("products")
    .insert(payload)
    .select("id, sku, size_label, barcode");

  if (error) {
    if (error.code === "23505" && error.message.toLowerCase().includes("barcode")) {
      return {
        error: { _form: ["Salah satu barcode sudah dipakai. Tidak ada variant yang disimpan."] },
      };
    }
    if (
      error.code === "23505" &&
      (error.message.includes("idx_products_sku_sizenum") ||
        error.message.toLowerCase().includes("sku"))
    ) {
      return {
        error: { _form: ["Salah satu size untuk SKU ini sudah terdaftar. Tidak ada variant yang disimpan."] },
      };
    }
    return { error: { _form: [error.message] } };
  }

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "product",
    entity_id: data?.[0]?.id,
    new_data: {
      sku: shared.sku,
      variants: data ?? [],
      created_count: data?.length ?? 0,
    },
  });

  revalidatePath("/inventory");
  revalidatePath("/barcode-generate");
  return { data };
}

export async function addProductVariantsToSku(input: unknown) {
  const profile = await requireRole(["owner", "admin_gudang", "finance"]);
  const parsed = addProductVariantsToSkuSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const canEditPrice =
    profile.roles?.includes("owner") || profile.roles?.includes("finance");

  const { data: source, error: sourceError } = await supabase
    .from("products")
    .select(
      "brand, model, sku, color, image_url, hpp, default_supplier_id",
    )
    .eq("id", parsed.data.source_product_id)
    .maybeSingle();

  if (sourceError) return { error: { _form: [sourceError.message] } };
  if (!source) {
    return { error: { _form: ["Produk sumber tidak ditemukan"] } };
  }

  const payload = parsed.data.variants.map((variant) => ({
    brand: source.brand,
    model: source.model,
    sku: source.sku,
    color: source.color,
    image_url: source.image_url,
    hpp: source.hpp,
    default_supplier_id: source.default_supplier_id,
    size_label: variant.size_label,
    barcode: variant.barcode,
    sell_price: canEditPrice ? variant.sell_price : 0,
    price_offline: canEditPrice ? variant.price_offline : 0,
    price_website: canEditPrice ? variant.price_website : 0,
    price_shopee: canEditPrice ? variant.price_shopee : 0,
    price_tiktok: canEditPrice ? variant.price_tiktok : 0,
    price_tokopedia: canEditPrice ? variant.price_tokopedia : 0,
    quantity: 0,
    is_active: true,
  }));
  const { data, error } = await supabase
    .from("products")
    .insert(payload)
    .select("id, sku, size_label, barcode");

  if (error) {
    if (error.code === "23505" && error.message.toLowerCase().includes("barcode")) {
      return {
        error: {
          _form: ["Salah satu barcode sudah dipakai. Tidak ada size yang disimpan."],
        },
      };
    }
    if (
      error.code === "23505" &&
      (error.message.includes("idx_products_sku_sizenum") ||
        error.message.toLowerCase().includes("sku"))
    ) {
      return {
        error: {
          _form: ["Salah satu size sudah terdaftar. Tidak ada size yang disimpan."],
        },
      };
    }
    return { error: { _form: [error.message] } };
  }

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "product",
    entity_id: data?.[0]?.id,
    new_data: {
      sku: source.sku,
      variants: data ?? [],
      created_count: data?.length ?? 0,
      source_product_id: parsed.data.source_product_id,
    },
  });

  revalidatePath("/inventory");
  revalidatePath("/barcode-generate");
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
  const parsedRows: ParsedImportProductRow[] = [];
  const seenBarcodes = new Set<string>();
  const seenSkus = new Set<string>();
  const seenProductKeys = new Set<string>();

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

    const sizeNum = seedSizeValue(parsed.data);
    if (sizeNum == null) {
      errors.push({ row: i + 2, reason: "Size harus numerik atau pecahan valid" });
      continue;
    }
    const productKey = seedProductKey(parsed.data.sku, sizeNum);

    // Identitas produk = (sku, size). SKU colorway berulang antar size = variant,
    // bukan duplikat. Dedup sama dengan unique DB: (sku, round(size, 2)).
    if (seenProductKeys.has(productKey) || seenBarcodes.has(parsed.data.barcode)) {
      skipped++;
      continue;
    }

    seenProductKeys.add(productKey);
    seenBarcodes.add(parsed.data.barcode);
    seenSkus.add(parsed.data.sku);
    parsedRows.push({ row: i + 2, data: parsed.data, seedKey: productKey });
  }

  if (parsedRows.length === 0) {
    return { inserted, skipped, errors };
  }

  const existingBarcodes = new Set<string>();
  const existingProductKeys = new Set<string>();

  for (const batch of chunk([...seenBarcodes], 100)) {
    const { data, error } = await supabase
      .from("products")
      .select("barcode")
      .in("barcode", batch);
    if (error) {
      return {
        inserted,
        skipped,
        errors: [{ row: 1, reason: `Cek barcode gagal: ${error.message}` }, ...errors],
      };
    }
    for (const product of data ?? []) {
      if (product.barcode) existingBarcodes.add(product.barcode);
    }
  }

  for (const batch of chunk([...seenSkus], 100)) {
    const { data, error } = await supabase
      .from("products")
      .select("sku, size")
      .in("sku", batch);
    if (error) {
      return {
        inserted,
        skipped,
        errors: [{ row: 1, reason: `Cek SKU gagal: ${error.message}` }, ...errors],
      };
    }
    for (const product of data ?? []) {
      const sizeNum = Number(product.size);
      if (product.sku && Number.isFinite(sizeNum) && sizeNum > 0) {
        existingProductKeys.add(seedProductKey(product.sku, sizeNum));
      }
    }
  }

  const toInsert: ParsedImportProductRow[] = [];
  for (const row of parsedRows) {
    if (existingProductKeys.has(row.seedKey) || existingBarcodes.has(row.data.barcode)) {
      skipped++;
    } else {
      toInsert.push(row);
    }
  }

  for (const batch of chunk(toInsert, 100)) {
    const { error } = await supabase
      .from("products")
      .insert(batch.map((row) => importPayload(row.data)));

    if (!error) {
      inserted += batch.length;
      continue;
    }

    for (const row of batch) {
      const { error: rowError } = await supabase
        .from("products")
        .insert(importPayload(row.data));
      if (rowError) {
        errors.push({ row: row.row, reason: rowError.message });
      } else {
        inserted++;
      }
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

export async function bulkImportMarketplaceProducts(
  channel: ProductImportChannel,
  rows: unknown[],
): Promise<{
  inserted: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}> {
  const parsedChannel = z.enum(["shopee", "tiktok", "tokopedia"]).safeParse(channel);
  if (!parsedChannel.success) {
    return { inserted: 0, skipped: 0, errors: [{ row: 1, reason: "Channel marketplace tidak dikenal" }] };
  }

  const profile = await requireRole(["owner"]);
  const supabase = await createClient();

  let inserted = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];
  const parsedRows: Array<{ row: number; data: MarketplaceProductImportRow; seedKey: string }> = [];
  const seenSkus = new Set<string>();
  const seenBarcodes = new Set<string>();
  const seenMarketplaceSkus = new Set<string>();
  const seenProductKeys = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const parsed = marketplaceProductImportRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      errors.push({
        row: i + 2,
        reason: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      });
      continue;
    }

    const sizeNum = seedSizeValue(parsed.data);
    if (sizeNum == null) {
      errors.push({ row: i + 2, reason: "Size harus numerik atau pecahan valid" });
      continue;
    }
    const productKey = seedProductKey(parsed.data.sku, sizeNum);

    // SKU = colorway (berulang antar size) → JANGAN dedup by sku. Identitas varian
    // = (sku, round(size, 2)); marketplace_sku hanya kunci mapping per-varian.
    const duplicate =
      seenProductKeys.has(productKey) ||
      seenBarcodes.has(parsed.data.barcode) ||
      seenMarketplaceSkus.has(parsed.data.marketplace_sku);
    if (duplicate) {
      skipped++;
      continue;
    }
    seenProductKeys.add(productKey);
    seenSkus.add(parsed.data.sku);
    seenBarcodes.add(parsed.data.barcode);
    seenMarketplaceSkus.add(parsed.data.marketplace_sku);
    parsedRows.push({ row: i + 2, data: parsed.data, seedKey: productKey });
  }

  if (parsedRows.length === 0) return { inserted, skipped, errors };

  // Match lintas-sumber: kunci = (sku + size numerik dibulatkan 2 desimal).
  // "38 1/2" (marketplace) & "38.5" (seed internal) → 38.5 → produk SAMA → di-map (bukan dobel).
  const existingByKey = new Map<
    string,
    { id: string; price_shopee: number | null; price_tiktok: number | null }
  >();
  for (const batch of chunk([...seenSkus], 100)) {
    const { data, error } = await supabase
      .from("products")
      .select("id, sku, size, price_shopee, price_tiktok")
      .in("sku", batch);
    if (error) return { inserted, skipped, errors: [{ row: 1, reason: `Cek SKU gagal: ${error.message}` }, ...errors] };
    for (const p of data ?? [])
      if (Number.isFinite(Number(p.size)) && Number(p.size) > 0) {
        existingByKey.set(seedProductKey(p.sku, Number(p.size)), {
          id: p.id,
          price_shopee: p.price_shopee,
          price_tiktok: p.price_tiktok,
        });
      }
  }

  const mapRows: Array<{
    channel: ProductImportChannel;
    marketplace_sku: string;
    product_id: string;
    marketplace_product_id: string | null;
    marketplace_variation_id: string | null;
    created_by: string;
    updated_at: string;
  }> = [];
  const toInsert: Array<{ row: number; data: MarketplaceProductImportRow; seedKey: string }> = [];
  const priceUpdates: Array<{ id: string; patch: Record<string, number> }> = [];
  for (const row of parsedRows) {
    const existing = existingByKey.get(row.seedKey);
    if (existing) {
      skipped++;
      mapRows.push({
        channel: parsedChannel.data,
        marketplace_sku: row.data.marketplace_sku,
        product_id: existing.id,
        marketplace_product_id: row.data.marketplace_product_id ?? null,
        marketplace_variation_id: row.data.marketplace_variation_id ?? null,
        created_by: profile.id,
        updated_at: new Date().toISOString(),
      });
      // Produk sudah ada (seed internal): cuma UPDATE harga channel. HPP & stok TIDAK disentuh.
      const patch: Record<string, number> = {};
      if (parsedChannel.data === "shopee" && row.data.price_shopee != null) patch.price_shopee = row.data.price_shopee;
      if (parsedChannel.data === "tiktok" && row.data.price_tiktok != null) patch.price_tiktok = row.data.price_tiktok;
      if (parsedChannel.data === "tokopedia" && row.data.price_tokopedia != null) patch.price_tokopedia = row.data.price_tokopedia;
      if (Object.keys(patch).length > 0) priceUpdates.push({ id: existing.id, patch });
    } else {
      toInsert.push(row);
    }
  }

  for (const batch of chunk(toInsert, 100)) {
    const payload = batch.map((row) => importPayload(row.data));
    const { data, error } = await supabase
      .from("products")
      .insert(payload)
      .select("id, barcode");

    if (error) {
      for (const row of batch) {
        const { data: one, error: rowError } = await supabase
          .from("products")
          .insert(importPayload(row.data))
          .select("id, sku")
          .single();
        if (rowError || !one) {
          errors.push({ row: row.row, reason: rowError?.message ?? "Produk gagal dibuat" });
          continue;
        }
        inserted++;
        mapRows.push({
          channel: parsedChannel.data,
          marketplace_sku: row.data.marketplace_sku,
          product_id: one.id,
          marketplace_product_id: row.data.marketplace_product_id ?? null,
          marketplace_variation_id: row.data.marketplace_variation_id ?? null,
          created_by: profile.id,
          updated_at: new Date().toISOString(),
        });
        if (row.data.quantity > 0) {
          const movement = await createStockMovement(supabase, {
            product_id: one.id,
            type: "inbound",
            quantity: row.data.quantity,
            unit_cost: row.data.hpp,
            reference_type: "opening_balance",
            notes: `Bootstrap ${parsedChannel.data} template: stok awal dari marketplace, HPP ${row.data.hpp}`,
          });
          if (movement.error) errors.push({ row: row.row, reason: `Stock movement: ${movement.error}` });
        }
      }
      continue;
    }

    const byBarcode = new Map((data ?? []).map((product) => [product.barcode, product.id]));
    inserted += data?.length ?? 0;
    for (const row of batch) {
      const productId = byBarcode.get(row.data.barcode);
      if (!productId) continue;
      mapRows.push({
        channel: parsedChannel.data,
        marketplace_sku: row.data.marketplace_sku,
        product_id: productId,
        marketplace_product_id: row.data.marketplace_product_id ?? null,
        marketplace_variation_id: row.data.marketplace_variation_id ?? null,
        created_by: profile.id,
        updated_at: new Date().toISOString(),
      });
      if (row.data.quantity > 0) {
        const movement = await createStockMovement(supabase, {
          product_id: productId,
          type: "inbound",
          quantity: row.data.quantity,
          unit_cost: row.data.hpp,
          reference_type: "opening_balance",
          notes: `Bootstrap ${parsedChannel.data} template: stok awal dari marketplace, HPP ${row.data.hpp}`,
        });
        if (movement.error) errors.push({ row: row.row, reason: `Stock movement: ${movement.error}` });
      }
    }
  }

  // Update harga channel pada produk internal yang ter-map (HPP & stok tetap milik internal).
  for (const u of priceUpdates) {
    const { error } = await supabase.from("products").update(u.patch).eq("id", u.id);
    if (error) errors.push({ row: 1, reason: `Update harga channel gagal: ${error.message}` });
  }

  for (const batch of chunk(mapRows, 100)) {
    const { error } = await supabase
      .from("marketplace_sku_map")
      .upsert(batch, { onConflict: "channel,marketplace_sku" });
    if (error) errors.push({ row: 1, reason: `Mapping marketplace gagal: ${error.message}` });
  }

  if (inserted > 0 || mapRows.length > 0) {
    await logActivity({
      user_id: profile.id,
      action: "create",
      entity_type: "product",
      new_data: {
        source: `marketplace:${parsedChannel.data}`,
        imported: inserted,
        skipped,
        mapped: mapRows.length,
        errors: errors.length,
      },
    });
  }

  revalidatePath("/inventory");
  revalidatePath("/penjualan/export-stok");
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
  //  - owner:        can edit everything (identity, price, color, image, supplier)
  //  - finance:      can edit prices only (role is finance-focused)
  //  - admin_gudang: can edit identity, color, and image (operational data)
  const isOwner = profile.roles?.includes("owner");
  const isFinance = profile.roles?.includes("finance");
  const isAdminGudang = profile.roles?.includes("admin_gudang");
  const canEditPrice = isOwner || isFinance;

  if (!canEditPrice) {
    delete (patch as { hpp?: number }).hpp;
    delete (patch as { sell_price?: number }).sell_price;
    delete (patch as { price_offline?: number }).price_offline;
    delete (patch as { price_website?: number | null }).price_website;
    delete (patch as { price_shopee?: number | null }).price_shopee;
    delete (patch as { price_tiktok?: number | null }).price_tiktok;
    delete (patch as { price_tokopedia?: number | null }).price_tokopedia;
  }
  // Admin gudang cannot edit supplier (locked to owner/finance).
  if (!isOwner && !isFinance) {
    delete (patch as { default_supplier_id?: string | null }).default_supplier_id;
  }

  // Identitas produk hanya boleh diubah owner / admin_gudang. Ini penting
  // agar finance tetap fokus pada harga dan tidak bisa mengubah SKU/barcode.
  if (!isOwner && !isAdminGudang) {
    delete (patch as { brand?: string }).brand;
    delete (patch as { model?: string }).model;
    delete (patch as { sku?: string }).sku;
    delete (patch as { size_label?: string }).size_label;
    delete (patch as { color?: string }).color;
    delete (patch as { image_url?: string | null }).image_url;
  }

  // Normalize image_url: empty string → null (DB constraint-friendly)
  if ((patch as { image_url?: string | null }).image_url === "") {
    (patch as { image_url?: string | null }).image_url = null;
  }

  const { data, error } = await supabase.rpc(
    "update_product_variant_and_sku_shared",
    {
      p_product_id: id,
      p_patch: patch,
    },
  );
  if (error) {
    if (error.code === "23505" && error.message.includes("idx_products_sku_sizenum")) {
      return { error: { size_label: ["Kombinasi SKU dan size sudah terdaftar"] } };
    }
    return { error: { _form: [error.message] } };
  }

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "product",
    entity_id: id,
    new_data: { patch, sync_result: data },
  });

  revalidatePath("/inventory");
  revalidatePath("/barcode-generate");
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
    .select("brand, model, size_label, condition")
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
    const productLabel = `${before.brand} ${before.model} size ${before.size_label}`;
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
