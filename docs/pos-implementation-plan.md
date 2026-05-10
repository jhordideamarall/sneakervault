# Blueprint: Integrasi Point of Sale (POS) SneakerVault

Dokumen ini adalah rencana komprehensif (master plan) untuk membangun modul Point of Sale (Kasir Toko Fisik) yang terintegrasi langsung dengan sistem gudang SneakerVault, menghilangkan ketergantungan parsial pada sistem eksternal untuk penjualan toko.

## 1. Tujuan Utama
1. **Single Source of Truth**: Penjualan toko fisik (offline) langsung memotong stok di sistem gudang SneakerVault secara *real-time*.
2. **Hitung Profit Otomatis**: Transaksi POS langsung dikawinkan dengan HPP (Harga Pokok Penjualan) untuk perhitungan margin dan profit otomatis di Dashboard Owner.
3. **Speed & Reliability**: UI Kasir harus sangat responsif, mendukung *hardware barcode scanner*, dan bisa memproses transaksi di bawah 10 detik.

---

## 2. Arsitektur Database (Schema Expansion)

Kita perlu menambahkan tabel baru untuk menangani logika kasir tanpa merusak tabel gudang (`packing_items`).

### `pos_shifts` (Manajemen Shift Kasir)
- `id` (UUID, PK)
- `opened_by` (UUID, FK ke profiles)
- `opened_at` (Timestamp)
- `closed_at` (Timestamp, nullable)
- `starting_cash` (Numeric)
- `ending_cash_expected` (Numeric)
- `ending_cash_actual` (Numeric)
- `status` (Enum: 'open', 'closed')

### `pos_transactions` (Header Struk)
- `id` (UUID, PK)
- `shift_id` (UUID, FK ke pos_shifts)
- `receipt_number` (String, auto-generated unik, misal: `SV-260510-001`)
- `customer_name` (String, nullable)
- `customer_phone` (String, nullable)
- `subtotal` (Numeric)
- `discount_amount` (Numeric)
- `grand_total` (Numeric)
- `payment_method` (Enum: 'cash', 'transfer', 'qris', 'edc')
- `status` (Enum: 'completed', 'refunded')
- `created_by` (UUID, FK ke profiles - Kasir yang bertugas)
- `created_at` (Timestamp)

### `pos_transaction_items` (Detail Item)
- `id` (UUID, PK)
- `transaction_id` (UUID, FK ke pos_transactions)
- `product_id` (UUID, FK ke products)
- `barcode_scanned` (String)
- `sell_price` (Numeric) - Harga jual saat transaksi terjadi
- `unit_hpp` (Numeric) - Modal (HPP) saat transaksi terjadi (untuk audit profit)

---

## 3. Alur Kerja (Business Logic Flow)

### A. Buka Shift (Open Shift)
1. Shopkeeper/Kasir login.
2. Akses menu **POS / Kasir**.
3. Sistem mengecek apakah kasir ini punya shift yang masih `open`. Jika tidak, pop-up "Buka Shift" muncul.
4. Kasir memasukkan nominal uang modal laci (Starting Cash).

### B. Transaksi Penjualan (Checkout)
1. **Scan Barcode**: Kasir men-scan barcode di box sepatu.
2. Sistem memanggil produk, menampilkan gambar, brand, model, size, dan harga jual.
3. *Validation*: Sistem memastikan stok > 0.
4. **Payment**: Kasir menekan tombol "Bayar" (bisa pakai *shortcut keyboard* misal `Space` atau `Enter`).
5. Pilih metode pembayaran & masukkan diskon (opsional).
6. **Checkout Execution (Atomic Transaction)**:
   - Membuat record `pos_transactions` dan `pos_transaction_items`.
   - Mengurangi `products.quantity` (-1 per scan).
   - Mencatat di `stock_movements` (type: `pos_sale`).
   - Mencatat di `activity_logs`.
7. **Print Receipt**: Sistem men-generate UI struk thermal (ukuran 80mm/58mm) dan memicu dialog print browser.

### C. Tutup Shift (Close Shift)
1. Di akhir hari, Kasir menekan "Tutup Shift".
2. Sistem merekap total uang tunai yang seharusnya ada di laci (Starting Cash + Cash Sales).
3. Kasir menghitung uang fisik dan memasukkannya (Actual Cash) untuk mencatat selisih (minus/plus).
4. Shift ditutup, laporan shift terkirim ke Owner.

---

## 4. UI/UX Design

### Tampilan Halaman Kasir (Full Screen)
- **Kiri (70%) - Keranjang (Cart)**:
  - Input field besar di atas untuk "Scan Barcode atau Cari Produk...".
  - Daftar produk yang di-scan (Foto, Brand, Model, Size, Harga).
  - Tombol hapus item (Tong sampah).
- **Kanan (30%) - Panel Pembayaran**:
  - Ringkasan: Subtotal, Diskon, Pajak (jika ada), Total Bayar.
  - Pilihan Metode Pembayaran berbentuk *grid button* besar (Tunai, QRIS, Transfer).
  - Form kembalian otomatis jika bayar tunai.
  - Tombol raksasa "BAYAR & CETAK STRUK" (Warna Emerald).

### Fitur UX Ekstra:
- **Keyboard Shortcuts**: Kasir tidak perlu pakai mouse. (`F1` bayar tunai, `F2` QRIS, `Esc` batal).
- **Hold Order (Simpan Pesanan)**: Kasir bisa menyimpan keranjang pelanggan A jika pelanggan A mendadak harus ke ATM, dan melayani pelanggan B terlebih dahulu.

---

## 5. Timeline Eksekusi (Sprint Plan)

| Fase | Fokus Pekerjaan | Estimasi |
|---|---|---|
| **Sprint 1** | **Database & Core Engine**: Setup tabel `pos_*`, RPC logic untuk kurangi stok yang tahan *race-condition*, setup schema validasi (Zod). | 3 Hari |
| **Sprint 2** | **UI Kasir (Frontend)**: Layout POS full-screen, integrasi alat scan barcode USB, state management keranjang (Zustand/Context). | 4 Hari |
| **Sprint 3** | **Sistem Pembayaran & Shift**: Modal laci, tutup shift, rekap harian, fitur diskon & metode bayar. | 3 Hari |
| **Sprint 4** | **Print Struk & Integrasi Finansial**: Desain struk thermal PDF/HTML, integrasi laporan omset POS ke halaman Overview Owner. | 4 Hari |
| **Sprint 5** | **Testing & Bug Bash**: Uji coba stress test (scan cepat 20 barang), testing hardware printer, fixing. | 2 Hari |

---

## 6. Penyesuaian dengan Sistem Gudang Saat Ini

Untuk memastikan sistem Gudang dan POS hidup berdampingan tanpa konflik:
1. Data penjualan POS akan masuk ke grafik **Overview** yang sudah kita buat.
2. Kolom `status` pada `packing_sessions` akan ditambahkan referensi untuk membedakan mana barang keluar dari "Gudang Online" (Shipped) dan mana barang keluar dari "Toko Fisik" (POS Sale).
3. HPP yang digunakan di POS akan mengunci nilai HPP saat itu juga (Snapshot), sehingga jika besok HPP berubah karena kulakan baru, profit penjualan masa lalu tidak akan berubah (Akurat secara akuntansi).

*Draft blueprint ini dirancang khusus untuk memadukan pengalaman ritel offline yang cepat dengan kekuatan backend warehouse SneakerVault.*