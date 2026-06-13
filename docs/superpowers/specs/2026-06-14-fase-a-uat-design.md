# Fase A UAT — Design Spec (Size free-text · Rename PO · Role import)

**Tanggal:** 2026-06-14
**Sumber kebutuhan:** `newmeeting.md` (meeting client Dewinst 13 Jun) → lihat ringkasan di `docs/improvement-plan-uat-meeting.md`.
**Status:** Disetujui owner (Jhordi) untuk dieksekusi.

## Kenapa Fase A dikerjakan duluan (maksud & tujuan)

Stok akan **diinput sendiri oleh client** mulai Senin. Tiga hal ini adalah **prasyarat** agar client bisa input & mengelola data dengan benar, dan **tidak menyentuh** mesin rekonsiliasi marketplace (Fase B) sehingga aman dikerjakan paralel:

1. **#6 Size free-text** — *gating.* Kolom `products.size` bertipe `numeric`, mustahil menyimpan ukuran Adidas `42 2/3`, `38 2/3`, `43 1/3`. Tanpa ini client mentok saat input Adidas (mayoritas stok: 451 pasang). Dunia mengenal size Adidas sebagai pecahan; Shopee menulisnya plain text. SKU tetap kunci pencocokan — size hanya display/grouping.
2. **#2 Rename "Purchase Order" → "Pembelian Barang"** — istilah "PO" disalahartikan tim sebagai "Pre-Order". Hindari salah persepsi sebelum UAT.
3. **#9 Role import = Finance** — impor pesanan adalah data keuangan (tugas Mei/finance). Saat ini izinnya kebablasan (`[...ROLES]` = semua role), harus diketatkan.

## #6 Size free-text — desain

**Prinsip:** *additive, low-risk.* Jangan ganti tipe `numeric→text` (akan merusak semua konsumen numerik: RPC, sorting, perbandingan stok). Sebagai gantinya:

- **Tambah kolom `products.size_label text NOT NULL`** = nilai yang diketik/ditampilkan, persis format marketplace (`42 2/3`, `37,5`, `40`).
- **`products.size numeric` tetap ada** sebagai *kunci urut & banding*, diisi otomatis hasil parse dari label.
- **Trigger DB dua-arah `products_sync_size` (BEFORE INSERT/UPDATE):**
  - Jika `size_label` diisi → `size := parse_size_to_numeric(size_label)`.
  - Jika hanya `size` (numerik) yang diisi (jalur lama) → `size_label := format(size)`.
  - Efek: **jalur insert lama yang mengirim `size` numerik tetap jalan tanpa diubah** (mis. fallback marketplace) — trigger mengisi label. Memangkas blast-radius.
- **Fungsi `parse_size_to_numeric(text)` IMMUTABLE:** `"42 2/3"→42.667`, `"37,5"→37.5`, `"40"→40`, pecahan `"1/2"→0.5`, fallback `0`.
- **RPC `get_inventory_page`** di-recreate menambah kolom return `size_label`; `ORDER BY size` (numerik) tetap, jadi urutan size benar.

**Jalur input yang diubah mengirim `size_label` (bukan `size`):**
- Manual: Tambah Produk (`inventory-client`), Barang Masuk/registrasi (`inbound-client` → `registerProduct`/`productInputSchema`).
- Bulk CSV: `importRowSchema` (key `size` jadi string → dipetakan ke `size_label`).

**Display:** Inventory list & header modal pakai `size_label`. Display sekunder (POS, invoice, sold, search, returns, outbound, PO manual, barcode) **ditunda** ke Fase A.2 — tetap berfungsi memakai `size` numerik (size non-pecahan tampil identik; hanya Adidas pecahan tampil desimal). Ditrack eksplisit di artifact.

**Trade-off jujur:** Adidas pecahan masih tampil desimal di view sekunder sampai A.2 dikerjakan. SKU (kunci match) tidak terpengaruh.

## #2 Rename — desain
Ganti **label tampilan** "Purchase Order" → "Pembelian Barang". **Route `/pembelian/purchase-order` TIDAK diubah** (link/bookmark/redirect tetap aman). File: `sidebar`, `po-client`, `faktur-client`, `penerimaan-client`, `finance/page`, `activity-log/page`, `panduan/page`. Tidak menyentuh nama variabel/route/enum.

## #9 Role import = Finance — desain
- `config/permissions.ts`: `/penjualan/import-marketplace` buang `admin_online` → `["owner","finance"]`.
- `marketplace-import.ts`: fungsi alur impor (`reconcileMarketplaceOrders`, `commitMarketplaceOrders`, `mapMarketplaceSku`, `searchProductsForMapping`) dari `[...ROLES]` (semua) → `["owner","finance"]`.
- RPC `import_marketplace_order_atomic`: cek peran `['owner','finance','admin_online']` → `['owner','finance']` (migration baru).
- `panduan`: rapikan teks aturan size numerik (jadi free-text) + role import.

## Keamanan & batasan (dipatuhi)
- Perubahan skema lewat **file migration baru** (additive, idempotent), diverifikasi via MCP. Tidak edit migration lama.
- DB sudah di-reset (data demo 0, akun & COA utuh) — backfill aman.
- Tidak ada operasi destruktif baru. Kerja di branch `feat/fase-a-uat-ux`, tidak push ke main tanpa diminta.

## Testing / verifikasi
- `pnpm --filter web build` hijau.
- Verifikasi RPC & trigger via MCP: insert produk size_label `42 2/3` → `size`=42.667; insert `size`=40 → `size_label`="40".
- Advisor DB tanpa regresi.
