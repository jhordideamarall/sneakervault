/**
 * Client-safe marketplace order parsers.
 *
 * Pure functions: take the rows produced by SheetJS `sheet_to_json` plus the
 * channel the user explicitly selected, and return normalized MarketplaceOrder[]
 * grouped by order id. Header aliases cover the real export templates in
 * docs/marketplace-templates/ plus older column names for resilience.
 */

export type MarketplaceChannel = "shopee" | "tokopedia" | "tiktok";
export type MarketplaceOrderKind = "direct" | "preorder";
export type MarketplaceOrderStatusKind = "normal" | "cancelled" | "return";

export type MarketplaceOrderLine = {
  /** Primary seller/colorway SKU candidate shown in the review table. */
  sku: string;
  /** All SKU candidates from the marketplace row, e.g. Shopee parent SKU list. */
  sku_candidates?: string[];
  /** Marketplace-specific variation key if available, used for manual mapping. */
  marketplace_sku?: string;
  size_label?: string;
  size_value?: number | null;
  qty: number;
  unit_price: number;
  product_name: string;
  variation_name?: string;
};

export type MarketplaceOrder = {
  order_id: string;
  customer_name: string;
  order_date: string;
  channel: MarketplaceChannel;
  order_kind: MarketplaceOrderKind;
  status_kind: MarketplaceOrderStatusKind;
  marketplace_status?: string;
  lines: MarketplaceOrderLine[];
  shipping_fee: number;
  discount: number;
  admin_fee: number;
  notes?: string;
};

type Row = Record<string, unknown>;

export function readNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  let cleaned = value
    .replace(/rp/gi, "")
    .replace(/\s/g, "")
    .replace(/[^\d.,()-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "()" || cleaned === "(-)") return 0;

  const negative = cleaned.startsWith("(") && cleaned.endsWith(")");
  cleaned = cleaned.replace(/[()]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    cleaned =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(/,/g, ".")
        : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const commaGroups = cleaned.split(",");
    cleaned =
      commaGroups.length === 2 && commaGroups[1]!.length <= 2
        ? cleaned.replace(/,/g, ".")
        : cleaned.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const dotGroups = cleaned.split(".");
    const last = dotGroups[dotGroups.length - 1] ?? "";
    cleaned =
      dotGroups.length > 2 || last.length === 3
        ? cleaned.replace(/\./g, "")
        : cleaned;
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
}

export function readDate(value: unknown, fallback: string): string {
  if (!value) return fallback;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString().slice(0, 10);
}

/** First non-empty value across header aliases (case-insensitive fallback). */
function pick(row: Row, aliases: string[]): unknown {
  for (const a of aliases) {
    if (a in row && row[a] !== "" && row[a] != null) return row[a];
  }
  const lower = new Map(Object.keys(row).map((k) => [k.toLowerCase().trim(), k]));
  for (const a of aliases) {
    const hit = lower.get(a.toLowerCase().trim());
    if (hit && row[hit] !== "" && row[hit] != null) return row[hit];
  }
  return "";
}

function hasKeys(row: Row | undefined, keys: string[]): boolean {
  if (!row) return false;
  const lower = new Set(Object.keys(row).map((key) => key.toLowerCase().trim()));
  return keys.every((key) => lower.has(key.toLowerCase().trim()));
}

export function isExpectedOrderTemplate(channel: MarketplaceChannel, rows: Row[]): boolean {
  const first = rows[0];
  if (channel === "shopee") {
    return hasKeys(first, ["No. Pesanan", "Jumlah"]) && (
      hasKeys(first, ["Nomor Referensi SKU"]) ||
      hasKeys(first, ["No. Referensi SKU"]) ||
      hasKeys(first, ["SKU Induk"])
    );
  }
  return hasKeys(first, ["Order ID", "Seller SKU", "Quantity"]);
}

function detectStatusKind(value: unknown): MarketplaceOrderStatusKind {
  const status = String(value ?? "").trim().toLowerCase();
  if (!status) return "normal";
  if (status.includes("refund") || status.includes("return") || status.includes("pengembalian")) {
    return "return";
  }
  if (status.includes("batal") || status.includes("cancel")) return "cancelled";
  return "normal";
}

const TODAY = () => new Date().toISOString().slice(0, 10);

function detectOrderKind(row: Row): {
  order_kind: MarketplaceOrderKind;
  marketplace_status?: string;
} {
  const type = String(
    pick(row, [
      "Tipe Pesanan",
      "Normal or Pre-order",
      "Normal or Preorder",
      "Order Type",
      "Jenis Pesanan",
      "Tipe Order",
    ]) ?? "",
  ).trim();
  const status = String(
    pick(row, [
      "Status Pesanan",
      "Order Status",
      "Order Substatus",
      "Checked Status",
    ]) ?? "",
  ).trim();
  const combined = `${type} ${status}`.toLowerCase();
  const order_kind =
    /pre[-\s]?order|preorder|\bpo\b|purchase order/.test(combined)
      ? "preorder"
      : "direct";
  return {
    order_kind,
    marketplace_status: [type, status].filter(Boolean).join(" · ") || undefined,
  };
}

export function extractSizeValue(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw || /default|lain|ready/i.test(raw)) return null;
  const fraction = raw.match(/(\d{2})(?:\s|-)*(1\/2|1\/3|2\/3)\b/);
  if (fraction) {
    const base = Number(fraction[1]);
    const add = fraction[2] === "1/2" ? 0.5 : fraction[2] === "1/3" ? 0.33 : 0.67;
    return Number((base + add).toFixed(2));
  }
  const compactHalf = raw.match(/\b(\d{2})5\b/);
  if (compactHalf) {
    return Number(compactHalf[1]) + 0.5;
  }
  const decimal = raw.match(/(\d{2})(?:[.,](\d{1,2}))?/);
  if (!decimal) return null;
  const size = Number(`${decimal[1]}${decimal[2] ? `.${decimal[2]}` : ""}`);
  return Number.isFinite(size) && size > 0 ? size : null;
}

function sizeKeyFromValue(size: number): string {
  return Number(size).toFixed(2).replace(/\.?0+$/, "").replace(".", "_");
}

function sanitizeSkuCandidate(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[-,;]+|[-,;]+$/g, "");
}

function splitSkuCandidates(...values: Array<string | undefined>): string[] {
  const candidates: string[] = [];
  for (const value of values) {
    for (const part of String(value ?? "").split(/[,;\n]+/)) {
      const candidate = sanitizeSkuCandidate(part);
      if (candidate && !candidates.some((s) => s.toLowerCase() === candidate.toLowerCase())) {
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

function parseShopee(rows: Row[]): MarketplaceOrder[] {
  const map = new Map<string, MarketplaceOrder>();
  for (const row of rows) {
    const statusKind = detectStatusKind(pick(row, ["Status Pesanan", "Status Pembatalan/ Pengembalian", "Order Status"]));
    const orderId = String(pick(row, ["No. Pesanan", "Order ID Shopee"]) || "").trim();
    if (!orderId) continue;
    const variationSku = String(pick(row, ["Nomor Referensi SKU", "No. Referensi SKU"]) || "").trim();
    const parentSku = String(pick(row, ["SKU Induk"]) || "").trim();
    const variationName = String(pick(row, ["Nama Variasi"]) || "").trim();
    const sizeValue = extractSizeValue(variationName);
    const skuCandidates = splitSkuCandidates(variationSku, parentSku);
    const sku = skuCandidates[0] ?? "";
    const qty = readNumber(pick(row, ["Jumlah"]));

    if (!map.has(orderId)) {
      const kind = detectOrderKind(row);
      map.set(orderId, {
        order_id: orderId,
        customer_name: String(pick(row, ["Username (Pembeli)", "Nama Penerima"]) || "Shopee User"),
        order_date: readDate(pick(row, ["Waktu Pesanan Dibuat", "Waktu Pembayaran Dilakukan"]), TODAY()),
        channel: "shopee",
        order_kind: kind.order_kind,
        status_kind: statusKind,
        marketplace_status: kind.marketplace_status,
        lines: [],
        shipping_fee: readNumber(pick(row, ["Ongkos Kirim Dibayar oleh Pembeli", "Ongkos Kirim Dibayar Pembeli"])),
        discount:
          Math.abs(readNumber(pick(row, ["Diskon Dari Penjual", "Total Diskon"]))) +
          Math.abs(readNumber(pick(row, ["Voucher Ditanggung Penjual"]))) +
          Math.abs(readNumber(pick(row, ["Paket Diskon (Diskon dari Penjual)"]))),
        admin_fee: readNumber(pick(row, ["Biaya Administrasi", "Estimasi Potongan Biaya Pengiriman"])),
      });
    } else {
      const existing = map.get(orderId)!;
      const kind = detectOrderKind(row);
      if (kind.order_kind === "preorder") existing.order_kind = "preorder";
      if (statusKind !== "normal") existing.status_kind = statusKind;
      existing.marketplace_status ||= kind.marketplace_status;
    }
    if (statusKind !== "normal" || !sku || qty <= 0) continue;
    map.get(orderId)!.lines.push({
      sku,
      sku_candidates: skuCandidates,
      marketplace_sku: variationSku || (sizeValue ? `${sku}#${sizeKeyFromValue(sizeValue)}` : sku),
      size_label: variationName || undefined,
      size_value: sizeValue,
      qty,
      unit_price: readNumber(pick(row, ["Harga Setelah Diskon", "Harga Awal", "Harga Asli"])),
      product_name: String(pick(row, ["Nama Produk"]) || ""),
      variation_name: variationName || undefined,
    });
  }
  return Array.from(map.values());
}

/** TikTok and Tokopedia order exports share the same column shape. */
function parseTikTokLike(rows: Row[], channel: "tiktok" | "tokopedia"): MarketplaceOrder[] {
  const map = new Map<string, MarketplaceOrder>();
  for (const row of rows) {
    const statusKind = detectStatusKind(pick(row, ["Order Status", "Order Substatus", "Cancelation/Return Type", "Status Pesanan"]));
    const orderId = String(pick(row, ["Order ID", "Nomor Invoice", "Order/Invoice ID"]) || "").trim();
    if (!orderId) continue;
    if (/platform unique order id|^order id$/i.test(orderId)) continue;
    const sellerSku = String(pick(row, ["Seller SKU", "SKU Seller", "SKU"]) || "").trim();
    const skuId = String(pick(row, ["SKU ID", "ID SKU", "sku_id"]) || "").trim();
    const variationName = String(pick(row, ["Variation", "Variasi", "Nama Variasi"]) || "").trim();
    const productName = String(pick(row, ["Product Name", "Nama Produk"]) || "");
    const sizeValue = extractSizeValue(variationName || productName);
    const skuCandidates = splitSkuCandidates(sellerSku || undefined, skuId || undefined);
    const sku = skuCandidates[0] ?? "";
    const qty = readNumber(pick(row, ["Quantity", "Jumlah"]));

    if (!map.has(orderId)) {
      const kind = detectOrderKind(row);
      map.set(orderId, {
        order_id: orderId,
        customer_name: String(pick(row, ["Buyer Username", "Nama Pembeli", "Recipient"]) || (channel === "tiktok" ? "TikTok User" : "Tokopedia User")),
        order_date: readDate(pick(row, ["Order Creation Time", "Created Time", "Waktu Pesanan Dibuat"]), TODAY()),
        channel,
        order_kind: kind.order_kind,
        status_kind: statusKind,
        marketplace_status: kind.marketplace_status,
        lines: [],
        shipping_fee: readNumber(pick(row, ["Shipping Fee After Discount", "Shipping Fee", "Ongkos Kirim"])),
        discount: Math.abs(readNumber(pick(row, ["SKU Seller Discount", "Seller Discount", "Diskon Penjual"]))),
        admin_fee: readNumber(pick(row, ["Platform Commission", "Biaya Administrasi", "Komisi"])),
      });
    } else {
      const existing = map.get(orderId)!;
      const kind = detectOrderKind(row);
      if (kind.order_kind === "preorder") existing.order_kind = "preorder";
      if (statusKind !== "normal") existing.status_kind = statusKind;
      existing.marketplace_status ||= kind.marketplace_status;
    }
    if (statusKind !== "normal" || !sku || qty <= 0) continue;
    map.get(orderId)!.lines.push({
      sku,
      sku_candidates: skuCandidates,
      marketplace_sku: skuId || (sizeValue ? `${sku}#${sizeKeyFromValue(sizeValue)}` : sku),
      size_label: variationName || undefined,
      size_value: sizeValue,
      qty,
      unit_price: readNumber(pick(row, ["SKU Unit Original Price", "SKU Subtotal After Discount", "Harga Satuan"])),
      product_name: productName,
      variation_name: variationName || undefined,
    });
  }
  return Array.from(map.values());
}

export function parseMarketplaceFile(
  channel: MarketplaceChannel,
  rows: Row[],
): MarketplaceOrder[] {
  if (channel === "shopee") return parseShopee(rows);
  if (channel === "tokopedia") return parseTikTokLike(rows, "tokopedia");
  return parseTikTokLike(rows, "tiktok");
}
