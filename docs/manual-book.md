# Manual Pemakaian SneakerVault / Dewinst.id

Terakhir diupdate: 2026-06-13

Dokumen ini adalah panduan operasional untuk user harian. Versi interaktifnya juga tersedia di aplikasi melalui menu **Panduan Pemakaian**.

## 1. Prinsip Utama

SneakerVault menghubungkan gudang, penjualan, kas/bank, dan laporan keuangan. Karena modul saling terkait, urutan input data penting:

1. Buat **Akun Bank & Kas**.
2. Buat **Supplier** dan **Customer** penting.
3. Buat atau import **Produk**.
4. Isi stok dan HPP lewat **Barang Masuk**, **PO + Penerimaan**, atau cutover data.
5. Jalankan transaksi penjualan, pembelian, marketplace, dan finance.

Kalau database kosong, dropdown produk/vendor/bank memang akan kosong. Isi master data dulu.

## 2. Role dan Akses

| Role | Fokus kerja | Menu utama |
| --- | --- | --- |
| Owner | Kontrol akses, approval, audit, laporan akhir | Semua menu |
| Admin Gudang | Produk fisik, stok, barcode, inbound, retur, opname | Inventori, Barang Masuk, Stock Opname, Generate Barcode, Retur |
| Admin Online | Pesanan marketplace, mapping SKU, update stok marketplace | Import Pesanan, Update Stok Marketplace, Invoice, Customer, Terjual |
| Shopkeeper | POS kasir, cek stok, packing manual | POS Kasir, Inventori, Packing / Outbound |
| Finance | Bank, settlement, AR/AP, jurnal, laporan | Kas & Bank, Pembelian, Rekonsiliasi Settlement, Buku Besar, Laporan |

Owner bisa memakai chip **Lihat sebagai** di bar atas untuk melihat tampilan role lain tanpa logout.

## 3. Panduan Per Divisi

### Owner

Fokus owner adalah memastikan sistem berjalan benar, bukan menginput transaksi harian satu per satu.

Flow harian:

1. Buka **Workspace** untuk melihat ringkasan dan signal menu.
2. Cek **Overview** untuk stok, revenue, laba, bestseller, dan nilai HPP.
3. Pakai **Lihat sebagai** untuk cek akses Admin Gudang, Admin Online, Shopkeeper, dan Finance.
4. Approve hal penting: request hapus, stock opname final, koreksi besar, user/role.
5. Buka **Activity Log** jika ada selisih data.

Yang harus dihindari:

- Jangan approve stock opname sebelum tim gudang menjelaskan selisih.
- Jangan menghapus data transaksi jika masih dibutuhkan untuk audit.

### Admin Gudang

Fokus gudang adalah stok fisik dan kualitas barang.

Flow produk baru:

1. Produk bisa dibuat dari **Inventori**, **Import Produk**, atau PO saat barang diterima.
2. Jika belum ada barcode internal, buka **Generate Barcode**.
3. Tempel label ke produk fisik.
4. Saat barang datang, input lewat **Barang Masuk** agar stok dan HPP terbentuk.

Flow barang masuk:

1. Buka **Barang Masuk**.
2. Scan barcode atau cari SKU.
3. Isi supplier, qty, harga modal, tanggal, dan kondisi barang.
4. Konfirmasi masuk.
5. Stok bertambah dan HPP dihitung otomatis.

Flow stock opname:

1. Buka **Stock Opname**.
2. Buat sesi opname.
3. Input jumlah fisik per produk.
4. Sistem menghitung selisih vs stok sistem.
5. Minta Owner approve jika selisih sudah diverifikasi.

Flow retur:

1. Admin Online menandai retur dari sisi order/customer.
2. Admin Gudang cek barang fisik.
3. Pilih hasil: kembali normal, defect, atau tindakan lain.
4. Stok disesuaikan setelah verifikasi.

### Admin Online

Fokus admin online adalah file marketplace dan status pesanan.

Flow awal jika database kosong:

1. Ambil file listing/produk dari marketplace.
2. Buka **Inventori -> Import Produk**.
3. Pilih channel atau format yang benar.
4. Import produk agar SKU masuk ke sistem.
5. Isi stok/HPP lewat Gudang atau PO agar laporan laba akurat.

Flow import pesanan marketplace:

1. Buka **Penjualan -> Import Pesanan**.
2. Pilih channel: Shopee, TikTok, atau Tokopedia.
3. Upload file pesanan resmi dari seller center.
4. Review hasil:
   - Siap: SKU cocok dan invoice bisa dibuat.
   - Perlu tindakan: SKU belum dikenali atau format data bermasalah.
   - Sudah diimport: dilewati.
5. Untuk SKU tidak dikenali, klik **Petakan SKU** ke produk sistem.
6. Klik **Konfirmasi Import** untuk baris yang siap.
7. Sistem membuat invoice penjualan belum terbayar dan jurnal piutang/pendapatan. Stok fisik belum turun.
8. Buka **Packing / Outbound** untuk memproses barang keluar. Di tahap ini stok, stock movement, dan HPP/persediaan keluar dicatat.

Flow update stok marketplace:

1. Download template Mass Update / Batch Edit dari seller center.
2. Buka **Penjualan -> Update Stok Marketplace**.
3. Pilih channel yang sesuai: **Shopee**, **TikTok**, atau **Tokopedia**.
4. Upload template resmi.
5. Sistem mengisi stok dan harga opsional dari data inventori.
6. Download file hasil.
7. Upload balik ke marketplace.

Catatan penting:

- Sistem tidak mendukung template Excel bebas buatan sendiri.
- Pilih channel secara eksplisit. Jangan upload file Shopee di tab TikTok.
- Variasi produk wajib punya size numerik. Row seperti **Size Lain? Ready**, **Default**, atau variasi kosong tidak bisa dibuat menjadi SKU inventory.
- Jika order sudah diimport, jangan diproses lagi lewat packing yang menurunkan stok.

### Shopkeeper

Fokus shopkeeper adalah transaksi toko dan packing manual.

Flow POS offline:

1. Buka **POS Kasir**.
2. Scan atau cari produk.
3. Masukkan qty dan diskon jika ada.
4. Pilih customer, atau pakai Walk-in.
5. Pilih metode pembayaran dan akun bank/kas.
6. Klik bayar.
7. Sistem membuat invoice, stok turun, kas/bank masuk, dan jurnal otomatis.

Flow cek stok:

1. Buka **Inventori**.
2. Cari SKU, model, brand, atau barcode.
3. Lihat stok dan harga jual.

Shopkeeper tidak melihat HPP/modal.

Flow packing manual:

1. Buka **Packing / Outbound**.
2. Buat sesi packing.
3. Isi platform, order ID, kurir, dan data pengiriman.
4. Scan item yang dikirim.
5. Tandai dikirim setelah barang keluar.

Aturan penting:

- Packing manual menurunkan stok.
- Jangan packing ulang order marketplace yang sudah dikonfirmasi lewat Import Pesanan, karena stoknya sudah turun saat import.

### Finance

Fokus finance adalah arus uang, piutang, hutang, settlement, jurnal, dan laporan.

Setup awal:

1. Buka **Kas & Bank -> Akun Bank**.
2. Buat minimal kas tunai dan rekening bank.
3. Input saldo awal jika ada.

Flow invoice dan penerimaan:

1. Invoice dibuat dari POS, invoice manual, atau import pesanan marketplace.
2. Jika customer membayar langsung, catat di **Penerimaan Kas**.
3. Jika marketplace, tunggu file settlement saat dana dilepas.
4. Cek status invoice: belum bayar, sebagian, atau lunas.

Flow settlement marketplace:

1. Buka **Penjualan -> Rekonsiliasi Settlement**.
2. Pilih channel.
3. Upload file settlement resmi.
4. Review invoice yang match dan yang dilewati.
5. Pilih bank tujuan, tanggal cair, dan referensi.
6. Terapkan settlement.

Hasil settlement:

- Membuat penerimaan penjualan.
- Melunasi invoice terkait.
- Membuat alokasi pembayaran.
- Mencatat mutasi bank sebesar dana bersih.
- Membukukan biaya marketplace aktual.

Flow pembelian:

1. Buat **Purchase Order**.
2. Barang diterima oleh gudang melalui **Penerimaan Barang**.
3. Finance membuat atau mencocokkan **Faktur Pembelian**.
4. Finance membayar vendor lewat **Bayar Vendor**.
5. Hutang dan bank diperbarui otomatis.

Flow laporan:

1. Cek **Mutasi Bank**.
2. Jalankan **Rekonsiliasi Bank** jika ada rekening koran.
3. Cek **Buku Besar -> Jurnal**.
4. Buka **Laporan Keuangan**: Neraca, Laba Rugi, Arus Kas, Perubahan Ekuitas.

## 4. Aturan Per Menu dan Fitur

Bagian ini menjelaskan setiap menu dari sisi operasional: siapa yang boleh akses, kapan dipakai, aturan sebelum simpan/import/approve, efek sistem setelah berhasil, dan cara koreksi jika salah.

### Dasbor

| Menu | Akses | Fungsi | Aturan | Efek sistem | Koreksi jika salah/aneh |
| --- | --- | --- | --- | --- | --- |
| Workspace | Semua role | Halaman awal kerja harian sesuai role. | Mulai dari sini untuk melihat pekerjaan yang perlu ditindak. Signal merah = perlu tindakan, amber = perlu dipantau. | Tidak mengubah data; hanya membaca ringkasan dan signal. | Jika angka janggal, buka modul sumbernya: inventory, invoice, settlement, bank, atau jurnal. |
| Overview | Owner, Finance | Ringkasan performa revenue, laba, nilai stok, bestseller, aging. | Dipakai untuk review, bukan input transaksi. Laba bergantung pada HPP dan settlement. | Tidak membuat jurnal; membaca data invoice, stok, pembayaran, settlement, dan jurnal. | Jika laba tidak masuk akal, cek HPP 0, invoice belum lunas, atau settlement belum diimport. |

### Pembelian

| Menu | Akses | Fungsi | Aturan | Efek sistem | Koreksi |
| --- | --- | --- | --- | --- | --- |
| Purchase Order | Owner, Finance | Rencana pembelian ke vendor. | Vendor wajib. Bisa buat vendor dari modal PO. Item bisa produk lama atau barang baru manual. Pajak input persen: `11` = 11%. | Draft PO belum menambah stok. Barang baru dibuat ke inventory saat Penerimaan Barang. | PO yang belum diterima bisa diedit/batal. Jika sudah ada penerimaan/faktur/pembayaran, koreksi lewat modul lanjutan. |
| Penerimaan Barang | Owner, Finance, Admin Gudang | Mencatat barang fisik datang dari PO. | Terima hanya barang yang benar-benar datang. Boleh sebagian. Catat jika cacat/kurang/beda kondisi. | Stok bertambah, produk baru masuk inventory, HPP weighted average diperbarui. | Jika qty salah, koreksi lewat stock opname/retur supplier sesuai kasus. Jika harga salah, koreksi dokumen pembelian sebelum closing. |
| Faktur Pembelian | Owner, Finance | Mencatat tagihan vendor sebagai hutang. | Nomor faktur, tanggal, vendor, dan nilai harus benar. Faktur yang sudah dibayar tidak dibatalkan sebelum pembayaran direverse. | Hutang/AP terbentuk, jurnal pembelian terbentuk, status berubah belum bayar/sebagian/lunas. | Edit sebelum pembayaran. Jika sudah dibayar, reverse pembayaran dulu. |
| Bayar Vendor | Owner, Finance | Membayar hutang vendor. | Pilih faktur outstanding, akun bank/kas, dan nominal yang tidak melebihi sisa hutang. | Bank/kas turun, hutang berkurang, jurnal pembayaran vendor terbentuk. | Reverse pembayaran jika salah bank/tanggal/nominal, lalu buat ulang. |

### Penjualan

| Menu | Akses | Fungsi | Aturan | Efek sistem | Koreksi |
| --- | --- | --- | --- | --- | --- |
| Order Masuk | Semua role | Monitoring order yang perlu diproses atau dicek status. | Order marketplace resmi masuk lewat Import Pesanan lalu dipacking dari Packing / Outbound. | Menampilkan order dan status; tidak melunasi invoice. | Jika order dobel, cek import marketplace/packing/POS. |
| POS Kasir | Owner, Shopkeeper, Finance | Checkout penjualan offline. | Produk harus punya stok siap jual. Pilih customer atau Walk-in. Pilih metode bayar dan akun kas/bank. Jangan pakai untuk order marketplace yang sudah diimport. | Invoice dibuat, stok turun, kas/bank masuk, jurnal otomatis. | Batalkan/reverse invoice/penerimaan sesuai status jika salah transaksi. |
| Invoice Penjualan | Owner, Finance, Admin Online | Membuat dan mengelola tagihan customer. | Draft belum menurunkan stok. Terbitkan untuk membuat transaksi berlaku. Marketplace belum lunas sebelum settlement/penerimaan. | Invoice terbit membentuk piutang, stok turun, status menjadi belum bayar/sebagian/lunas. | Edit selama draft atau sebelum pembayaran kompleks. Setelah pembayaran, gunakan cancel/reversal sesuai status. |
| Penerimaan Kas | Owner, Finance | Mencatat pembayaran customer ke invoice. | Pilih invoice outstanding dan akun bank/kas tujuan. Jangan input manual untuk marketplace yang akan dilunasi settlement. | Kas/bank bertambah, piutang turun, jurnal penerimaan terbentuk. | Reverse penerimaan jika salah bank/tanggal/nominal. |
| Import Pesanan | Owner, Finance, Admin Online | Mengubah file pesanan Shopee/TikTok/Tokopedia menjadi invoice belum terbayar. | Pilih channel eksplisit. Gunakan file resmi seller center. SKU asing harus dipetakan/dibuat. Size wajib numerik; `Size Lain? Ready`, `Default`, atau kosong ditolak. | Baris siap membuat invoice belum bayar tanpa mengurangi stok. Jurnal import mencatat piutang/pendapatan/diskon/estimasi fee; HPP dan persediaan keluar dicatat saat packing. | Petakan SKU, buat produk dulu, atau upload ulang di channel yang benar. |
| Update Stok Marketplace | Owner, Finance, Admin Online | Mengisi template stok/harga marketplace dari stok sistem. | Download template resmi seller center. Pilih Shopee/TikTok/Tokopedia. Centang update harga hanya jika ingin menimpa harga marketplace. | Tidak mengubah stok sistem. Menghasilkan file Excel baru untuk upload balik ke marketplace. | Jika banyak SKU tidak cocok, cek import produk/mapping SKU. Row non-size Shopee sengaja dilewati. |
| Rekonsiliasi Settlement | Owner, Finance | Mengubah laporan pencairan dana marketplace menjadi penerimaan dan biaya marketplace aktual. | Dipakai satu kali saat dana dilepas. Pesanan harus sudah diimport. Pilih channel, bank tujuan, tanggal cair, referensi. | Invoice marketplace lunas/sebagian, mutasi bank bersih dibuat, biaya marketplace dan selisih ongkir dijurnal. | Jika tidak match, cek periode/order ID/channel. Jika bank/tanggal salah, reverse/koreksi sebelum tutup buku. |
| Terjual | Owner, Admin Online, Finance | Riwayat barang yang sudah keluar/terjual. | Dipakai untuk baca riwayat dan audit, bukan input penjualan. | Tidak mengubah stok/jurnal. | Jika tidak muncul, cek invoice/order/packing. Jika dobel, audit jalur POS/import/packing. |

### Gudang

| Menu | Akses | Fungsi | Aturan | Efek sistem | Koreksi |
| --- | --- | --- | --- | --- | --- |
| Inventori | Semua role; HPP hanya Owner/Finance | Produk, varian size, stok, harga, foto, status fisik, HPP. | 1 varian size = 1 SKU inventory. Import internal wajib HPP jika ingin laba akurat. Import marketplace bisa bootstrap produk tetapi HPP bisa 0. Foto produk pakai upload file, bukan URL bebas. | Tambah/import membuat master inventory. Edit HPP hanya Owner/Finance. Pagination menjaga ribuan SKU tetap ringan. | Cari exact SKU jika produk tidak terlihat. Isi HPP lewat edit, Barang Masuk, PO + Penerimaan, atau cutover. |
| Barang Masuk | Owner, Admin Gudang | Input stok fisik langsung ke gudang. | Scan barcode atau isi produk baru jika barcode belum ada. Qty dan harga modal wajib benar. | Stok bertambah, HPP diperbarui, mutasi stok dan log tercatat. | Jika qty salah, koreksi lewat opname/koreksi stok. Jika produk salah, audit barcode/SKU sebelum transaksi turunannya terjadi. |
| Stock Opname | Owner, Admin Gudang, Finance | Mencocokkan stok sistem dengan stok fisik. | Scan/hitung barang satu per satu sampai data fisik siap dibandingkan dengan data sistem. Selisih wajib diberi catatan sebelum hasil dikunci. | Hasil opname hanya menjadi perbandingan dan export PDF/Excel; tidak otomatis mengubah stok atau jurnal. | Koreksi stok dilakukan terpisah setelah hasil opname diverifikasi. Cancel sesi jika scope salah. |
| Generate Barcode | Owner, Admin Gudang | Membuat/cetak label barcode internal. | Pastikan brand, model, size, dan SKU benar sebelum cetak. | Barcode bisa dipakai di inbound, POS, packing, opname. | Regenerate hanya jika barcode lama salah/tidak bisa dipakai. |
| Packing / Outbound | Owner, Shopkeeper | Mencatat barang keluar lewat packing manual. | Scan/tambah item benar. Untuk marketplace, isi platform dan nomor order agar sistem memvalidasi item terhadap invoice. | Item yang ditambahkan langsung menurunkan stok. Untuk invoice marketplace baru, HPP/persediaan keluar juga diposting saat packing. | Cancel sebelum finalisasi jika salah scan. Setelah final, koreksi lewat retur/opname sesuai kondisi fisik. |
| Retur | Owner, Admin Gudang, Admin Online | Refund, tukar size, dan barang kembali. | Admin Online catat konteks; Gudang verifikasi fisik. Tentukan barang kembali normal/defect/tindakan lain. | Stok bisa kembali, pindah status, atau keluar lagi untuk pengganti. | Koreksi sebelum retur ditutup. Setelah selesai, koreksi lewat stok/opname dan catatan finance bila ada refund. |

### Kas dan Bank

| Menu | Akses | Fungsi | Aturan | Efek sistem | Koreksi |
| --- | --- | --- | --- | --- | --- |
| Akun Bank | Owner, Finance | Master bank, kas tunai, e-wallet, saldo marketplace. | Buat minimal satu akun sebelum transaksi pembayaran. Saldo awal hanya untuk setup/cutover. | Akun muncul di POS, penerimaan, pengeluaran, settlement, pembayaran vendor. | Jika akun tidak dipakai lagi, nonaktifkan. Jika saldo awal salah, koreksi sebelum transaksi harian. |
| Penerimaan | Owner, Finance | Kas masuk manual non-invoice. | Jangan dipakai untuk pembayaran invoice customer. Pilih akun tujuan dan referensi. | Kas/bank bertambah dan jurnal penerimaan manual terbentuk. | Void/reverse jika salah akun/nominal. |
| Pengeluaran | Owner, Finance, Admin Gudang, Admin Online | Biaya operasional. | Pilih kategori biaya. Lampirkan catatan/ref jika perlu audit. | Biaya masuk laporan, kas/bank turun saat dibayar, jurnal beban terbentuk. | Reject sebelum dibayar, void setelah paid jika perlu pembatalan. |
| Semua Mutasi | Owner, Finance | Semua transaksi kas/bank dan saldo berjalan. | Tandai reconciled hanya jika cocok dengan rekening koran. | Tidak mengubah sumber transaksi kecuali status reconciled. | Koreksi transaksi sumber: POS, pembayaran, settlement, expense, atau jurnal. |

### Buku Besar dan Laporan

| Menu | Akses | Fungsi | Aturan | Efek sistem | Koreksi |
| --- | --- | --- | --- | --- | --- |
| Chart of Accounts | Owner, Finance | Daftar akun akuntansi untuk jurnal dan laporan. | Akun standar tidak perlu diubah. Tambah akun hanya jika kebutuhan laporan jelas. | Menentukan klasifikasi Neraca dan Laba Rugi. | Jika mapping akun salah, koreksi mapping/transaksi sebelum tutup buku atau buat Jurnal Umum. |
| Jurnal Umum | Owner, Finance | Buat/edit/hapus jurnal manual. | Debit harus sama kredit. Hanya jurnal manual yang bisa diedit langsung. Jurnal otomatis dikoreksi lewat modul asal/reversal. | Langsung memengaruhi laporan, tetapi tidak otomatis mengubah stok/invoice/hutang/bank operasional. | Edit/hapus jurnal manual selama periode belum dikunci. Untuk jurnal otomatis, koreksi transaksi sumber. |
| Tutup Buku | Owner, Finance | Mengunci periode akuntansi. | Pastikan bank, settlement, invoice, hutang, stok, dan jurnal sudah direview. | Periode lama terkunci dari perubahan. | Reopen hanya untuk koreksi material, lalu tutup ulang. |
| Laporan Operasional | Owner, Finance | Monitoring penjualan, channel, fee, expense, stok, aging. | Gunakan untuk monitoring, bukan laporan akuntansi formal. Fee marketplace akurat setelah settlement. | Tidak mengubah data. | Jika fee kosong, cek settlement. Jika data kosong, cek transaksi sumber. |
| Neraca | Owner, Finance | Posisi aset, liabilitas, ekuitas. | Bergantung pada jurnal balance dan periode. | Tidak mengubah data. | Telusuri dari saldo akun ke jurnal dan transaksi sumber. |
| Laba Rugi | Owner, Finance | Pendapatan, HPP, beban, laba/rugi. | HPP harus terisi. Settlement harus masuk agar fee marketplace final. | Tidak mengubah data. | Cek produk HPP 0, invoice belum settle, atau expense belum paid/approved. |
| Perubahan Ekuitas | Owner, Finance | Mutasi modal dan laba ditahan. | Digunakan setelah jurnal periode lengkap. | Tidak mengubah data. | Cek jurnal modal/laba ditahan/periode jika tidak cocok. |
| Arus Kas | Owner, Finance | Arus kas operasi, investasi, pendanaan. | Bank dan kas harus direkonsiliasi sebelum dipakai final. | Tidak mengubah data. | Cek mutasi bank dan klasifikasi akun jika arus kas janggal. |

### Master Data, Audit, dan Pengaturan

| Menu | Akses | Fungsi | Aturan | Efek sistem | Koreksi |
| --- | --- | --- | --- | --- | --- |
| Supplier | Owner, Admin Gudang, Finance | Master vendor pembelian. | Nama supplier harus jelas. Bisa dibuat dari Master Data atau modal PO. | Muncul di PO, penerimaan, faktur pembelian, pembayaran vendor. | Edit data kontak jika salah. Nonaktifkan, bukan hapus, jika sudah ada transaksi. |
| Customer | Owner, Finance, Admin Online | Master customer POS, invoice, pembayaran. | Bisa dibuat dari Master Data atau on-the-fly. Walk-in dipakai untuk pembeli toko tanpa data detail. | Terhubung ke invoice dan piutang. | Edit kontak jika salah. Nonaktifkan duplikat setelah invoice dipastikan benar. |
| Panduan Pemakaian | Semua role | SOP aplikasi. | Update setiap ada perubahan flow besar. | Tidak mengubah transaksi. | Jika panduan beda dengan aplikasi, ikuti aplikasi lalu update dokumen. |
| Activity Log | Owner | Audit trail aktivitas user. | Dipakai saat ada selisih data. Log tidak diedit manual. | Menampilkan siapa melakukan apa dan kapan. | Gunakan log untuk menentukan modul sumber yang perlu dikoreksi. |
| Req. Hapus | Owner | Approval hapus data. | User meminta hapus, owner approve/tolak. Data yang memengaruhi laporan sebaiknya dikoreksi, bukan dihapus. | Approve menjalankan hapus sesuai tipe request; reject menyimpan alasan. | Tolak jika data masih perlu audit; minta reversal/koreksi modul jika lebih aman. |
| Sinkronisasi Data | Owner | Cutover/import data awal. | Jalankan sebelum transaksi harian. Saldo awal harus balance. Jangan import saldo awal dua kali. | Membuat master/saldo awal/piutang/hutang baseline. | Jika salah cutover, koreksi sebelum operasional aktif. Setelah aktif, hindari reimport massal. |
| Pengaturan | Owner | User, role, profil, konfigurasi. | Role harus sesuai pekerjaan. Akun tidak aktif harus dinonaktifkan. | Mengubah akses menu dan hak field seperti HPP. | Jika user melihat menu salah, cek role. Jika ada akun lama, nonaktifkan. |

## 5. Marketplace: Format File

Gunakan template resmi dari marketplace.

| Fungsi | Shopee | TikTok | Tokopedia |
| --- | --- | --- | --- |
| Import Pesanan | Didukung | Didukung | Didukung |
| Import Produk | Didukung dari listing/mass update | Didukung jika file berisi row produk | Didukung jika file berisi data SKU produk |
| Update Stok Marketplace | Didukung | Didukung | Didukung jika template stok punya kolom SKU dan stok |
| Settlement | Didukung, termasuk workbook multi-sheet | Didukung | Didukung |

Aturan:

- Jangan ubah struktur header file resmi.
- Jangan membuat style Excel sendiri.
- Workbook multi-sheet boleh jika berasal dari template resmi.
- Sistem hanya membaca sheet yang relevan, misalnya Income untuk settlement Shopee.
- Untuk inventory, size harus numerik: `40`, `40.5`, `41 1/3`, `42 2/3`. Nilai seperti `Size Lain? Ready` dan `Default` ditolak dan ditampilkan sebagai peringatan, bukan diimpor diam-diam.
- TikTok/Tokopedia memakai key `SellerSKU-size` jika Seller SKU dipakai untuk beberapa size, misalnya `KH8832-41_33`. Ini mencegah size berbeda dianggap SKU yang sama.

## 6. Kendala Umum

### SKU tidak dikenali

Tindakan:

1. Klik **Petakan SKU**.
2. Pilih produk sistem yang benar.
3. Simpan mapping.
4. Reconcile/import ulang baris tersebut.

Jika produk belum ada, buat produk dulu lewat Inventori atau PO + Penerimaan.

### Settlement tidak menemukan invoice

Kemungkinan:

- File settlement bukan periode/order yang sama dengan file pesanan.
- Pesanan belum pernah diimport.
- Channel yang dipilih salah.
- Invoice sudah lunas atau sudah pernah disettlement.

Tindakan:

1. Pastikan order ID di settlement sama dengan order ID invoice.
2. Import pesanan lebih dulu.
3. Pilih channel yang sama.
4. Upload settlement lagi.

### Produk tidak terlihat setelah import

Tindakan:

1. Search exact SKU di Inventori.
2. Pastikan filter tidak membatasi hasil.
3. Jika data sangat besar, daftar awal bisa tidak menampilkan semua baris sekaligus.

### HPP masih 0

Artinya produk ada, tetapi modal belum lengkap.

Tindakan:

1. Isi lewat Barang Masuk.
2. Atau terima barang dari PO.
3. Atau import data cutover dari sistem lama.

### Angka finance belum cocok

Cek urutan:

1. Pesanan sudah diimport?
2. Invoice sudah terbentuk?
3. Settlement sudah diimport?
4. Bank tujuan settlement benar?
5. Ada pembayaran manual dobel?
6. Ada order sample yang tidak satu periode dengan settlement?

## 7. Aturan Operasional

- Sistem adalah sumber kebenaran stok dan finance.
- Excel marketplace hanya media import/export, bukan database utama.
- Jangan import file custom bebas.
- Import Pesanan marketplace tidak mengurangi stok; stok marketplace turun saat Packing / Outbound.
- Settlement dilakukan satu kali saat dana sudah dilepas marketplace.
- Semua transaksi penting dibuat atomik; jika gagal di tengah, data tidak setengah jadi.
- HPP hanya boleh dilihat role Owner dan Finance.
- Request hapus harus melalui approval Owner.
