"use server";

import { createClient } from "@sneakervault/supabase/server";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import { assertPeriodOpen } from "@/lib/fiscal-periods";
import { createStockMovement } from "./stock-movements";
import { extractShoeSize } from "@/lib/marketplace/product-import";
import type {
  MarketplaceChannel,
  MarketplaceOrder,
  MarketplaceOrderLine,
} from "@/lib/marketplace/parsers";
import { z } from "zod";

export type { MarketplaceChannel, MarketplaceOrder, MarketplaceOrderLine } from "@/lib/marketplace/parsers";

// Impor pesanan = data keuangan → hanya owner & finance (Mei). Bukan admin_online.
const ROLES = ["owner", "finance"] as const;

type ResolvedProduct = {
  id: string;
  label: string;
  sku: string;
  quantity: number;
  sell_price: number;
  hpp: number;
};

export type LineDiff = {
  sku: string;
  qty: number;
  unit_price: number;
  product_name: string;
  variation_name?: string;
  product: ResolvedProduct | null;
  via: "sku" | "map" | null;
  issue: "ok" | "low_stock" | "unmapped";
  cost_issue: "ok" | "missing_hpp";
};

export type OrderDiff = {
  order_id: string;
  customer_name: string;
  order_date: string;
  channel: MarketplaceChannel;
  shipping_fee: number;
  discount: number;
  admin_fee: number;
  lines: LineDiff[];
  already_imported: boolean;
  status: "ready" | "blocked" | "duplicate";
};

export type ReconcileResult = {
  orders: OrderDiff[];
  summary: {
    ready: number;
    blocked: number;
    duplicate: number;
    unmapped_skus: string[];
    missing_hpp_skus: string[];
  };
};

const BRAND_PREFIXES = [
  "New Balance",
  "Under Armour",
  "Nike",
  "Adidas",
  "Asics",
  "Jordan",
  "Puma",
  "Reebok",
  "Converse",
  "Vans",
  "Salomon",
  "Hoka",
  "Mizuno",
  "Skechers",
  "On",
].sort((a, b) => b.length - a.length);

function labelOf(p: {
  brand: string;
  model: string;
  color: string | null;
  size: number | null;
  sku: string;
}): string {
  return `${p.brand} ${p.model} ${p.color ?? ""} • Size ${p.size ?? ""} • ${p.sku}`;
}

function cleanMarketplaceName(value: string) {
  return value
    .replace(/^dewinstsneakers\s*\|\s*/i, "")
    .replace(/\((?:100%\s*)?authentic\)/gi, "")
    .replace(/\bBNIB\b/gi, "")
    .replace(/\bRESMI\b/gi, "")
    .replace(/\bORIGINAL\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitBrandModel(productName: string) {
  const cleaned = cleanMarketplaceName(productName);
  const match = BRAND_PREFIXES.find((brand) => cleaned.toLowerCase().startsWith(brand.toLowerCase()));
  if (match) {
    return { brand: match, model: cleaned.slice(match.length).trim() || cleaned };
  }
  const [brand = "Marketplace", ...rest] = cleaned.split(/\s+/);
  return { brand, model: rest.join(" ") || cleaned || "Imported Product" };
}

function productPayloadFromMarketplaceLine(channel: MarketplaceChannel, line: MarketplaceOrderLine) {
  const size = extractShoeSize(line.variation_name) ?? extractShoeSize(line.product_name);
  if (!size) {
    return { error: "Size/variasi tidak terbaca. Buat produk manual di Inventory lalu petakan SKU." };
  }

  const { brand, model } = splitBrandModel(line.product_name);
  return {
    data: {
      brand,
      model,
      sku: line.sku,
      size,
      color: null,
      barcode: `MP-${channel}-${line.sku}`.slice(0, 120),
      quantity: Math.max(0, Math.trunc(line.qty)),
      hpp: 0,
      sell_price: Math.max(0, line.unit_price),
      price_offline: Math.max(0, line.unit_price),
      is_active: true,
      first_inbound_at: line.qty > 0 ? new Date().toISOString() : null,
    },
  };
}

/**
 * Resolve every order line to a system product, by exact SKU first then via the
 * learned marketplace_sku_map. Shared by reconcile (preview) and commit so they
 * never diverge. System data is the source of truth; the diff exposes mismatches
 * for the owner to approve or remap.
 */
async function resolveOrders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  channel: MarketplaceChannel,
  orders: MarketplaceOrder[],
): Promise<OrderDiff[]> {
  const allSkus = Array.from(
    new Set(orders.flatMap((o) => o.lines.map((l) => l.sku)).filter(Boolean)),
  );
  const orderIds = orders.map((o) => o.order_id).filter(Boolean);

  // 1. Exact SKU matches.
  const bySku = new Map<string, ResolvedProduct>();
  if (allSkus.length > 0) {
    const { data } = await supabase
      .from("products")
      .select("id, sku, brand, model, color, size, quantity, sell_price, hpp")
      .in("sku", allSkus);
    for (const p of data ?? []) {
      bySku.set(p.sku, {
        id: p.id,
        label: labelOf(p),
        sku: p.sku,
        quantity: Number(p.quantity),
        sell_price: Number(p.sell_price),
        hpp: Number(p.hpp),
      });
    }
  }

  // 2. Learned marketplace SKU map (for SKUs not matched exactly).
  const byMap = new Map<string, ResolvedProduct>();
  const unresolved = allSkus.filter((s) => !bySku.has(s));
  if (unresolved.length > 0) {
    const { data: maps } = await supabase
      .from("marketplace_sku_map")
      .select("marketplace_sku, product_id")
      .eq("channel", channel)
      .in("marketplace_sku", unresolved);
    const mapPids = Array.from(new Set((maps ?? []).map((m) => m.product_id)));
    if (mapPids.length > 0) {
      const { data: mapped } = await supabase
        .from("products")
        .select("id, sku, brand, model, color, size, quantity, sell_price, hpp")
        .in("id", mapPids);
      const pById = new Map(
        (mapped ?? []).map((p) => [
          p.id,
          {
            id: p.id,
            label: labelOf(p),
            sku: p.sku,
            quantity: Number(p.quantity),
            sell_price: Number(p.sell_price),
            hpp: Number(p.hpp),
          } as ResolvedProduct,
        ]),
      );
      for (const m of maps ?? []) {
        const prod = pById.get(m.product_id);
        if (prod) byMap.set(m.marketplace_sku, prod);
      }
    }
  }

  // 3. Duplicate-order guard.
  const imported = new Set<string>();
  if (orderIds.length > 0) {
    const { data: existing } = await supabase
      .from("sales_invoices")
      .select("marketplace_order_id")
      .in("marketplace_order_id", orderIds);
    for (const e of existing ?? []) {
      if (e.marketplace_order_id) imported.add(e.marketplace_order_id);
    }
  }

  return orders.map((o) => {
    const lines: LineDiff[] = o.lines.map((l) => {
      const exact = bySku.get(l.sku);
      const mapped = exact ? null : byMap.get(l.sku);
      const product = exact ?? mapped ?? null;
      const via: LineDiff["via"] = exact ? "sku" : mapped ? "map" : null;
      let issue: LineDiff["issue"] = "ok";
      if (!product) issue = "unmapped";
      else if (product.quantity < l.qty) issue = "low_stock";
      return {
        sku: l.sku,
        qty: l.qty,
        unit_price: l.unit_price,
        product_name: l.product_name,
        variation_name: l.variation_name,
        product,
        via,
        issue,
        cost_issue: product && Number(product.hpp) <= 0 ? "missing_hpp" : "ok",
      };
    });

    const already = imported.has(o.order_id);
    const blocked = lines.some((l) => l.issue !== "ok");
    return {
      order_id: o.order_id,
      customer_name: o.customer_name,
      order_date: o.order_date,
      channel,
      shipping_fee: o.shipping_fee,
      discount: o.discount,
      admin_fee: o.admin_fee,
      lines,
      already_imported: already,
      status: already ? "duplicate" : blocked ? "blocked" : "ready",
    };
  });
}

/** Preview: enrich parsed orders with system data for the review-diff screen. */
export async function reconcileMarketplaceOrders(
  channel: MarketplaceChannel,
  orders: MarketplaceOrder[],
): Promise<ReconcileResult> {
  await requireRole([...ROLES]);
  const supabase = await createClient();
  const diffs = await resolveOrders(supabase, channel, orders);

  const unmapped = new Set<string>();
  const missingHpp = new Set<string>();
  for (const o of diffs) {
    for (const l of o.lines) {
      if (l.issue === "unmapped") unmapped.add(l.sku);
      if (l.cost_issue === "missing_hpp") missingHpp.add(l.sku);
    }
  }

  return {
    orders: diffs,
    summary: {
      ready: diffs.filter((o) => o.status === "ready").length,
      blocked: diffs.filter((o) => o.status === "blocked").length,
      duplicate: diffs.filter((o) => o.status === "duplicate").length,
      unmapped_skus: Array.from(unmapped),
      missing_hpp_skus: Array.from(missingHpp),
    },
  };
}

/** Learn a marketplace SKU -> system product mapping (manual match in diff). */
export async function mapMarketplaceSku(
  channel: MarketplaceChannel,
  marketplaceSku: string,
  productId: string,
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketplace_sku_map")
    .upsert(
      {
        channel,
        marketplace_sku: marketplaceSku.trim(),
        product_id: productId,
        created_by: profile.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel,marketplace_sku" },
    );
  if (error) return { error: error.message };
  return { ok: true };
}

/** Product search for the manual-map picker in the diff screen. */
export async function searchProductsForMapping(
  query: string,
): Promise<ResolvedProduct[]> {
  await requireRole([...ROLES]);
  const q = query.trim();
  if (q.length < 2) return [];
  const supabase = await createClient();
  const pattern = `%${q}%`;
  const { data } = await supabase
    .from("products")
    .select("id, sku, brand, model, color, size, quantity, sell_price, hpp")
    .or(`sku.ilike.${pattern},brand.ilike.${pattern},model.ilike.${pattern},barcode.ilike.${pattern}`)
    .eq("is_active", true)
    .limit(10);
  return (data ?? []).map((p) => ({
    id: p.id,
    label: labelOf(p),
    sku: p.sku,
    quantity: Number(p.quantity),
    sell_price: Number(p.sell_price),
    hpp: Number(p.hpp),
  }));
}

async function mapSkuToProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  channel: MarketplaceChannel,
  marketplaceSku: string,
  productId: string,
) {
  return supabase
    .from("marketplace_sku_map")
    .upsert(
      {
        channel,
        marketplace_sku: marketplaceSku.trim(),
        product_id: productId,
        created_by: profileId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel,marketplace_sku" },
    );
}

const createLineProductSchema = z.object({
  sku: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  unit_price: z.coerce.number().nonnegative(),
  product_name: z.string().min(1),
  variation_name: z.string().optional(),
});

export async function createProductFromMarketplaceLine(
  channel: MarketplaceChannel,
  input: unknown,
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireRole(["owner"]);
  const parsed = createLineProductSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(", ") };

  const payload = productPayloadFromMarketplaceLine(channel, parsed.data);
  if ("error" in payload) return { error: payload.error ?? "Produk gagal dibuat" };

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("id, quantity")
    .eq("sku", parsed.data.sku)
    .maybeSingle();
  if (existingError) return { error: existingError.message };

  let productId = existing?.id;
  if (!productId) {
    const { data, error } = await supabase
      .from("products")
      .insert(payload.data)
      .select("id")
      .single();
    if (error) return { error: error.message };
    productId = data.id;

    if (parsed.data.qty > 0) {
      const movement = await createStockMovement(supabase, {
        product_id: productId,
        type: "inbound",
        quantity: parsed.data.qty,
        unit_cost: 0,
        reference_type: "opening_balance",
        notes: `Bootstrap dari import order ${channel}: HPP belum diisi`,
      });
      if (movement.error) return { error: movement.error };
    }
  }

  const mapped = await mapSkuToProduct(supabase, profile.id, channel, parsed.data.sku, productId);
  if (mapped.error) return { error: mapped.error.message };

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "product",
    entity_id: productId,
    new_data: { source: `marketplace-order:${channel}`, sku: parsed.data.sku, hpp: 0 },
  });
  revalidatePath("/inventory");
  revalidatePath("/penjualan/import-marketplace");
  return { ok: true };
}

export async function createMissingProductsFromMarketplaceOrders(
  channel: MarketplaceChannel,
  orders: MarketplaceOrder[],
): Promise<{ created: number; skipped: number; errors: { sku: string; reason: string }[] }> {
  const profile = await requireRole(["owner"]);
  const supabase = await createClient();
  const diffs = await resolveOrders(supabase, channel, orders);
  const lines = new Map<string, MarketplaceOrderLine>();
  const qtyBySku = new Map<string, number>();

  for (const order of diffs) {
    if (order.status === "duplicate") continue;
    for (const line of order.lines) {
      if (line.issue !== "unmapped") continue;
      if (!lines.has(line.sku)) {
        lines.set(line.sku, {
          sku: line.sku,
          qty: 0,
          unit_price: line.unit_price,
          product_name: line.product_name,
          variation_name: line.variation_name,
        });
      }
      qtyBySku.set(line.sku, (qtyBySku.get(line.sku) ?? 0) + line.qty);
    }
  }

  let created = 0;
  let skipped = 0;
  const errors: { sku: string; reason: string }[] = [];

  for (const [sku, line] of lines) {
    const qty = qtyBySku.get(sku) ?? 0;
    const payload = productPayloadFromMarketplaceLine(channel, { ...line, qty });
    if ("error" in payload) {
      errors.push({ sku, reason: payload.error ?? "Produk gagal dibuat" });
      continue;
    }

    const { data: existing, error: existingError } = await supabase
      .from("products")
      .select("id")
      .eq("sku", sku)
      .maybeSingle();
    if (existingError) {
      errors.push({ sku, reason: existingError.message });
      continue;
    }

    let productId = existing?.id;
    if (productId) {
      skipped++;
    } else {
      const { data, error } = await supabase
        .from("products")
        .insert(payload.data)
        .select("id")
        .single();
      if (error) {
        errors.push({ sku, reason: error.message });
        continue;
      }
      productId = data.id;
      created++;
      if (qty > 0) {
        const movement = await createStockMovement(supabase, {
          product_id: productId,
          type: "inbound",
          quantity: qty,
          unit_cost: 0,
          reference_type: "opening_balance",
          notes: `Bootstrap dari import order ${channel}: HPP belum diisi`,
        });
        if (movement.error) errors.push({ sku, reason: movement.error });
      }
    }

    const mapped = await mapSkuToProduct(supabase, profile.id, channel, sku, productId);
    if (mapped.error) errors.push({ sku, reason: mapped.error.message });
  }

  if (created > 0) {
    await logActivity({
      user_id: profile.id,
      action: "bulk_import",
      entity_type: "product",
      new_data: { source: `marketplace-order:${channel}`, created, skipped, hpp: 0 },
    });
  }
  revalidatePath("/inventory");
  revalidatePath("/penjualan/import-marketplace");
  return { created, skipped, errors };
}

export async function topUpProductStockForMarketplaceImport(
  productId: string,
  requiredQty: number,
): Promise<{ ok?: true; added?: number; error?: string }> {
  const profile = await requireRole(["owner", "admin_gudang"]);
  const parsed = z.string().uuid().safeParse(productId);
  if (!parsed.success) return { error: "Produk tidak valid" };
  const qty = Math.trunc(Number(requiredQty));
  if (!Number.isFinite(qty) || qty <= 0) return { error: "Qty tidak valid" };

  const supabase = await createClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, quantity, hpp")
    .eq("id", productId)
    .maybeSingle();
  if (productError) return { error: productError.message };
  if (!product) return { error: "Produk tidak ditemukan" };

  const missing = Math.max(0, qty - Number(product.quantity));
  if (missing === 0) return { ok: true, added: 0 };

  const { error: incError } = await supabase.rpc("increment_product_quantity", {
    p_id: productId,
    qty: missing,
  });
  if (incError) return { error: incError.message };

  const movement = await createStockMovement(supabase, {
    product_id: productId,
    type: "adjustment",
    quantity: missing,
    unit_cost: Number(product.hpp),
    reference_type: "marketplace_import",
    notes: "Tambah stok sementara dari review import marketplace",
  });
  if (movement.error) return { error: movement.error };

  await logActivity({
    user_id: profile.id,
    action: "adjustment",
    entity_type: "product",
    entity_id: productId,
    new_data: { reason: "marketplace_import_topup", added: missing },
  });
  revalidatePath("/inventory");
  revalidatePath("/penjualan/import-marketplace");
  return { ok: true, added: missing };
}

export type CommitResult = {
  success: number;
  skipped: number;
  errors: { order_id: string; reason: string }[];
};

/**
 * Commit approved orders. Re-resolves server-side (authoritative), then posts
 * each ready order through the atomic RPC (invoice + lines + stock + journal in
 * one transaction). Blocked/duplicate orders are skipped. Records the batch in
 * marketplace_imports as the import-source audit/label.
 */
export async function commitMarketplaceOrders(
  channel: MarketplaceChannel,
  orders: MarketplaceOrder[],
  fileName?: string,
): Promise<CommitResult> {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();

  const result: CommitResult = { success: 0, skipped: 0, errors: [] };
  const diffs = await resolveOrders(supabase, channel, orders);

  let gmv = 0;
  let fee = 0;
  const dates: string[] = [];

  for (const order of diffs) {
    if (order.status === "duplicate") {
      result.skipped++;
      continue;
    }
    if (order.status === "blocked") {
      const bad = order.lines.find((l) => l.issue !== "ok");
      result.errors.push({
        order_id: order.order_id,
        reason:
          bad?.issue === "unmapped"
            ? `SKU ${bad.sku} belum dipetakan ke produk`
            : `Stok kurang untuk ${bad?.sku}`,
      });
      continue;
    }

    const lock = await assertPeriodOpen(order.order_date);
    if (lock.error) {
      result.errors.push({ order_id: order.order_id, reason: lock.error });
      continue;
    }

    const payload = {
      channel,
      invoice_date: order.order_date,
      customer_name: order.customer_name,
      marketplace_order_id: order.order_id,
      discount: order.discount,
      shipping_fee: order.shipping_fee,
      admin_fee: order.admin_fee,
      notes: `Import ${channel.toUpperCase()}${fileName ? ` • ${fileName}` : ""}`,
      lines: order.lines.map((l) => ({
        product_id: l.product!.id,
        qty: l.qty,
        unit_price: l.unit_price,
      })),
    };

    const { data, error } = await supabase.rpc("import_marketplace_order_atomic", {
      p_payload: payload,
    });
    if (error) {
      result.errors.push({ order_id: order.order_id, reason: error.message });
      continue;
    }
    if (data?.skipped) {
      result.skipped++;
      continue;
    }

    result.success++;
    gmv += Number(data?.total ?? 0);
    fee += order.admin_fee;
    dates.push(order.order_date);
  }

  // Audit batch (import source label).
  if (result.success > 0 || result.errors.length > 0) {
    dates.sort();
    await supabase.from("marketplace_imports").insert({
      marketplace: channel,
      kind: "order",
      file_name: fileName ?? null,
      period_start: dates[0] ?? new Date().toISOString().slice(0, 10),
      period_end: dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10),
      total_orders: result.success,
      total_gmv: gmv,
      total_fee: fee,
      total_net: gmv,
      matched_count: result.success,
      mismatch_count: result.errors.length,
      status: "confirmed",
      notes: `Import order ${channel.toUpperCase()}`,
      uploaded_by: profile.id,
      confirmed_by: profile.id,
      confirmed_at: new Date().toISOString(),
    });
  }

  if (result.success > 0) {
    await logActivity({
      user_id: profile.id,
      action: "bulk_import",
      entity_type: "sales_invoice",
      new_data: { count: result.success, platform: channel },
    });
    revalidatePath("/penjualan/invoice");
    revalidatePath("/inventory");
    revalidatePath("/buku-besar/journal");
    revalidatePath("/laporan-keuangan");
  }

  return result;
}
