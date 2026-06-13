# Multi-channel Pricing + Format Import Katalog

**Status:** [x] In Progress | [ ] Done | [ ] Blocked
**Tanggal Mulai:** 2026-06-14
**Branch:** `feat/fase-a-uat-ux` (lanjutan; belum commit)
**Eksekutor:** Claude langsung (tanpa Codex, sesuai arahan owner)

## Maksud & Tujuan
Fondasi sebelum Fase B/C & reporting: harga jual multi-channel + format import katalog agar sheet client (List Barang Dewinst.id) bisa masuk dengan SKU sebagai kunci + semua harga + stok awal + barcode auto-generate. Desain: `docs/superpowers/specs/2026-06-14-multichannel-pricing-and-import.md`.

## Tasks — DONE
- [x] Migration `20260614140000_multichannel_prices.sql`: products += `price_website, price_shopee, price_tiktok, price_tokopedia` (nullable). Applied & verified.
- [x] `types.ts`: 4 kolom harga di Row/Insert/Update.
- [x] `products.ts` `importRowSchema`: barcode jadi opsional + 4 harga channel; helper `autoBarcode(sku,size)`.
- [x] `importPayload`: barcode auto-gen kalau kosong + isi 4 harga channel.
- [x] `bulkImportProducts` & marketplace loop: normalisasi barcode (dedup aman) + **stop paksa quantity/hpp 0** (saldo awal dari sheet).
- [x] `bulk-import-button.tsx`: template XLSX kolom baru (qty + 4 harga channel, contoh size "42 2/3"), `REQUIRED_COLUMNS` = brand/model/sku/size, hint diperbarui.
- [x] Build hijau + verifikasi MCP (insert produk lengkap → tersimpan benar).

## SKU-anchor + Variant (2026-06-14) — DONE
Temuan: SKU marketplace = kode **colorway** (berulang antar size), tapi sistem paksa `sku` unik → import multi-size ke-skip sbg duplikat; variant tak terbentuk (grouping by model yang namanya berantakan).
Fix: **identitas produk = (sku, size_label); SKU = jangkar, size = variant.**
- [x] Migration `20260614150000_sku_anchor_variants.sql`: drop unique(sku) → unique(sku, size_label) + index sku; `get_inventory_page` paginasi/kelompok per SKU (bukan model). Applied & verified.
- [x] `inventory-client` groupByModel → kunci grup = `sku`.
- [x] `bulkImportProducts` dedup: sku-dedup dibuang → dedup per barcode (auto = sku+size). Size sama-SKU = variant, bukan duplikat.
- [x] Build hijau + verifikasi MCP: 3 size SKU sama → 1 colorway/3 variant; duplikat (sku+size) ditolak.
- Catatan: pencocokan marketplace by sku+size & lookup `.eq(sku).maybeSingle()` di jalur marketplace/fallback = dikerjakan Fase B (jalur belum dipakai saat seeding inventory).

## Parser marketplace (Shopee/TikTok/Tokopedia) selaras SKU-anchor (2026-06-14) — DONE
Bukan Fase B (itu rekonsiliasi order/uang). Ini import KATALOG dari file seller-center → produk colorway+variant.
- [x] `product-import.ts`: draft `size` jadi string (label asli, mis. "38 1/2"); `sku` produk = **parent_sku (Shopee SKU Induk) / seller_sku (TikTok) / Tokopedia seller sku** (colorway anchor) — bukan SKU sintetis per-size lagi. Harga channel: price_shopee / price_tiktok. Barcode = variation id (unik per varian). Shopee fill-down parent_sku.
- [x] `bulkImportMarketplaceProducts` dedup: buang sku-dedup (SKU colorway berulang) → dedup by barcode + marketplace_sku.
- [x] Normalisasi size_label (koma→titik) di trigger DB; `42,5`=`42.5` satu variant.
- [x] Build hijau. **Verifikasi simulasi file Shopee REAL: 618 colorway / 2820 variant** (mis. Puma Speedcat OG → 7 size). Siap di-upload via Import → Shopee.
- Catatan: file Shopee sales-info ini stok & HPP = 0 (cuma katalog + harga Shopee). Stok+HPP real tetap dari template internal. Order reconciliation (no-double) tetap Fase B (hold).

## Ditunda (langkah mikro berikutnya — tracked)
- **Converter xlsx client → format import** (brand=tab, Nama Produk→model, Size→size, SKU→sku, Jumlah→qty, Harga Modal→hpp, Offline&Website→price_offline/website, Shopee→price_shopee, Tiktok→price_tiktok). Skip baris kosong/header section. → import data real → review.
- **UI lihat/edit harga channel** di edit-product-modal + tampil di inventory (productUpdateSchema + gating canEditPrice). Data sudah tersimpan saat import; tinggal expose.
- **Opening-balance journal** (debit Persediaan / kredit Modal Awal) saat import saldo awal — biar neraca benar. Validasi dengan Mei. (Catatan akuntansi jujur: sekarang stok+HPP tersimpan di produk tapi belum ada jurnal saldo awal.)

## Roadmap sisa (urutan)
1. ✅ Multi-channel pricing + import (turn ini)
2. UI harga channel + opening-balance journal (mikro)
3. **Fase B** — mesin rekonsiliasi Order ID (spec `2026-06-14-fase-b-reconciliation-design.md`)
4. **Fase C** — preorder/dropship tabel+menu+jurnal + POS preorder + routing status PO marketplace + packing diperkaya
5. **Reporting** — export PDF/Excel

## Blockers
- (kosong) — Fase B/C edge-case akuntansi & routing PO butuh data real + Mei (Senin) untuk validasi final.

## Files Modified
- apps/web/supabase/migrations/20260614140000_multichannel_prices.sql (new)
- packages/supabase/src/types.ts
- apps/web/src/lib/actions/products.ts
- apps/web/src/components/inventory/bulk-import-button.tsx
- docs/superpowers/specs/2026-06-14-multichannel-pricing-and-import.md (new)
- docs/superpowers/specs/2026-06-14-fase-b-reconciliation-design.md (new, Fase B design)
