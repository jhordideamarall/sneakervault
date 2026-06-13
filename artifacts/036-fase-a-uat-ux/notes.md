# Notes — Fase A UAT

## Keputusan desain & alasannya

### #6 Size: kenapa additive (tambah kolom + trigger), bukan ganti `numeric→text`
Mengubah tipe `products.size` jadi `text` akan merusak semua konsumen numerik (RPC `get_inventory_page` return type, sorting `ORDER BY size`, perbandingan stok, `a.size - b.size` di UI). Risiko tinggi, blast-radius besar.

Solusi: **tambah `size_label text`** (yang ditampilkan/diinput) + **pertahankan `size numeric`** sebagai kunci urut. **Trigger dua-arah** `products_sync_size` menyinkronkan keduanya:
- Input `size_label` "42 2/3" → `size` = 42.667 (untuk sort).
- Input `size` numerik (jalur lama, mis. fallback marketplace) → `size_label` = "42".

Efek penting: **jalur insert lama tidak perlu diubah** (trigger mengisi label) → memangkas titik edit & risiko. Hanya jalur yang menerima input pecahan dari user yang diubah kirim `size_label`: Tambah Produk, Barang Masuk, bulk CSV.

### Bug yang ketemu & diperbaiki saat eksekusi
`parse_size_to_numeric` versi pertama pakai `substring(s from '^[0-9]+(\.[0-9]+)?')`. Di Postgres, `substring(... from pattern)` dengan **grup-tangkap** mengembalikan **isi grup**, bukan seluruh match → `'40'`→NULL→0, `'37,5'`→'.5'→0.5. Diperbaiki jadi pola tanpa grup-tangkap `'^[0-9]+\.?[0-9]*'`. Diverifikasi: 40→40, 37,5→37.5, 42 2/3→42.667.

### #9 Role: kenapa ubah konstanta `ROLES`
4 fungsi alur impor (`reconcileMarketplaceOrders`, `commitMarketplaceOrders`, `mapMarketplaceSku`, `searchProductsForMapping`) pakai `requireRole([...ROLES])`. Cukup ubah konstanta `ROLES` (buang `admin_online`) → semuanya ikut ketat ke owner+finance. RPC `import_marketplace_order_atomic` disamakan via migration.

### #2 Rename: kenapa route tidak diubah
Mengganti route `/pembelian/purchase-order` akan merusak link/bookmark/redirect (`pembelian/page.tsx` redirect ke situ). Cukup ganti **label tampilan** "Purchase Order" → "Pembelian Barang" di 7 file.

## Cara verifikasi manual (saat UAT)
1. Inventory → Tambah Produk → Size isi `42 2/3` → simpan → tampil "42 2/3" di list, urutan size tetap benar.
2. Barang Masuk → registrasi produk baru dengan size `38 2/3` → tersimpan.
3. Sidebar: menu "Pembelian Barang" (bukan "Purchase Order").
4. Login sebagai admin_online (kalau ada) → menu Import Pesanan tidak muncul / ditolak.

## Lihat juga
- Memory: `vault-uat-meeting-decisions`, `vault-performance-findings`.
- Spec: `docs/superpowers/specs/2026-06-14-fase-a-uat-design.md`.
- Roadmap: `docs/improvement-plan-uat-meeting.md` (Fase B = mesin rekonsiliasi Order ID, Fase C = preorder).
