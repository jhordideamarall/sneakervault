# Export Stok Round-Trip (Marketplace)

**Status:** [x] Done (pending E2E dgn template nyata)
**Sprint:** Marketplace File-Based Sync
**Tanggal Mulai:** 2026-06-12
**Tanggal Selesai:** 2026-06-12

## Tasks
- [x] Helper `export.ts` — deteksi header row + kolom SKU/stok/harga per channel
- [x] Server `getStockForExport` (read-only) — resolve via exact SKU + sku_map
- [x] Client `export-stok-client.tsx` — upload template, match, ringkasan, generate xlsx (struktur dipertahankan, hanya kolom stok/harga ditimpa)
- [x] Toggle opsional update harga (default mati)
- [x] Page `/penjualan/export-stok` + permission + sidebar item
- [x] type-check hijau

## Blockers
- E2E dgn template Seller Center nyata belum dijalankan. Kolom: Shopee `et_title_variation_sku/stock/price`, TikTok `seller_sku`/`sku_id`, `warehouse_quantity*`, `price`.

## Files Modified
- apps/web/src/lib/marketplace/export.ts (baru)
- apps/web/src/lib/actions/stock-export.ts (baru)
- apps/web/src/components/penjualan/export-stok-client.tsx (baru)
- apps/web/src/app/(dashboard)/penjualan/export-stok/page.tsx (baru)
- apps/web/src/config/permissions.ts, components/dashboard/sidebar.tsx

## Catatan
- Round-trip: template marketplace bawa product_id/variation_id sendiri; sistem hanya menimpa kolom stok (+harga opsional) dengan mencocokkan seller_sku.
- Tidak ada tulis DB (read-only) — aman.
- Mutasi cell di worksheet asli (preserve format/kolom lain), bukan regenerate dari nol.
- Tokopedia export menyusul (template stok Tokopedia belum disediakan).
