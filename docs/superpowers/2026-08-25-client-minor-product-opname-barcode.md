# Penyesuaian Minor Produk, Stock Opname, dan Cetak Barcode

## Keputusan Domain

- SKU tetap menjadi jangkar colorway; setiap size tetap satu row `products` dengan identitas `(sku, round(size, 2))`.
- Barcode berasal dari Accurate, unik per variant, dan immutable setelah insert.
- HPP, brand, model, SKU, warna, dan foto adalah field bersama per SKU.
- Size serta seluruh harga jual adalah field per variant.
- Stock opname tetap compare-only dan scan tidak mengubah `products.quantity`.

## Implementasi

1. Form inventory mengirim `sharedProduct + variants[]` lewat satu batch insert sehingga constraint size/barcode membatalkan seluruh statement jika ada duplikat.
2. Edit produk memakai RPC atomik: field bersama disinkronkan ke semua row SKU asal; size/harga hanya diubah pada product terpilih.
3. Trigger database menolak setiap update barcode setelah produk dibuat.
4. Scan stock opname melalui kamera atau input manual memanggil RPC increment atomik dan langsung menyimpan `physical_qty + 1`.
5. Route `/barcode-generate` dipertahankan, tetapi UI/menu menjadi “Cetak Barcode” dengan antrean multi-produk, kuantitas, dan ukuran label mm per produk.
6. Reset demo mempertahankan akun, konfigurasi, rekening bank, preferensi notifikasi, dan supplier.

## Verifikasi

- SQL regression mencakup batch all-or-nothing, sinkronisasi shared-vs-variant, barcode immutable, dan opname compare-only.
- Type-check, lint, build, `git diff --check`, dry-run migration, serta regresi SQL remote dalam transaksi rollback lulus.
- Browser smoke lulus untuk form batch, modal barcode read-only, antrean cetak, layout mobile, input manual, dan pembukaan kamera dengan fake media device.
- Migration `20260824191318` sudah diterapkan ke Supabase production dan regression SQL production lulus dalam transaksi rollback.
- Aplikasi sudah dideploy ke Vercel production di `https://dewinst.vercel.app`; smoke test terautentikasi pada domain production lulus tanpa page error.
