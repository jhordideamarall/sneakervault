/**
 * Client-safe helpers for the stock export round-trip.
 *
 * The owner downloads a "mass update" listing template from the marketplace
 * Seller Center, uploads it here, we overwrite only the stock (and optionally
 * price) cells by matching the template's seller SKU to the system product, then
 * the owner downloads the filled file and re-uploads it to the marketplace. We
 * never store marketplace product IDs — they ride along in the template.
 */

export type ExportChannel = "shopee" | "tiktok";

type ChannelConfig = {
  /** Column header keys that hold the seller SKU (first match wins). */
  skuKeys: string[];
  /** Column header keys to overwrite with system stock (prefix match). */
  stockKeys: string[];
  /** Column header keys to overwrite with system price (prefix match). */
  priceKeys: string[];
};

export const EXPORT_CONFIG: Record<ExportChannel, ChannelConfig> = {
  shopee: {
    skuKeys: ["et_title_variation_sku", "et_title_parent_sku"],
    stockKeys: ["et_title_variation_stock"],
    priceKeys: ["et_title_variation_price"],
  },
  tiktok: {
    skuKeys: ["seller_sku", "sku_id"],
    stockKeys: ["warehouse_quantity"],
    priceKeys: ["price"],
  },
};

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

/** Find the header row index + the resolved column indices for a channel. */
export function locateColumns(
  aoa: unknown[][],
  channel: ExportChannel,
): {
  headerRow: number;
  skuCol: number;
  stockCols: number[];
  priceCols: number[];
} | null {
  const cfg = EXPORT_CONFIG[channel];
  const limit = Math.min(aoa.length, 10);
  for (let r = 0; r < limit; r++) {
    const row = aoa[r] ?? [];
    const cells = row.map(norm);

    const skuCol = cells.findIndex((c) => cfg.skuKeys.some((k) => c === norm(k)));
    if (skuCol === -1) continue;

    const stockCols: number[] = [];
    const priceCols: number[] = [];
    cells.forEach((c, idx) => {
      if (cfg.stockKeys.some((k) => c.startsWith(norm(k)))) stockCols.push(idx);
      if (cfg.priceKeys.some((k) => c === norm(k))) priceCols.push(idx);
    });
    if (stockCols.length === 0) continue;

    return { headerRow: r, skuCol, stockCols, priceCols };
  }
  return null;
}
