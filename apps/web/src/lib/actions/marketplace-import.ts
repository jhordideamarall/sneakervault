"use server";

import { createClient } from "@sneakervault/supabase/server";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import { assertPeriodOpen } from "@/lib/fiscal-periods";
import { createStockMovement } from "./stock-movements";
import { cancelPreOrder, createPreOrder } from "./pre-orders";
import { extractShoeSize } from "@/lib/marketplace/product-import";
import type {
  MarketplaceChannel,
  MarketplaceOrderKind,
  MarketplaceOrderStatusKind,
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
  size: number | null;
  quantity: number;
  sell_price: number;
  hpp: number;
};

type ExistingMarketplaceInvoice = {
  id: string;
  invoice_number: string;
  marketplace_order_id: string;
  status: string;
  paid_amount: number;
  settlement_status: string;
};

type ExistingPreOrder = {
  id: string;
  marketplace_order_id: string;
  status: string;
};

export type LineDiff = {
  sku: string;
  sku_candidates?: string[];
  mapping_sku: string;
  size_label?: string;
  size_value?: number | null;
  qty: number;
  unit_price: number;
  product_name: string;
  variation_name?: string;
  product: ResolvedProduct | null;
  via: "sku" | "map" | null;
  issue: "ok" | "low_stock" | "unmapped";
  reason?: string;
  cost_issue: "ok" | "missing_hpp";
};

export type OrderDiff = {
  order_id: string;
  customer_name: string;
  order_date: string;
  channel: MarketplaceChannel;
  order_kind: MarketplaceOrderKind;
  status_kind: MarketplaceOrderStatusKind;
  marketplace_status?: string;
  shipping_fee: number;
  discount: number;
  admin_fee: number;
  lines: LineDiff[];
  already_imported: boolean;
  cancel_reason?: string;
  existing_invoice?: ExistingMarketplaceInvoice | null;
  existing_pre_order?: ExistingPreOrder | null;
  status_reason?: string;
  status:
    | "ready"
    | "blocked"
    | "duplicate"
    | "preorder_ready"
    | "preorder_review"
    | "preorder_duplicate"
    | "cancel_ready"
    | "cancel_blocked"
    | "cancel_unmatched"
    | "cancel_duplicate";
};

export type ReconcileResult = {
  orders: OrderDiff[];
  summary: {
    ready: number;
    blocked: number;
    duplicate: number;
    preorder_ready: number;
    preorder_review: number;
    preorder_duplicate: number;
    cancel_ready: number;
    cancel_blocked: number;
    cancel_unmatched: number;
    cancel_duplicate: number;
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
  size_label?: string | null;
  sku: string;
}): string {
  return `${p.brand} ${p.model} ${p.color ?? ""} • Size ${p.size_label ?? p.size ?? ""} • ${p.sku}`;
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
  const size = line.size_value ?? extractShoeSize(line.variation_name) ?? extractShoeSize(line.product_name);
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
      barcode: `MP-${channel}-${line.sku}-${size}`.slice(0, 120),
      quantity: Math.max(0, Math.trunc(line.qty)),
      hpp: 0,
      sell_price: Math.max(0, line.unit_price),
      price_offline: Math.max(0, line.unit_price),
      is_active: true,
      first_inbound_at: line.qty > 0 ? new Date().toISOString() : null,
    },
  };
}

function normalizeSkuKey(value: string): string {
  return value.trim().toLowerCase();
}

function sizeKey(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "";
  return Number(value).toFixed(2);
}

function lineSizeValue(line: MarketplaceOrderLine): number | null {
  return line.size_value ?? extractShoeSize(line.variation_name) ?? extractShoeSize(line.product_name);
}

function lineSizeLabel(line: MarketplaceOrderLine): string | undefined {
  return line.size_label || line.variation_name || undefined;
}

function stripMatchingSizeSuffix(sku: string, size: number | null): string | null {
  if (size == null) return null;
  const key = Number(size).toFixed(2).replace(/\.?0+$/, "").replace(".", "[._]");
  const stripped = sku.trim().replace(new RegExp(`[-_ ]${key}$`, "i"), "").trim();
  return stripped && stripped !== sku.trim() ? stripped : null;
}

function skuCandidatesForLine(line: MarketplaceOrderLine): string[] {
  const size = lineSizeValue(line);
  const raw = [...(line.sku_candidates ?? []), line.sku]
    .flatMap((value) => String(value ?? "").split(/[,;\n]+/))
    .map((value) => value.trim())
    .filter(Boolean);
  const candidates: string[] = [];
  for (const sku of raw) {
    if (!candidates.some((s) => normalizeSkuKey(s) === normalizeSkuKey(sku))) {
      candidates.push(sku);
    }
    const stripped = stripMatchingSizeSuffix(sku, size);
    if (stripped && !candidates.some((s) => normalizeSkuKey(s) === normalizeSkuKey(stripped))) {
      candidates.push(stripped);
    }
  }
  return candidates;
}

function mapKeysForLine(line: MarketplaceOrderLine): string[] {
  const keys = [line.marketplace_sku, line.sku, ...skuCandidatesForLine(line)]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set(keys));
}

function productLookupKey(sku: string, size: number | null | undefined): string {
  return `${normalizeSkuKey(sku)}|${sizeKey(size)}`;
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
    new Set(
      orders
        .flatMap((o) => o.lines.flatMap((l) => skuCandidatesForLine(l)))
        .filter(Boolean),
    ),
  );
  const allMapKeys = Array.from(
    new Set(orders.flatMap((o) => o.lines.flatMap((l) => mapKeysForLine(l))).filter(Boolean)),
  );
  const orderIds = orders.map((o) => o.order_id).filter(Boolean);

  // 1. Exact SKU + size matches. SKU is the colorway anchor; size is the variant.
  const bySkuSize = new Map<string, ResolvedProduct>();
  if (allSkus.length > 0) {
    const { data } = await supabase
      .from("products")
      .select("id, sku, brand, model, color, size, size_label, quantity, sell_price, hpp")
      .in("sku", allSkus);
    for (const p of data ?? []) {
      bySkuSize.set(productLookupKey(p.sku, Number(p.size)), {
        id: p.id,
        label: labelOf(p),
        sku: p.sku,
        size: Number(p.size),
        quantity: Number(p.quantity),
        sell_price: Number(p.sell_price),
        hpp: Number(p.hpp),
      });
    }
  }

  // 2. Learned marketplace SKU map, ideally keyed by variation-specific SKU.
  const byMap = new Map<string, ResolvedProduct>();
  if (allMapKeys.length > 0) {
    const { data: maps } = await supabase
      .from("marketplace_sku_map")
      .select("marketplace_sku, product_id")
      .eq("channel", channel)
      .in("marketplace_sku", allMapKeys);
    const mapPids = Array.from(new Set((maps ?? []).map((m) => m.product_id)));
    if (mapPids.length > 0) {
      const { data: mapped } = await supabase
        .from("products")
        .select("id, sku, brand, model, color, size, size_label, quantity, sell_price, hpp")
        .in("id", mapPids);
      const pById = new Map(
        (mapped ?? []).map((p) => [
          p.id,
          {
            id: p.id,
            label: labelOf(p),
            sku: p.sku,
            size: Number(p.size),
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

  // 3. Existing invoice guard/reconcile by marketplace order id.
  const existingByOrderId = new Map<string, ExistingMarketplaceInvoice>();
  const existingPreOrderByOrderId = new Map<string, ExistingPreOrder>();
  if (orderIds.length > 0) {
    const { data: existing } = await supabase
      .from("sales_invoices")
      .select("id, invoice_number, marketplace_order_id, status, paid_amount, settlement_status")
      .eq("channel", channel)
      .in("marketplace_order_id", orderIds);
    for (const e of existing ?? []) {
      if (!e.marketplace_order_id) continue;
      existingByOrderId.set(e.marketplace_order_id, {
        id: e.id,
        invoice_number: e.invoice_number,
        marketplace_order_id: e.marketplace_order_id,
        status: String(e.status),
        paid_amount: Number(e.paid_amount ?? 0),
        settlement_status: String(e.settlement_status ?? "none"),
      });
    }

    const { data: existingPreOrders } = await (supabase as any)
      .from("pre_orders")
      .select("id, marketplace_order_id, status")
      .eq("channel", channel)
      .in("marketplace_order_id", orderIds);
    for (const preOrder of (existingPreOrders as ExistingPreOrder[] | null) ?? []) {
      if (!preOrder.marketplace_order_id) continue;
      existingPreOrderByOrderId.set(preOrder.marketplace_order_id, {
        id: preOrder.id,
        marketplace_order_id: preOrder.marketplace_order_id,
        status: String(preOrder.status),
      });
    }
  }

  return orders.map((o) => {
    const existingInvoice = existingByOrderId.get(o.order_id) ?? null;
    const existingPreOrder = existingPreOrderByOrderId.get(o.order_id) ?? null;
    const lines: LineDiff[] = o.lines.map((l) => {
      const size = lineSizeValue(l);
      const candidates = skuCandidatesForLine(l);
      const mappingKeys = mapKeysForLine(l);
      const exact =
        size == null
          ? null
          : candidates
              .map((sku) => bySkuSize.get(productLookupKey(sku, size)))
              .find((p): p is ResolvedProduct => Boolean(p)) ?? null;
      const mapped = exact
        ? null
        : mappingKeys
            .map((key) => byMap.get(key))
            .find(
              (p): p is ResolvedProduct => {
                if (!p) return false;
                return size == null || sizeKey(p.size) === sizeKey(size);
              },
            ) ?? null;
      const product = exact ?? mapped ?? null;
      const via: LineDiff["via"] = exact ? "sku" : mapped ? "map" : null;
      let issue: LineDiff["issue"] = "ok";
      let reason: string | undefined;
      if (size == null) {
        issue = "unmapped";
        reason = "Size/variasi tidak terbaca. Format size harus jelas, misalnya 40, 40.5, atau 42 2/3.";
      } else if (!product) {
        issue = "unmapped";
        reason = `Produk tidak cocok untuk SKU ${candidates.join(" / ")} size ${lineSizeLabel(l) ?? size}. Pastikan master produk punya SKU colorway dan size yang sama.`;
      } else if (product.quantity < l.qty) issue = "low_stock";
      return {
        sku: l.sku,
        sku_candidates: candidates,
        mapping_sku: mappingKeys[0] ?? l.sku,
        size_label: lineSizeLabel(l),
        size_value: size,
        qty: l.qty,
        unit_price: l.unit_price,
        product_name: l.product_name,
        variation_name: l.variation_name,
        product,
        via,
        issue,
        reason,
        cost_issue: product && Number(product.hpp) <= 0 ? "missing_hpp" : "ok",
      };
    });

    const already = Boolean(existingInvoice || existingPreOrder);
    const blocked = lines.some((l) => l.issue !== "ok");
    const statusKind = o.status_kind ?? "normal";
    let status: OrderDiff["status"] = already ? "duplicate" : blocked ? "blocked" : "ready";
    let cancelReason: string | undefined;
    let statusReason: string | undefined;

    if (statusKind !== "normal") {
      if (!existingInvoice && existingPreOrder) {
        if (existingPreOrder.status === "cancelled") {
          status = "cancel_duplicate";
          cancelReason = `Pre Order Marketplace sudah dibatalkan sebelumnya.`;
        } else if (existingPreOrder.status === "packed") {
          status = "cancel_blocked";
          cancelReason =
            "Pre Order Marketplace sudah masuk packing. Batalkan lewat jalur packing/retur supaya stok dan audit tetap konsisten.";
        } else {
          status = "cancel_ready";
          cancelReason =
            `Pre Order Marketplace ditemukan dengan status ${existingPreOrder.status}; aman untuk dibatalkan dan reservasi dilepas.`;
        }
      } else if (!existingInvoice) {
        status = "cancel_unmatched";
        cancelReason = "Order batal/return belum pernah diimport ke invoice sistem. Tidak ada stok yang dikembalikan.";
      } else if (existingInvoice.status === "cancelled") {
        status = "cancel_duplicate";
        cancelReason = `Invoice ${existingInvoice.invoice_number} sudah dibatalkan sebelumnya.`;
      } else if (
        existingInvoice.status === "paid" ||
        existingInvoice.paid_amount > 0 ||
        existingInvoice.settlement_status === "released"
      ) {
        status = "cancel_blocked";
        cancelReason =
          `Invoice ${existingInvoice.invoice_number} sudah paid/settlement. Perlu proses refund/return settlement sebelum stok dikembalikan.`;
      } else if (["issued", "partial"].includes(existingInvoice.status)) {
        status = "cancel_ready";
        cancelReason = `Invoice ${existingInvoice.invoice_number} outstanding; aman untuk auto-cancel dan restock.`;
      } else {
        status = "cancel_blocked";
        cancelReason = `Invoice ${existingInvoice.invoice_number} status ${existingInvoice.status}; tidak aman untuk auto-cancel.`;
      }
    } else if (o.order_kind === "preorder") {
      if (existingPreOrder) {
        status = "preorder_duplicate";
        statusReason = `Pre Order Marketplace sudah ada di menu Pre Order dengan status ${existingPreOrder.status}.`;
      } else if (existingInvoice) {
        status = "preorder_duplicate";
        statusReason = `Order ini sudah pernah masuk invoice ${existingInvoice.invoice_number}; tidak dibuat ulang sebagai Pre Order.`;
      } else if (lines.length === 0) {
        status = "blocked";
        statusReason =
          "Pre Order Marketplace tidak punya item terbaca. Format wajib punya SKU, size/variation, dan quantity > 0.";
      } else if (lines.some((l) => l.issue === "unmapped")) {
        status = "preorder_review";
        statusReason =
          "Akan masuk menu Pre Order dengan status Perlu Review karena ada SKU/size yang belum cocok.";
      } else {
        status = "preorder_ready";
        statusReason =
          "Akan masuk menu Pre Order. Stok ready direservasi, kekurangan ditandai perlu pembelian.";
      }
    }

    return {
      order_id: o.order_id,
      customer_name: o.customer_name,
      order_date: o.order_date,
      channel,
      order_kind: o.order_kind ?? "direct",
      status_kind: statusKind,
      marketplace_status: o.marketplace_status,
      shipping_fee: o.shipping_fee,
      discount: o.discount,
      admin_fee: o.admin_fee,
      lines,
      already_imported: already,
      cancel_reason: cancelReason,
      existing_invoice: existingInvoice,
      existing_pre_order: existingPreOrder,
      status_reason: statusReason,
      status,
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
      const label = `${l.sku}${l.size_label || l.size_value ? ` size ${l.size_label ?? l.size_value}` : ""}`;
      if (l.issue === "unmapped") unmapped.add(label);
      if (l.cost_issue === "missing_hpp") missingHpp.add(label);
    }
  }

  return {
    orders: diffs,
    summary: {
      ready: diffs.filter((o) => o.status === "ready").length,
      blocked: diffs.filter((o) => o.status === "blocked").length,
      duplicate: diffs.filter((o) => o.status === "duplicate").length,
      preorder_ready: diffs.filter((o) => o.status === "preorder_ready").length,
      preorder_review: diffs.filter((o) => o.status === "preorder_review").length,
      preorder_duplicate: diffs.filter((o) => o.status === "preorder_duplicate").length,
      cancel_ready: diffs.filter((o) => o.status === "cancel_ready").length,
      cancel_blocked: diffs.filter((o) => o.status === "cancel_blocked").length,
      cancel_unmatched: diffs.filter((o) => o.status === "cancel_unmatched").length,
      cancel_duplicate: diffs.filter((o) => o.status === "cancel_duplicate").length,
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
    .select("id, sku, brand, model, color, size, size_label, quantity, sell_price, hpp")
    .or(`sku.ilike.${pattern},brand.ilike.${pattern},model.ilike.${pattern},barcode.ilike.${pattern}`)
    .eq("is_active", true)
    .limit(10);
  return (data ?? []).map((p) => ({
    id: p.id,
    label: labelOf(p),
    sku: p.sku,
    size: Number(p.size),
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
  sku_candidates: z.array(z.string()).optional(),
  marketplace_sku: z.string().optional(),
  size_label: z.string().optional(),
  size_value: z.coerce.number().positive().nullable().optional(),
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
          sku_candidates: line.sku_candidates,
          size_label: line.size_label,
          size_value: line.size_value,
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
  preorders: number;
  cancelled: number;
  skipped: number;
  errors: { order_id: string; reason: string }[];
};

function flattenActionError(error: unknown): string {
  if (!error) return "Gagal memproses data.";
  if (typeof error === "string") return error;
  if (typeof error !== "object") return String(error);
  const messages = Object.entries(error as Record<string, unknown>).flatMap(
    ([field, value]) => {
      if (Array.isArray(value)) return value.map((item) => `${field}: ${item}`);
      if (value == null) return [];
      return [`${field}: ${String(value)}`];
    },
  );
  return messages.join("; ") || "Gagal memproses data.";
}

function preOrderInputFromDiff(order: OrderDiff, fileName?: string) {
  return {
    source: "marketplace" as const,
    channel: order.channel,
    marketplace_order_id: order.order_id,
    customer_name: order.customer_name || `${order.channel} Customer`,
    order_date: order.order_date,
    marketplace_status: order.marketplace_status,
    notes: [
      `Import ${order.channel.toUpperCase()}`,
      "Pre Order Marketplace",
      `Order Marketplace ${order.order_id}`,
      order.status_reason,
      fileName || null,
    ]
      .filter(Boolean)
      .join(" • "),
    lines: order.lines.map((line) => {
      const parsedName = splitBrandModel(line.product_name || line.product?.label || "");
      return {
        product_id: line.product?.id ?? null,
        sku:
          line.sku ||
          line.sku_candidates?.[0] ||
          line.mapping_sku ||
          `MP-${order.channel}-${order.order_id}`,
        product_name:
          line.product_name ||
          line.product?.label ||
          `Produk Marketplace ${order.order_id}`,
        brand: parsedName.brand,
        model: parsedName.model,
        color: "",
        size_label:
          line.size_label ??
          line.variation_name ??
          (line.size_value != null ? String(line.size_value) : "Size tidak terbaca"),
        size_value: line.size_value ?? null,
        requested_qty: line.qty,
        unit_price: Math.max(0, Number(line.unit_price ?? 0)),
        estimated_cost: Math.max(0, Number(line.product?.hpp ?? 0)),
        notes: [
          line.issue === "unmapped" ? line.reason ?? "SKU/size belum cocok dengan inventory" : null,
          line.issue === "low_stock"
            ? `Stok ready ${line.product?.quantity ?? 0}, diminta ${line.qty}`
            : null,
          line.variation_name ? `Variasi marketplace: ${line.variation_name}` : null,
        ]
          .filter(Boolean)
          .join(" • "),
      };
    }),
  };
}

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

  const result: CommitResult = { success: 0, preorders: 0, cancelled: 0, skipped: 0, errors: [] };
  const diffs = await resolveOrders(supabase, channel, orders);

  let gmv = 0;
  let fee = 0;
  const dates: string[] = [];

  for (const order of diffs) {
    if (order.status === "cancel_duplicate") {
      result.skipped++;
      continue;
    }
    if (order.status === "cancel_unmatched" || order.status === "cancel_blocked") {
      result.errors.push({
        order_id: order.order_id,
        reason: order.cancel_reason ?? "Order batal/return tidak bisa diproses otomatis.",
      });
      continue;
    }
    if (order.status === "cancel_ready") {
      const today = new Date().toISOString().slice(0, 10);
      const lock = await assertPeriodOpen(today);
      if (lock.error) {
        result.errors.push({ order_id: order.order_id, reason: lock.error });
        continue;
      }

      const reason = [
        order.status_kind === "return" ? "Return/refund marketplace" : "Cancel marketplace",
        `Status Marketplace: ${order.marketplace_status ?? "-"}`,
        fileName || null,
      ].filter(Boolean).join(" • ");

      if (order.existing_pre_order && !order.existing_invoice) {
        const cancelled = await cancelPreOrder(order.existing_pre_order.id, reason);
        if (cancelled.error) {
          result.errors.push({ order_id: order.order_id, reason: cancelled.error });
          continue;
        }

        result.cancelled++;
        dates.push(today);
        continue;
      }

      const { data, error } = await supabase.rpc("cancel_marketplace_order_atomic", {
        p_payload: {
          channel,
          marketplace_order_id: order.order_id,
          reason,
        },
      });
      if (error) {
        result.errors.push({ order_id: order.order_id, reason: error.message });
        continue;
      }

      const cancelData = data as {
        status?: "cancelled" | "blocked" | "unmatched" | "skipped";
        message?: string;
      } | null;
      if (cancelData?.status === "cancelled") {
        result.cancelled++;
        dates.push(today);
      } else if (cancelData?.status === "skipped") {
        result.skipped++;
      } else {
        result.errors.push({
          order_id: order.order_id,
          reason: cancelData?.message ?? "Cancel marketplace tidak bisa diproses otomatis.",
        });
      }
      continue;
    }

    if (order.status === "preorder_duplicate") {
      result.skipped++;
      continue;
    }
    if (order.status === "preorder_ready" || order.status === "preorder_review") {
      const lock = await assertPeriodOpen(order.order_date);
      if (lock.error) {
        result.errors.push({ order_id: order.order_id, reason: lock.error });
        continue;
      }

      const created = await createPreOrder(preOrderInputFromDiff(order, fileName));
      if ("error" in created && created.error) {
        result.errors.push({
          order_id: order.order_id,
          reason: flattenActionError(created.error),
        });
        continue;
      }

      result.preorders++;
      gmv += order.lines.reduce((sum, line) => sum + line.qty * line.unit_price, 0);
      dates.push(order.order_date);
      continue;
    }

    if (order.status === "duplicate") {
      result.skipped++;
      continue;
    }
    if (order.status === "blocked") {
      const bad = order.lines.find((l) => l.issue !== "ok");
      const reason =
        order.status_reason ??
        (bad?.issue === "unmapped"
          ? (bad.reason ?? `SKU ${bad.sku} size ${bad.size_label ?? bad.size_value ?? "-"} belum cocok dengan produk`)
          : `Stok kurang untuk ${bad?.sku ?? "item"}`);
      result.errors.push({
        order_id: order.order_id,
        reason,
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
      notes: [
        `Import ${channel.toUpperCase()}`,
        `Order Marketplace ${order.order_id}`,
        `Jenis ${order.order_kind === "preorder" ? "Pre Order Marketplace" : "Order Langsung"}`,
        order.marketplace_status ? `Status Marketplace: ${order.marketplace_status}` : null,
        fileName || null,
      ].filter(Boolean).join(" • "),
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
  if (result.success > 0 || result.preorders > 0 || result.cancelled > 0 || result.errors.length > 0) {
    dates.sort();
    await supabase.from("marketplace_imports").insert({
      marketplace: channel,
      kind: "order",
      file_name: fileName ?? null,
      period_start: dates[0] ?? new Date().toISOString().slice(0, 10),
      period_end: dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10),
      total_orders: result.success + result.preorders + result.cancelled,
      total_gmv: gmv,
      total_fee: fee,
      total_net: gmv,
      matched_count: result.success + result.preorders + result.cancelled,
      mismatch_count: result.errors.length,
      status: "confirmed",
      notes: `Import order/pre-order/cancel ${channel.toUpperCase()}`,
      uploaded_by: profile.id,
      confirmed_by: profile.id,
      confirmed_at: new Date().toISOString(),
    });
  }

  if (result.success > 0 || result.preorders > 0 || result.cancelled > 0) {
    await logActivity({
      user_id: profile.id,
      action: "bulk_import",
      entity_type: "marketplace_order",
      new_data: {
        invoices: result.success,
        preorders: result.preorders,
        cancelled: result.cancelled,
        platform: channel,
      },
    });
    revalidatePath("/penjualan/invoice");
    revalidatePath("/penjualan/import-marketplace");
    revalidatePath("/pre-order");
    revalidatePath("/inventory");
    revalidatePath("/buku-besar/journal");
    revalidatePath("/reports");
    revalidatePath("/laporan-keuangan");
  }

  return result;
}
