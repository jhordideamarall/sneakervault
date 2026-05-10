# Blueprint: SneakerVault Mobile Scanner (Android Companion)

Dokumen ini merinci rencana pengembangan aplikasi Android khusus untuk scanning barcode di gudang SneakerVault.

## 1. Tujuan Utama (Objective)
Menciptakan alat pemindai (scanner) yang **lebih cepat, lebih tangguh, dan lebih ergonomis** daripada kamera browser. Aplikasi ini difokuskan hanya pada aktivitas lapangan (lantai gudang) untuk meminimalisir *friction* saat proses Inbound dan Outbound.

## 2. Arsitektur & Teknologi (Tech Stack)
- **Framework**: React Native (Agar bisa berbagi logika/types dari monorepo yang sudah ada).
- **Scanning Engine**: **Google ML Kit Barcode Scanning** (Library native tercepat di Android).
- **Backend**: Supabase (Menggunakan tabel dan API yang sama dengan aplikasi Web).
- **State Management**: Zustand (Ringan untuk sinkronisasi data lokal).
- **Local Database**: SQLite / WatermelonDB (Untuk mendukung fitur Offline-First).

---

## 3. Fitur Utama (Core Features)

### A. High-Performance Scanning
- **Auto-Focus & Zoom**: Bisa membaca barcode kecil/buram dari jarak jauh.
- **Batch Scanning Mode**: Scan 50 box sepatu berturut-turut tanpa berpindah halaman.
- **Torch Toggle**: Tombol senter langsung di layar scan untuk area gudang yang gelap.
- **Haptic Feedback**: Getaran (Vibrate) dan bunyi "Beep" instan saat barcode terdeteksi (Memberi kepastian pada tim gudang tanpa harus melihat layar).

### B. Alur Inbound (Barang Masuk)
1. Pilih Supplier.
2. Scan Barcode.
3. Muncul pop-up kecil: *"Samba OG - Size 42"*.
4. Input Qty (Default 1) -> Klik Simpan.
5. Lanjut scan sepatu berikutnya.

### C. Alur Outbound (Packing/Keluar)
1. Pilih Sesi Packing yang aktif (diambil dari Web).
2. Scan barcode sepatu yang akan dipacking.
3. Validasi otomatis: Jika sepatu salah/tidak ada di order, HP akan bergetar panjang (Error Alert).
4. Jika benar, stok di pusat langsung berkurang secara *real-time*.

### D. Offline Mode (Buffer)
- Jika Wi-Fi gudang mati, data scan tersimpan di memori HP.
- Begitu sinyal kembali, muncul notifikasi: *"32 data scan siap di-sinkronisasi"*.

---

## 4. UI/UX Design Strategy (Operasional Lapangan)

1. **One-Hand Operation**: Semua tombol utama berada di jangkauan jempol.
2. **High Contrast UI**: Menggunakan tema gelap (Dark Mode) dengan teks putih besar agar tidak menyilaukan mata admin gudang.
3. **Big Numeric Keypad**: Input jumlah stok menggunakan tombol angka yang raksasa.
4. **Status Dashboard Sederhana**: Menampilkan *"Hari ini: 120 Inbound, 85 Outbound"* agar tim merasa produktif.

---

## 5. Rencana Tahap Pengembangan (Roadmap)

### Minggu 1: Foundation & Auth
- Inisialisasi Project React Native di monorepo.
- Integrasi Supabase Auth (Login tim gudang).
- UI dasar: Home & Mode Selection.

### Minggu 2: The Scanning Engine
- Integrasi Google ML Kit.
- Penyetelan parameter fokus dan kecepatan baca.
- Implementasi getar (haptic) dan suara (audio).

### Minggu 3: Sync & Logic
- Implementasi fungsi `scanInbound` dan `scanOutbound` mobile.
- Sinkronisasi status order secara real-time.
- Penanganan error (misal: Barcode tidak dikenal).

### Minggu 4: Offline Support & Polishing
- Implementasi storage lokal (SQLite).
- Mekanisme auto-sync data tertunda.
- Pembuatan APK (installer) untuk HP tim gudang.

---

## 6. Keuntungan bagi Mas Radit (Business Value)
1. **Zero Hallucination**: Tidak ada lagi salah baca barcode seperti di browser.
2. **Scalability**: Tim gudang bisa ditambah menjadi 5-10 orang hanya dengan menginstall APK di HP masing-masing.
3. **Hardware Ready**: Jika ke depannya Mas Radit membeli alat scanner profesional (Zebra/Honeywell), aplikasi ini sudah siap 100% untuk dikoneksikan ke tombol laser fisik alat tersebut.
