# Marketplace Template + Finance Alignment

**Status:** [x] Done
**Sprint:** Marketplace File-Based Sync
**Tanggal Mulai:** 2026-06-12
**Tanggal Selesai:** 2026-06-12

## Tasks
- [x] Per-channel template validation untuk import order (tanpa auto-switch channel)
- [x] Parser order skip baris batal/refund/return dari template marketplace
- [x] Validasi export stok Shopee/TikTok dengan template nyata per tab
- [x] Selaraskan channel Tokopedia di shared types, invoice, journal, dan laporan finance
- [x] Perjelas label import/export supaya Inventory vs Penjualan tidak tertukar
- [x] Guard import produk inventory agar template marketplace cepat ditolak
- [x] Tambah bootstrap import produk dari Shopee/TikTok/Tokopedia di Inventory
- [x] Update stock export pakai key variasi Shopee agar match setelah bootstrap
- [x] Tambah jalan keluar Review Import untuk SKU unknown: petakan, buat produk, atau tambah stok kurang
- [x] Tambah warning HPP 0 supaya financial/COGS tidak dianggap final
- [x] Settlement import baca workbook multi-sheet resmi tanpa menerima custom Excel bebas
- [x] Settlement import disederhanakan jadi satu kali upload: buat Penerimaan Penjualan dan lunasi faktur
- [x] Update dokumentasi/artifact marketplace
- [x] type-check/lint hijau

## Blockers
- Tokopedia export stok belum bisa dikunci tanpa template stok/update produk Tokopedia nyata.
- UI upload/download E2E belum dilakukan: Browser plugin ada, tapi instance `iab` tidak tersedia di sesi ini. Route protected smoke via `curl -I` hanya membuktikan redirect normal ke `/login`.

## Files Modified
- packages/shared/src/types.ts
- packages/shared/src/validators.ts
- packages/shared/src/constants.ts
- apps/web/src/lib/actions/data-sync.ts
- apps/web/src/lib/journal-engine.ts
- apps/web/src/lib/actions/sales-invoices.ts
- apps/web/src/lib/actions/settlement-import.ts
- apps/web/src/lib/queries/index.ts
- apps/web/src/lib/marketplace/parsers.ts
- apps/web/src/lib/marketplace/export.ts
- apps/web/src/lib/marketplace/product-import.ts
- apps/web/src/lib/marketplace/settlement-parsers.ts
- apps/web/src/components/customers/customers-client.tsx
- apps/web/src/components/penjualan/invoice-client.tsx
- apps/web/src/components/penjualan/import-marketplace-client.tsx
- apps/web/src/components/penjualan/export-stok-client.tsx
- apps/web/src/components/penjualan/settlement-import-client.tsx
- apps/web/src/components/inventory/bulk-import-button.tsx
- apps/web/src/components/inventory/inventory-client.tsx
- apps/web/src/components/dashboard/sidebar.tsx
- apps/web/src/components/export-buttons.tsx
- apps/web/src/lib/actions/products.ts
- apps/web/src/app/(dashboard)/penjualan/import-marketplace/page.tsx
- apps/web/src/app/(dashboard)/penjualan/export-stok/page.tsx
- apps/web/src/app/(dashboard)/penjualan/settlement/page.tsx
- apps/web/supabase/migrations/20260612000100_marketplace_sync_foundation.sql
- apps/web/supabase/migrations/20260612000200_settle_marketplace_atomic.sql
- artifacts/028-import-order-diff/status.md
- artifacts/029-export-stok-roundtrip/status.md
- artifacts/034-marketplace-template-finance-alignment/status.md

## Catatan
- Keputusan 2026-06-12: jangan auto-detect/auto-switch. User pilih tab marketplace; sistem memvalidasi template sesuai tab dan memberi error kalau salah.
- Fixture order nyata: Shopee 6 order valid dari 11 row, TikTok 2 order valid dari 4 row, Tokopedia 11 order valid dari 19 row setelah baris batal/refund/return diskip.
- Fixture export stok nyata: Shopee ketemu SKU col 4, stok col 8, harga col 6; TikTok ketemu SKU col 12, stok col 9/10/11, harga col 7. TikTok template yang tersedia belum punya row SKU produk.
- Label final: Inventory = produk/SKU internal; Penjualan → Import Pesanan = order marketplace; Penjualan → Update Stok Marketplace = isi template stock update; Penjualan → Rekonsiliasi Settlement = payout marketplace.
- Import Produk Inventory sekarang cek kolom wajib `brand/model/sku/size/barcode` sebelum server action dan batch query/insert barcode/SKU agar file besar tidak lambat per baris.
- Inventory → Import Produk sekarang punya sumber Internal, Shopee, TikTok Shop, Tokopedia. Marketplace import membuat produk + `marketplace_sku_map`; HPP default 0 untuk bootstrap data kosong.
- Shopee Mass Update: variasi tanpa seller SKU per size dibuatkan key dari parent SKU + size atau product/variation ID agar upload template yang sama bisa match di Update Stok Marketplace.
- Import order Shopee sekarang memakai SKU parent + size jika variation SKU kosong, misalnya `CD6404-026-45`, agar SKU parent tidak salah memetakan banyak size.
- Review Import: SKU unknown bisa dibuat jadi produk dari order; stok awal = qty order, HPP = 0. Baris low stock bisa ditambah stok dari review. HPP 0 ditandai sebagai warning karena COGS/laba belum final.
- Settlement multi-sheet resmi: Shopee dibaca dari sheet `Income`; TikTok/Tokopedia dari sheet `Detail pesanan`. Sheet ringkasan/penjelasan/detail fee diabaikan agar angka tidak dobel. Custom Excel bebas ditolak lewat validasi header.
- Keputusan 2026-06-13: settlement bukan dua kali upload. Import pesanan membuat faktur belum dibayar; import settlement satu kali saat dana cair membuat `customer_payments` + allocations, mark invoice paid, update bank, dan jurnal biaya marketplace aktual.
- Cek workbook order: `Format Pesanan Shopee.xlsx` punya 12 row non-empty, TikTok 5 row, Tokopedia 20 row. File tidak kosong; kemungkinan preview editor yang tampak kosong.
- Validasi: `pnpm --filter @sneakervault/web type-check`, `pnpm --filter @sneakervault/web lint` (0 error, warning existing), `git diff --check`, fixture parser via Node + SheetJS, `curl -I` protected routes redirect `/login`, Supabase auth smoke owner aktif.
