# Fase B — Mesin Rekonsiliasi Order ID (Design Spec)

**Tanggal:** 2026-06-14 · **Sumber:** `newmeeting.md` #3,#4,#5 · **Status:** desain disetujui owner (pendekatan "first-touch"); validasi akuntansi final menunggu data real + Mei (Senin).

## Masalah (terbukti di kode)
- Import pesanan (`import_marketplace_order_atomic`) **mengurangi stok + posting jurnal COGS** saat import, deduped hanya via `sales_invoices.marketplace_order_id`.
- Packing (`scanPackingItem`) **mengurangi stok** saat scan, tanpa invoice/jurnal.
- → Bila satu order Shopee **dipacking DAN diimport** → **stok berkurang 2×**. Import tak pernah lihat `packing_sessions.platform_order_id`.

## Prinsip desain: "first-touch yang kurangi stok"
Stok berkurang **tepat 1×**, jurnal/invoice **tepat 1×**, dijembatani **Order ID** (`platform_order_id` ↔ `marketplace_order_id`).

### Keputusan desain (default; dikunci final setelah data Senin)
1. **Otoritas stok = packing bila ada, selain itu import (fallback).**
2. **Link = match teks** `platform_order_id` = `marketplace_order_id`. Tambah kolom `sales_invoices.packing_session_id uuid NULL` untuk jejak + status "sudah dipacking".
3. **Import RPC:** untuk tiap order, cek packing_session dengan `platform_order_id = order_id` dan `status IN ('shipped','completed')` (stok sudah keluar fisik):
   - **Ada** → buat invoice + jurnal **TANPA** `UPDATE products quantity` dan **TANPA** stock_movement outbound kedua (packing sudah). Set `packing_session_id`. Jurnal COGS/persediaan tetap diposting **sekali** (di import) — inventory asset turun sekali.
   - **Tidak ada** → perilaku sekarang (import kurangi stok = fallback "lupa packing").
4. **Packing first / import nyusul** & **import first / packing nyusul** dua-duanya converge ke aturan #3 (Order ID kunci).
5. **Invoice "belum dipacking"** = invoice marketplace tanpa packing_session match (derived).

### ⚠️ Subtlety akuntansi (kenapa butuh validasi Mei)
Saat packing kurangi stok fisik tanpa jurnal, lalu import posting jurnal "persediaan keluar" — net harus benar **sekali**. Interaksi stok-fisik vs nilai-persediaan-jurnal ini halus; **wajib diuji skenario + divalidasi akuntan (Mei) sebelum go-live.**

## #4 Hapus fallback "tambah produk/stok HPP 0"
Hapus `createProductFromMarketplaceLine`, `createMissingProductsFromMarketplaceOrders`, `topUpProductStockForMarketplaceImport` (marketplace-import.ts) + pemanggilnya di `import-marketplace-client.tsx` (baris 28-30, 327, 499, 536). Ganti: baris tak match → **sinyal "data tidak cocok"** + daftar order/SKU bermasalah (mismatch). Tidak auto-bikin produk.

## #8 Packing form diperkaya + "Packing Hari Ini"
- Form packing: pilih item dari stok (scan/cari) ATAU dari barang PO/preorder (Fase C); tetap wajib Order ID.
- Halaman/daftar "Packing Hari Ini" (item apa saja dipacking hari ini) — sekarang cuma di activity_log.

## Pembagian eksekusi
- **Claude (jantung duit):** migration import RPC reconciliation (#3) + kolom `packing_session_id` + uji skenario SQL (assert stok−1 sekali, jurnal balance).
- **Codex (breadth):** hapus fallback + sinyal mismatch (#4), status "belum dipacking" (#5), packing form + "Packing Hari Ini" (#8).

## Hardening (gate sebelum "ship")
Uji skenario SQL sintetis di DB (data dummy, rolled-back/seed terpisah):
1. Packing dulu → import → assert: `products.quantity` turun **1×**, 1 invoice, jurnal **balance** (debit=kredit), 1 outbound movement.
2. Import dulu (tanpa packing) → assert stok turun 1× (fallback), invoice "belum dipacking" kalau belum dipacking.
3. Packing + import + **order ID salah** → assert: TIDAK ada produk baru, muncul sinyal mismatch.
4. Settlement setelahnya → assert invoice released, tak ada perubahan stok ganda.

## Fakta format marketplace (diverifikasi dari file real, 2026-06-14)
Sample: `docs/marketplace-templates/shopee_mass_update_sales_info_*.xlsx`, `Tiktoksellercenter_batchedit_*.xlsx`. Kedua marketplace pisahkan **colorway (parent/seller SKU)** vs **variasi (size)** — cocok dengan model SKU-anchor sistem.

**Shopee "Mass Update Sales Info":** 1 sheet. Header sampah baris 0–5 (baris mesin, label, "Wajib", instruksi); data mulai baris 6.
- `et_title_parent_sku` (SKU Induk) → **sku** (colorway). **Hanya terisi di baris variasi pertama** tiap produk → wajib fill-down ke variasi berikutnya.
- `et_title_variation_name` (Nama Variasi) → **size** (mis. "38 1/2", pecahan).
- `et_title_variation_sku` (SKU) sering **kosong**. `et_title_product_name`→model. `et_title_variation_price`→price_shopee. `et_title_variation_stock`→stok (round-trip overwrite). `et_title_product_id` sama utk semua variasi (group key).

**TikTok "Batch Edit All Information":** sheet "Template" (kosong = struktur saja) + sheet referensi (Instruction/HiddenStyle/HiddenAttr/SalePlatform/TemplateConfig).
- `seller_sku` (SKU Penjual, opsional) → **sku** (colorway). `variation_value` (Nilai Variasi) → **size**. `product_name`→model. `price`→price_tiktok. `sku_id`=id variasi.
- **`pre_order_time` (Pre-sale) = penanda PRE-ORDER** → dipakai untuk **routing otomatis ke jalur preorder (Fase C)**. Shopee sales-info tidak punya kolom PO eksplisit.
- **Stok dipecah per-gudang**: `warehouse_quantity/7325254` (Denpasar), `/7514901` (Jakarta), `/7635317` (Tangerang) → round-trip export harus putuskan tulis ke gudang mana / jumlah.

**Implikasi parser (Fase B):** ganti pembuatan SKU sintetis per-size (`product-import.ts` skuWithSize) → pakai parent/seller SKU sebagai `sku` + variation sebagai `size_label`. Normalisasi gaya half-size: Shopee/TikTok tulis "38 1/2" (pecahan), template internal "38.5" — samakan saat matching sku+size. `extractShoeSize` sudah handle pecahan→desimal, tapi simpan size_label aslinya.

## Batasan dipatuhi
Migration file baru (additive/idempotent), verifikasi MCP, no destructive, branch feature, no push tanpa diminta. Validasi data real = Senin.
