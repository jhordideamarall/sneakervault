# Return Refund Accounting — Production

**Tanggal:** 2026-08-17
**Target:** Supabase SneakerVault `jogqvffdjtjqdnflvubi` + Vercel production

## Tujuan

Menyatukan proses refund customer dengan rekening kas/bank dan General Ledger tanpa
menghilangkan kontrol fisik retur. Operator keuangan dapat memilih rekening existing,
mengikuti saran sistem, atau menambah rekening baru dari modal refund.

## Model Akuntansi

COA baru:

- `4.1.90 Retur Penjualan`
- tipe `revenue`
- normal balance `debit`
- parent `4.1 Penjualan`

Jurnal refund uang:

```text
Dr 4.1.90 Retur Penjualan       nilai refund
   Cr COA rekening kas/bank     nilai refund
```

Jurnal pengembalian barang tetap:

```text
Dr 1.1.05 Persediaan Barang     HPP barang kembali
   Cr 5.1 HPP Barang Terjual    HPP barang kembali
```

Kedua jurnal, mutasi rekening, saldo bank, stok, status retur, dan audit harus berhasil
dalam satu transaksi database. Kegagalan saldo, role, rekening, periode fiskal, atau
validasi apa pun me-roll back seluruh proses.

## Alur UI

1. Admin Gudang memverifikasi barang fisik.
2. Untuk tukar size, role operasional memproses seperti sebelumnya.
3. Untuk refund, Owner/Finance membuka modal penyelesaian.
4. Sistem mengisi nominal dari harga jual snapshot sebagai saran yang dapat diedit.
5. Sistem menyarankan rekening berdasarkan platform/default, tetapi pilihan dapat diganti.
6. Bila rekening belum ada, Owner/Finance dapat membuat rekening inline dengan saldo awal 0.
7. Konfirmasi memproses stok, HPP, uang keluar, jurnal, dan audit secara atomik.

## Hak Akses

- Inisiasi retur: Owner/Admin Online.
- Verifikasi fisik: Owner/Admin Gudang.
- Tukar size: Owner/Admin Gudang/Admin Online.
- Penyelesaian refund uang: Owner/Finance.
- Tambah rekening: Owner/Finance melalui action rekening yang sudah ada.

## Acceptance Criteria

- Migration additive, idempotent, dan dibuat melalui Supabase CLI.
- COA `4.1.90` hanya satu dan parent-nya benar.
- Refund tidak dapat diproses tanpa nominal positif dan rekening aktif dengan saldo cukup.
- Retry tidak menggandakan mutasi/jurnal/stok.
- Laporan laba rugi mengurangkan akun revenue yang normal balance-nya debit.
- Tukar size tetap kompatibel dengan client lama.
- Function memiliki role gate, locked `search_path`, anon revoke, dan grant minimal.
- Regression SQL, advisor, type-check, lint, build, deployment, dan smoke check lulus.
