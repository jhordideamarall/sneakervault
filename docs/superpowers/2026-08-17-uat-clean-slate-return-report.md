# UAT Clean Slate & Return Report

**Tanggal:** 2026-08-17
**Supabase target:** SneakerVault (`jogqvffdjtjqdnflvubi`)

## Tujuan

1. Menyiapkan database UAT yang bersih dari data transaksi/demo tanpa menghapus
   akun login, COA, konfigurasi, periode fiskal, rekening bank, atau preferensi notifikasi.
2. Melengkapi reporting operasional dengan laporan retur rinci yang dapat difilter
   berdasarkan periode dan diekspor ke PDF/Excel.

## Keputusan COA

COA tidak dibuat ulang dan tidak diubah saat reset. Remote sudah memiliki 45 akun dan
alur retur sudah mem-posting penyesuaian persediaan/HPP melalui COA yang ada. Menambah
akun retur generik tanpa kebutuhan bisnis yang pasti berisiko menggandakan akun atau
mengubah klasifikasi laporan. Fokus UAT adalah mempertahankan COA sebagai master dan
menampilkan jejak retur secara rinci pada laporan operasional.

Audit remote memastikan belum ada akun khusus retur penjualan. Flow saat ini hanya
memiliki nilai HPP barang, sedangkan nominal refund dan rekening tujuan baru dipilih
oleh operator di Kas & Bank. Karena itu pembalikan stok tetap memakai `1.1.05`
Persediaan Barang dan `5.1` HPP Barang Terjual; posting contra-revenue/kas tidak dibuat
otomatis sebelum nominal serta rekening refund tersedia di satu workflow atomik.

## Scope Reset Aman

Reset mencakup transaksi penjualan/pembelian/penerimaan, pembayaran, kas-bank, jurnal,
stok dan opname, packing/retur, pre-order/reservasi, payroll, aset/depresiasi, expenses,
feedback, marketplace, pesan internal, delete request, activity log, dan produk/customer
demo. Counter nomor transaksi serta `feedback_report_seq` kembali ke awal.

Master yang dipertahankan: profil/auth user, COA, kategori biaya, app settings, periode
fiskal, rekening bank, preferensi notifikasi, pegawai, supplier, dan status tur fitur.
Tidak ada table, RLS, RPC, index, enum, atau objek schema yang di-drop.

## Laporan Retur

Laporan baru ditambahkan ke kelompok “Laporan Wajib Client” dan mengikuti filter periode
halaman Reports. Kolom ekspor:

- tanggal dibuat;
- order dan channel/platform;
- produk awal, SKU, dan size;
- tipe retur;
- alasan;
- status;
- tanggal verifikasi dan proses;
- produk/size pengganti bila tukar size.

Preview menampilkan maksimal lima baris; PDF/Excel berisi seluruh hasil periode.

## Acceptance Criteria

- Seluruh tabel transaksi yang disetujui berjumlah 0 setelah reset.
- Jumlah baris semua master terlindungi sama dengan baseline.
- Nomor dokumen berikutnya mulai dari awal series baru dan sequence feedback di-reset.
- Laporan retur menghormati role Owner/Finance dan filter tanggal yang sama dengan report lain.
- Type-check dan lint file terkait lulus.
