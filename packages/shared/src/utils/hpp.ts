/**
 * Weighted Average Cost (HPP rata-rata tertimbang)
 * Scope: per model — semua size dalam satu model share HPP yang sama
 *
 * HPP Baru = (Stok Lama × HPP Lama + Qty Baru × Harga Beli Baru) / (Stok Lama + Qty Baru)
 */
export function calculateHpp(
  currentStock: number,
  currentHpp: number,
  newQty: number,
  newUnitCost: number
): number {
  if (currentStock + newQty === 0) return 0;
  return (
    (currentStock * currentHpp + newQty * newUnitCost) /
    (currentStock + newQty)
  );
}
