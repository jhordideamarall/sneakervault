# Panduan Operator UAT-0001

Panduan ini dipakai oleh Owner dan Finance setelah migration serta aplikasi versi
UAT-0001 sudah terpasang. Jangan memakai panduan ini pada production yang masih
menampilkan versi `9682c14`, karena workflow barunya belum tersedia di versi itu.

## 1. Pembelian tunai atau DP

1. Buka **Pembelian → Pembelian Barang** dan klik **Buat Pembelian Barang**.
2. Pilih supplier, isi barang, harga, pajak, dan ongkir.
3. Pada **Pembayaran ke Vendor**, pilih:
   - **Kredit**: belum ada uang keluar saat disetujui.
   - **Bayar Lunas**: seluruh total dipotong saat disetujui.
   - **Uang Muka (DP)**: hanya nominal DP dipotong saat disetujui.
4. Untuk Lunas/DP, pilih sumber dana BCA atau kas yang benar.
5. Simpan sebagai Draft, periksa total, lalu klik **Setujui**.
6. Verifikasi di **Kas & Bank → Mutasi**. Uang Lunas/DP harus langsung keluar
   satu kali pada tanggal persetujuan.
7. Setelah barang datang, buka **Pembelian → Penerimaan** dan terima barang.
   Stok bertambah, tetapi BCA/kas tidak boleh berkurang lagi untuk nilai yang
   sudah dibayar.
8. Untuk DP, bayar sisa tagihan melalui **Pembelian → Bayar Vendor**.

Jika salah input dan transaksi sudah dibayar, jangan langsung membatalkan PO.
Hapus **Pembayaran Vendor**, lalu **Faktur Pembelian**, baru koreksi dokumennya.

## 2. Produk dan Stock Opname

### Tambah produk manual

1. Buka **Gudang → Inventory**.
2. Klik **Tambah Produk**.
3. Isi SKU colorway, size variant, brand, model, warna, HPP, dan harga.
4. SKU sama dengan size berbeda boleh. SKU dan size yang sama akan ditolak
   sebagai duplikat.

### Stock Opname

1. Dari halaman Inventory, klik tombol **Stock Opname**.
2. Finance dapat membuat sesi, memasukkan hasil hitung, lalu mengirim review.
3. Owner memeriksa selisih dan menyetujui adjustment.
4. Setelah approval, periksa **Laporan Stock/Kartu Stock** untuk melihat mutasi
   adjustment dan saldo akhir.

## 3. Karyawan dan payroll

### Master karyawan

1. Buka **Buku Besar → Data Karyawan**.
2. Gunakan **Karyawan Baru** untuk menambah data.
3. Gunakan **Edit** untuk mengubah gaji pokok, jabatan, bank, atau data lain.
4. Karyawan yang keliru dinonaktifkan dapat dipulihkan dengan **Aktifkan**.

### Proses gaji

1. Buka **Buku Besar → Penggajian** dan klik **Proses Gaji**.
2. Form selalu dimulai kosong. Pilih satu karyawan, lalu klik **Tambah
   Karyawan**. Ulangi hanya untuk karyawan yang diproses.
3. Tambah atau ubah komponen per karyawan. Contoh:
   - Pendapatan: Gaji Pokok, Upah Harian, Lembur, THR, Bonus, Pendapatan Lain.
   - Potongan: BPJS, PPh 21, Keterlambatan, Potongan Lain.
4. Jika langsung dibayar, pilih akun BCA/kas pada **Akun Bayar**.
5. Jika belum dibayar, biarkan akun kosong untuk mencatat **Hutang Gaji**.
6. Klik **Posting Penggajian** dan periksa gross, potongan, serta net.
7. Pada kolom **Slip**, pilih nama karyawan untuk mengunduh satu PDF khusus
   karyawan tersebut.
8. Untuk payroll berstatus **Hutang Gaji**, klik **Bayar Hutang**, pilih akun
   BCA/kas dan tanggal. Sistem hanya mengizinkan pelunasan satu kali.

Payroll yang Hutang Gajinya sudah dilunasi tidak dapat diedit. Ini mencegah
saldo bank dan jurnal yang sudah final berubah diam-diam.

## 4. Invoice dan customer manual

1. Buka **Penjualan → Invoice**.
2. Pilih customer yang sudah ada, atau biarkan pilihan pada **Manual** lalu isi
   **Nama di Invoice**.
3. Saat invoice disimpan, nama manual otomatis dibuat/ditautkan ke **Master Data
   Customer**.
4. Penulisan nama yang sama dengan beda kapital atau spasi tidak membuat
   customer baru lagi.

## 5. Membaca dan mengekspor laporan

1. Buka **Laporan**.
2. Isi **Dari tanggal** dan **Sampai tanggal**, lalu klik **Terapkan Periode**.
3. Filter yang sama dipakai oleh tabel wajib dan export PDF/Excel.
4. Gunakan laporan berikut:
   - **Buku Besar**: tanggal, nomor jurnal, uraian, debit, kredit, saldo awal,
     dan saldo berjalan per akun.
   - **Kartu Stock**: saldo awal, setiap mutasi, saldo berjalan, dan saldo akhir
     per produk.
   - **Piutang Customer (AR)** dan **Utang Supplier (AP)**: tersedia sebagai
     laporan terpisah.
5. Pada **Laporan Keuangan → Neraca**, pilih tanggal laporan. **Laba Tahun
   Berjalan** harus sama dengan Laba Rugi dari 1 Januari sampai tanggal Neraca.
6. Pada **Perubahan Ekuitas**, pilih rentang tanggal. Laba berasal dari Laba
   Rugi, Setoran Modal dari akun `3.1`, dan Prive dari akun `3.4`.

## Checklist UAT singkat

- [ ] Approve PO Lunas mengurangi BCA tepat satu kali.
- [ ] Terima PO Lunas menambah stok tanpa mengurangi BCA lagi.
- [ ] Finance dapat melihat Tambah Produk dan Stock Opname dari Inventory.
- [ ] Payroll baru kosong dan karyawan ditambahkan satu per satu.
- [ ] Slip PDF hanya berisi satu karyawan dan seluruh komponen terlihat.
- [ ] Bayar Hutang Gaji menghasilkan satu mutasi bank dan tidak bisa diulang.
- [ ] Edit dan Aktifkan kembali karyawan berfungsi.
- [ ] Nama customer manual muncul di Master Data Customer.
- [ ] Filter periode mengubah isi dan label export laporan.
- [ ] Buku Besar detail, Kartu Stock awal–akhir, AR, dan AP dapat diekspor.
- [ ] Laba Neraca sama dengan Laba Rugi YTD dan Prive bukan angka selisih.
