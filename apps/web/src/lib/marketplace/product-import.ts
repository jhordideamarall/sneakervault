import type { ExportChannel } from "./export";
import { readNumber } from "./parsers";

export type ProductImportChannel = "shopee" | "tiktok" | "tokopedia";

export type MarketplaceProductImportDraft = {
  marketplace_sku: string;
  marketplace_product_id?: string;
  marketplace_variation_id?: string;
  brand: string;
  model: string;
  /** sku = colorway anchor (parent/seller SKU), SAMA antar size = variant. */
  sku: string;
  /** size_label apa adanya dari marketplace (mis. "38 1/2"). */
  size: string;
  /** size numerik (desimal) untuk match lintas-sumber (38 1/2 & 38.5 → 38.5). */
  size_value: number;
  color?: string;
  barcode: string;
  quantity: number;
  sell_price: number;
  price_offline: number;
  price_shopee?: number;
  price_tiktok?: number;
  price_tokopedia?: number;
};

export type MarketplaceProductImportRejectedRow = {
  row: number;
  reason: string;
};

export type MarketplaceProductImportParseResult = {
  rows: MarketplaceProductImportDraft[];
  rejected: MarketplaceProductImportRejectedRow[];
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

function norm(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function readCell(row: unknown[] | undefined, index: number | undefined) {
  if (!row || index === undefined || index < 0) return "";
  return String(row[index] ?? "").trim();
}

function isInstructionValue(value: string) {
  const lower = norm(value);
  return (
    !lower ||
    lower === "sku" ||
    lower === "sku id" ||
    lower === "id sku" ||
    lower === "seller sku" ||
    lower === "sku penjual" ||
    lower === "opsional" ||
    lower === "wajib" ||
    lower === "wajib diisi sesuai syarat" ||
    lower === "tidak dapat diedit" ||
    lower.includes("\n") ||
    lower.length > 80
  );
}

function headerIndex(row: unknown[] | undefined) {
  const map = new Map<string, number>();
  (row ?? []).forEach((cell, index) => {
    const key = norm(cell);
    if (key) map.set(key, index);
  });
  return map;
}

function findHeaderRow(aoa: unknown[][], requiredKeys: string[]) {
  const limit = Math.min(aoa.length, 12);
  for (let i = 0; i < limit; i++) {
    const headers = headerIndex(aoa[i]);
    if (requiredKeys.every((key) => headers.has(key))) return i;
  }
  return -1;
}

function sanitizeGeneratedPart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripMarketplaceWords(value: string) {
  return value
    .replace(/\((?:100%\s*)?authentic\)/gi, "")
    .replace(/\bBNIB\b/gi, "")
    .replace(/\bRESMI\b/gi, "")
    .replace(/\bORIGINAL\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isCancelledLike(value: unknown): boolean {
  const status = norm(value);
  return (
    status.includes("batal") ||
    status.includes("cancel") ||
    status.includes("refund") ||
    status.includes("return") ||
    status.includes("pengembalian")
  );
}

function splitBrandModel(productName: string, brandHint?: string) {
  const cleaned = stripMarketplaceWords(productName);
  const hint = stripMarketplaceWords(brandHint ?? "");
  if (hint && !["tidak dapat diedit", "opsional", "wajib"].includes(norm(hint))) {
    const model = cleaned.toLowerCase().startsWith(hint.toLowerCase())
      ? cleaned.slice(hint.length).trim()
      : cleaned;
    return { brand: hint, model: model || cleaned };
  }

  const match = BRAND_PREFIXES.find((brand) => cleaned.toLowerCase().startsWith(brand.toLowerCase()));
  if (match) {
    return { brand: match, model: cleaned.slice(match.length).trim() || cleaned };
  }

  const [brand = "Marketplace", ...rest] = cleaned.split(/\s+/);
  return { brand, model: rest.join(" ") || cleaned || "Imported Product" };
}

export function extractShoeSize(value: unknown): number | null {
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

function sizeForSku(size: number) {
  return String(size).replace(".", "_");
}

function skuWithSize(baseSku: string, size: number) {
  const clean = sanitizeGeneratedPart(baseSku);
  const sizeKey = sizeForSku(size);
  const normalized = clean.replace(/[.,]/g, "_").toLowerCase();
  if (
    normalized.endsWith(`-${sizeKey.toLowerCase()}`) ||
    normalized.endsWith(`_${sizeKey.toLowerCase()}`)
  ) {
    return clean;
  }
  return clean ? `${clean}-${sizeKey}` : "";
}

function unsupportedSizeReason(value: string) {
  const label = value || "-";
  return `Variasi "${label}" tidak punya size numerik. Row seperti "Size Lain? Ready" tidak bisa diimport; ubah menjadi size jelas seperti 40, 40.5, atau 43.33.`;
}

function shopeeRowKey(params: {
  productId: string;
  variationId: string;
  parentSku: string;
  variationSku: string;
  size: number | null;
}) {
  if (params.variationSku) return params.variationSku;
  if (params.parentSku && params.size) return `${params.parentSku}-${sizeForSku(params.size)}`;
  if (params.productId && params.variationId) return `shopee:${params.productId}:${params.variationId}`;
  return params.parentSku;
}

function findWarehouseColumns(headers: Map<string, number>) {
  return Array.from(headers.entries())
    .filter(([key]) => key.startsWith("warehouse_quantity"))
    .map(([, index]) => index);
}

export function parseMarketplaceProductTemplate(
  channel: ProductImportChannel,
  aoa: unknown[][],
): MarketplaceProductImportParseResult {
  if (channel === "shopee") return parseShopeeProducts(aoa);
  if (channel === "tiktok") return parseTikTokProducts(aoa);
  return parseTokopediaProducts(aoa);
}

function parseShopeeProducts(aoa: unknown[][]): MarketplaceProductImportParseResult {
  const headerRow = findHeaderRow(aoa, ["et_title_product_id", "et_title_product_name", "et_title_variation_id"]);
  if (headerRow === -1) return { rows: [], rejected: [] };

  const headers = headerIndex(aoa[headerRow]);
  const productIdCol = headers.get("et_title_product_id");
  const nameCol = headers.get("et_title_product_name");
  const variationIdCol = headers.get("et_title_variation_id");
  const variationNameCol = headers.get("et_title_variation_name");
  const parentSkuCol = headers.get("et_title_parent_sku");
  const variationSkuCol = headers.get("et_title_variation_sku");
  const priceCol = headers.get("et_title_variation_price");
  const gtinCol = headers.get("ps_gtin_code");
  const stockCol = headers.get("et_title_variation_stock");
  const parentSkuByProduct = new Map<string, string>();
  const rows: MarketplaceProductImportDraft[] = [];
  const rejected: MarketplaceProductImportRejectedRow[] = [];

  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r];
    const productId = readCell(row, productIdCol);
    const productName = readCell(row, nameCol);
    const variationId = readCell(row, variationIdCol);
    const variationName = readCell(row, variationNameCol);
    const parentSku = readCell(row, parentSkuCol);
    const variationSku = readCell(row, variationSkuCol);
    if (!productId || !/^\d+$/.test(productId) || !productName || !variationId) continue;
    if (parentSku) parentSkuByProduct.set(productId, parentSku);

    const baseSku = parentSku || parentSkuByProduct.get(productId) || "";
    const sizeNum = extractShoeSize(variationName);
    if (!sizeNum) {
      rejected.push({ row: r + 1, reason: unsupportedSizeReason(variationName) });
      continue;
    }
    const sizeLabel = String(variationName).trim();

    const marketplaceSku = shopeeRowKey({
      productId,
      variationId,
      parentSku: baseSku,
      variationSku,
      size: sizeNum,
    });
    if (!marketplaceSku) continue;

    // SKU produk = colorway (SKU Induk); size = variant; barcode = variation id (unik per varian).
    const sku = baseSku || variationSku || `SHOPEE-${productId}`;
    const { brand, model } = splitBrandModel(productName);
    const price = readNumber(readCell(row, priceCol));
    rows.push({
      marketplace_sku: marketplaceSku,
      marketplace_product_id: productId,
      marketplace_variation_id: variationId,
      brand,
      model,
      sku,
      size: sizeLabel,
      size_value: sizeNum,
      barcode: readCell(row, gtinCol) || variationId || `${sku}-${variationId}`,
      quantity: Math.max(0, Math.trunc(readNumber(readCell(row, stockCol)))),
      sell_price: price,
      price_offline: price,
      price_shopee: price,
    });
  }

  return { rows, rejected };
}

function parseTikTokProducts(aoa: unknown[][]): MarketplaceProductImportParseResult {
  const headerRow = findHeaderRow(aoa, ["product_id", "product_name", "sku_id"]);
  if (headerRow === -1) return { rows: [], rejected: [] };

  const headers = headerIndex(aoa[headerRow]);
  const stockCols = findWarehouseColumns(headers);
  const productIdCol = headers.get("product_id");
  const skuIdCol = headers.get("sku_id");
  const nameCol = headers.get("product_name");
  const variationCol = headers.get("variation_value");
  const brandCol = headers.get("brand");
  const priceCol = headers.get("price");
  const sellerSkuCol = headers.get("seller_sku");
  const rows: MarketplaceProductImportDraft[] = [];
  const rejected: MarketplaceProductImportRejectedRow[] = [];

  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r];
    const productId = readCell(row, productIdCol);
    const skuId = readCell(row, skuIdCol);
    const productName = readCell(row, nameCol);
    const variation = readCell(row, variationCol);
    const sellerSku = readCell(row, sellerSkuCol);
    if (!productName || (!sellerSku && !skuId)) continue;
    if (isInstructionValue(skuId) && (!sellerSku || isInstructionValue(sellerSku))) continue;

    const sizeNum = extractShoeSize(variation || productName);
    if (!sizeNum) {
      rejected.push({ row: r + 1, reason: unsupportedSizeReason(variation || productName) });
      continue;
    }
    const sizeLabel = String(variation || "").trim() || String(sizeNum);
    // marketplace_sku = kunci per-varian (unik) untuk mapping; sku produk = SKU Penjual (colorway).
    const marketplaceSku = sellerSku ? skuWithSize(sellerSku, sizeNum) : skuId;
    const sku = sellerSku || `TIKTOK-${sanitizeGeneratedPart(productId || skuId)}`;
    const { brand, model } = splitBrandModel(productName, readCell(row, brandCol));
    const price = readNumber(readCell(row, priceCol));
    const quantity = stockCols.reduce((sum, col) => sum + Math.max(0, Math.trunc(readNumber(readCell(row, col)))), 0);

    rows.push({
      marketplace_sku: marketplaceSku,
      marketplace_product_id: productId || undefined,
      marketplace_variation_id: skuId || undefined,
      brand,
      model,
      sku,
      size: sizeLabel,
      size_value: sizeNum,
      barcode: skuId || `${sku}-${sizeLabel}`,
      quantity,
      sell_price: price,
      price_offline: price,
      price_tiktok: price,
    });
  }

  return { rows, rejected };
}

function parseTokopediaProducts(aoa: unknown[][]): MarketplaceProductImportParseResult {
  const headerRow = findHeaderRow(aoa, ["order id", "sku id", "product name"]);
  if (headerRow === -1) return { rows: [], rejected: [] };

  const headers = headerIndex(aoa[headerRow]);
  const orderIdCol = headers.get("order id");
  const statusCol = headers.get("order status");
  const substatusCol = headers.get("order substatus");
  const cancelCol = headers.get("cancelation/return type");
  const skuIdCol = headers.get("sku id");
  const sellerSkuCol = headers.get("seller sku");
  const nameCol = headers.get("product name");
  const variationCol = headers.get("variation");
  const priceCol = headers.get("sku unit original price");
  const seen = new Set<string>();
  const rows: MarketplaceProductImportDraft[] = [];
  const rejected: MarketplaceProductImportRejectedRow[] = [];

  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r];
    const orderId = readCell(row, orderIdCol);
    if (orderId && !/^\d+$/.test(orderId)) continue;
    if (
      isCancelledLike(readCell(row, statusCol)) ||
      isCancelledLike(readCell(row, substatusCol)) ||
      isCancelledLike(readCell(row, cancelCol))
    ) {
      continue;
    }
    const skuId = readCell(row, skuIdCol);
    const sellerSku = readCell(row, sellerSkuCol);
    const productName = readCell(row, nameCol);
    const variation = readCell(row, variationCol);
    if (!productName || (!sellerSku && !skuId)) continue;
    if (isInstructionValue(skuId) && (!sellerSku || isInstructionValue(sellerSku))) continue;

    const sizeNum = extractShoeSize(variation || productName);
    if (!sizeNum) {
      rejected.push({ row: r + 1, reason: unsupportedSizeReason(variation || productName) });
      continue;
    }
    const sizeLabel = String(variation || "").trim() || String(sizeNum);
    const marketplaceSku = sellerSku ? skuWithSize(sellerSku, sizeNum) : skuId;
    if (seen.has(marketplaceSku)) continue;
    seen.add(marketplaceSku);

    const sku = sellerSku || `TOKOPEDIA-${sanitizeGeneratedPart(skuId)}`;
    const { brand, model } = splitBrandModel(productName);
    const price = readNumber(readCell(row, priceCol));
    rows.push({
      marketplace_sku: marketplaceSku,
      marketplace_variation_id: skuId || undefined,
      brand,
      model,
      sku,
      size: sizeLabel,
      size_value: sizeNum,
      barcode: skuId || `${sku}-${sizeLabel}`,
      quantity: 0,
      sell_price: price,
      price_offline: price,
      price_tokopedia: price,
    });
  }

  return { rows, rejected };
}

export function extractStockTemplateRowKeys(
  aoa: unknown[][],
  channel: ExportChannel,
  headerRow: number,
): { keys: string[]; rowKeys: Record<number, string> } {
  const headers = headerIndex(aoa[headerRow]);
  const rowKeys: Record<number, string> = {};

  if (channel === "shopee") {
    const productIdCol = headers.get("et_title_product_id");
    const variationIdCol = headers.get("et_title_variation_id");
    const variationNameCol = headers.get("et_title_variation_name");
    const parentSkuCol = headers.get("et_title_parent_sku");
    const variationSkuCol = headers.get("et_title_variation_sku");
    const parentSkuByProduct = new Map<string, string>();

    for (let r = headerRow + 1; r < aoa.length; r++) {
      const row = aoa[r];
      const productId = readCell(row, productIdCol);
      const variationId = readCell(row, variationIdCol);
      const parentSku = readCell(row, parentSkuCol);
      const variationSku = readCell(row, variationSkuCol);
      if (!productId || !/^\d+$/.test(productId) || !variationId) continue;
      if (parentSku) parentSkuByProduct.set(productId, parentSku);
      const size = extractShoeSize(readCell(row, variationNameCol));
      if (!size) continue;
      const key = shopeeRowKey({
        productId,
        variationId,
        parentSku: parentSku || parentSkuByProduct.get(productId) || "",
        variationSku,
        size,
      });
      if (key) rowKeys[r] = key;
    }
  } else {
    const sellerSkuCol = headers.get("seller_sku");
    const skuIdCol = headers.get("sku_id");
    const variationCol = headers.get("variation_value") ?? headers.get("variation");
    const nameCol = headers.get("product_name");
    for (let r = headerRow + 1; r < aoa.length; r++) {
      const sellerSku = readCell(aoa[r], sellerSkuCol);
      const skuId = readCell(aoa[r], skuIdCol);
      const size = extractShoeSize(readCell(aoa[r], variationCol) || readCell(aoa[r], nameCol));
      const key = sellerSku && size ? skuWithSize(sellerSku, size) : skuId || sellerSku;
      if (isInstructionValue(key)) continue;
      if (key) rowKeys[r] = key;
    }
  }

  return { keys: Array.from(new Set(Object.values(rowKeys))), rowKeys };
}
