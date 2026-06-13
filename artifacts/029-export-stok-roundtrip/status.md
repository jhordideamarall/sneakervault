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
- [x] Uji parse template Shopee nyata `shopee_mass_update_sales_info_318480383_20260611124242.xlsx`
- [x] Uji deteksi kolom template TikTok nyata `Tiktoksellercenter_batchedit_20260611_all_information_template_1.xlsx`
- [x] Filter baris metadata/instruksi template sebelum query SKU
- [x] Chunk query Supabase + tampilkan toast jika matching SKU gagal
- [x] type-check hijau

## Blockers
- E2E upload-download via UI browser belum dijalankan di sesi ini. Template Shopee nyata sudah diparse offline; template TikTok nyata yang tersedia masih instruction-only (0 SKU data produk). Tokopedia export stok belum bisa dikunci tanpa template stok/update produk Tokopedia nyata. Kolom: Shopee `et_title_parent_sku`/`et_title_variation_sku`, `et_title_variation_stock`, `et_title_variation_price`; TikTok `seller_sku`/`sku_id`, `warehouse_quantity*`, `price`.

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
- 2026-06-12: Template Shopee nyata punya 3.391 data rows dan baris metadata/instruksi. Setelah filtering, terbaca 602 SKU bersih. Matching server sekarang dipecah per 100 SKU agar tidak membuat query `.in()` terlalu besar.
- 2026-06-12: Keputusan UX: tidak auto-detect/auto-switch channel. User pilih tab Shopee/TikTok; upload salah tab ditolak karena kolom tidak cocok.
