/**
 * Weighted Average Cost (HPP rata-rata tertimbang) — per SKU.
 *
 * Meeting 2 (11 Mei 2026) decision: HPP dirata-rata **per SKU** (per
 * brand+model+size individual), bukan per brand+model seluruh size.
 * Untuk SQL-side recalculation, lihat RPC `recalculate_hpp_by_sku`.
 *
 * HPP_new = (Stok_lama × HPP_lama + Qty_baru × Harga_beli_baru) / (Stok_lama + Qty_baru)
 *
 * @param currentStock stok SKU tsb sebelum batch masuk
 * @param currentHpp   HPP saat ini untuk SKU tsb
 * @param newQty       jumlah yang masuk di batch baru
 * @param newUnitCost  harga per unit di batch baru
 */
export function calculateHpp(
  currentStock: number,
  currentHpp: number,
  newQty: number,
  newUnitCost: number,
): number {
  if (currentStock + newQty === 0) return 0;
  return (
    (currentStock * currentHpp + newQty * newUnitCost) /
    (currentStock + newQty)
  );
}
