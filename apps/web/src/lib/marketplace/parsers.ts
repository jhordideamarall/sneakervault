/**
 * Client-safe marketplace order parsers.
 *
 * Pure functions: take the rows produced by SheetJS `sheet_to_json` plus the
 * channel the user explicitly selected, and return normalized MarketplaceOrder[]
 * grouped by order id. Header aliases cover the real export templates in
 * docs/marketplace-templates/ plus older column names for resilience.
 */

export type MarketplaceChannel = "shopee" | "tokopedia" | "tiktok";

export type MarketplaceOrderLine = {
  sku: string;
  qty: number;
  unit_price: number;
  product_name: string;
};

export type MarketplaceOrder = {
  order_id: string;
  customer_name: string;
  order_date: string;
  channel: MarketplaceChannel;
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
  const cleaned = value
    .replace(/rp/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
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

/** Best-effort channel auto-detect from header keys (validation aid). */
export function detectChannel(rows: Row[]): MarketplaceChannel | null {
  const keys = rows[0] ? Object.keys(rows[0]) : [];
  if (keys.includes("No. Pesanan") || keys.includes("Nomor Referensi SKU") || keys.includes("Order ID Shopee")) {
    return "shopee";
  }
  if (keys.includes("Order ID") && (keys.includes("Seller SKU") || keys.includes("SKU Seller"))) {
    // TikTok and Tokopedia share the same export shape; caller's tab disambiguates.
    return "tiktok";
  }
  return null;
}

const TODAY = () => new Date().toISOString().slice(0, 10);

function parseShopee(rows: Row[]): MarketplaceOrder[] {
  const map = new Map<string, MarketplaceOrder>();
  for (const row of rows) {
    const orderId = String(pick(row, ["No. Pesanan", "Order ID Shopee"]) || "").trim();
    const sku = String(pick(row, ["Nomor Referensi SKU", "No. Referensi SKU", "SKU Induk"]) || "").trim();
    const qty = readNumber(pick(row, ["Jumlah"]));
    if (!orderId || !sku || qty <= 0) continue;

    if (!map.has(orderId)) {
      map.set(orderId, {
        order_id: orderId,
        customer_name: String(pick(row, ["Username (Pembeli)", "Nama Penerima"]) || "Shopee User"),
        order_date: readDate(pick(row, ["Waktu Pesanan Dibuat", "Waktu Pembayaran Dilakukan"]), TODAY()),
        channel: "shopee",
        lines: [],
        shipping_fee: readNumber(pick(row, ["Ongkos Kirim Dibayar oleh Pembeli", "Ongkos Kirim Dibayar Pembeli"])),
        discount: Math.abs(readNumber(pick(row, ["Diskon Dari Penjual", "Total Diskon"]))),
        admin_fee: readNumber(pick(row, ["Biaya Administrasi", "Estimasi Potongan Biaya Pengiriman"])),
      });
    }
    map.get(orderId)!.lines.push({
      sku,
      qty,
      unit_price: readNumber(pick(row, ["Harga Setelah Diskon", "Harga Awal", "Harga Asli"])),
      product_name: String(pick(row, ["Nama Produk"]) || ""),
    });
  }
  return Array.from(map.values());
}

/** TikTok and Tokopedia order exports share the same column shape. */
function parseTikTokLike(rows: Row[], channel: "tiktok" | "tokopedia"): MarketplaceOrder[] {
  const map = new Map<string, MarketplaceOrder>();
  for (const row of rows) {
    const orderId = String(pick(row, ["Order ID", "Nomor Invoice", "Order/Invoice ID"]) || "").trim();
    const sku = String(pick(row, ["Seller SKU", "SKU Seller", "SKU"]) || "").trim();
    const qty = readNumber(pick(row, ["Quantity", "Jumlah"]));
    if (!orderId || !sku || qty <= 0) continue;

    if (!map.has(orderId)) {
      map.set(orderId, {
        order_id: orderId,
        customer_name: String(pick(row, ["Buyer Username", "Nama Pembeli", "Recipient"]) || (channel === "tiktok" ? "TikTok User" : "Tokopedia User")),
        order_date: readDate(pick(row, ["Order Creation Time", "Created Time", "Waktu Pesanan Dibuat"]), TODAY()),
        channel,
        lines: [],
        shipping_fee: readNumber(pick(row, ["Shipping Fee", "Ongkos Kirim"])),
        discount: Math.abs(readNumber(pick(row, ["Seller Discount", "Diskon Penjual"]))),
        admin_fee: readNumber(pick(row, ["Platform Commission", "Biaya Administrasi", "Komisi"])),
      });
    }
    map.get(orderId)!.lines.push({
      sku,
      qty,
      unit_price: readNumber(pick(row, ["SKU Unit Original Price", "SKU Subtotal After Discount", "Harga Satuan"])),
      product_name: String(pick(row, ["Product Name", "Nama Produk"]) || ""),
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
