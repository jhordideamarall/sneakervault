# Multi-channel Pricing + Format Import Katalog (Design)

**Tanggal:** 2026-06-14 · **Eksekutor:** Claude (langsung, tanpa Codex) · **Sumber:** arahan owner + `newmeeting.md`.

## Maksud & tujuan
Fondasi sebelum Fase B/C & reporting: (1) harga jual **multi-channel** (bukan diperas ke 2 field), (2) **format import katalog** agar sheet client (List Barang Dewinst.id) bisa masuk dengan **SKU sebagai kunci** + semua harga + stok awal + barcode auto-generate. SKU = jangkar semua alur marketplace.

## Keputusan (dikunci owner)
- **Harga multi-channel.** Pertahankan `sell_price` (= harga **online** default) & `price_offline` (= **offline**/toko). Tambah kolom: `price_website`, `price_shopee`, `price_tiktok`, `price_tokopedia` (numeric NULL; NULL = fallback ke `sell_price`).
- **Import = saldo awal (opsi A).** Bulk import katalog membawa **quantity + hpp** dari sheet (sekarang dipaksa 0). Cepat untuk UAT.
- **Barcode auto-generate** kalau kosong: `<sku>-<size_label>` dinormalisasi (unik per SKU+size, scannable). Client cetak via menu Barcode.
- **Preorder** (Fase C): tabel terpisah, jurnal "modal preorder" sendiri — tidak average ke HPP stok.

## Schema (migration additive)
`products` += `price_website, price_shopee, price_tiktok, price_tokopedia numeric NULL`.

## Import format (template internal baru)
Kolom: `brand, model, sku, size, color, quantity, hpp, sell_price, price_offline, price_website, price_shopee, price_tiktok, price_tokopedia`.
- `barcode` opsional (auto-gen kalau kosong).
- Map dari sheet client: tab→brand, Nama Produk→model, SKU→sku, Size→size (free-text), Jumlah→quantity, Harga Modal→hpp, Offline&Website→price_offline+price_website, Shopee→price_shopee, Tiktok→price_tiktok.

## ⚠️ Catatan akuntansi jujur
Import saldo awal mengisi `quantity`+`hpp` di produk (stok & view inventory benar), TAPI **belum** posting jurnal opening-balance (debit Persediaan / kredit Modal Awal). Untuk neraca benar, opening-balance journal = langkah terpisah (akan ditambah; divalidasi dengan Mei). Tidak diam-diam — dicatat sebagai gap.

## Roadmap sisa (urutan eksekusi, semua oleh Claude, terdokumentasi)
1. **(turn ini) Multi-channel pricing + import katalog** — fondasi.
2. **Fase B** — mesin rekonsiliasi Order ID (spec: `2026-06-14-fase-b-reconciliation-design.md`). Money-critical → uji skenario SQL.
3. **Fase C** — preorder/dropship tabel+menu+jurnal terpisah; POS preorder; routing status PO dari marketplace (butuh sampel export real Senin); packing diperkaya.
4. **Reporting** — export PDF/Excel (laporan stok, penjualan, laba, dll).

## Verifikasi turn ini
- Migration applied + verified via MCP (kolom ada).
- Import: insert produk dengan qty+hpp+harga channel + barcode auto-gen → tersimpan benar.
- `pnpm --filter web build` hijau.
