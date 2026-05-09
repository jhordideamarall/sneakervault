# 📖 Manual Book SneakerVault

## Buat Siapa Buku Ini?

Buku ini untuk **semua orang** yang pakai SneakerVault. Ditulis sesimpel mungkin. Kalau masih bingung, tanya Mas Jhordi.

---

## 🔑 LOGIN (Masuk ke Sistem)

1. Buka website SneakerVault di browser (Chrome/Safari)
2. Ketik **email** kamu
3. Ketik **password** kamu
4. Klik tombol **"Masuk"**
5. Kalau berhasil → masuk ke halaman Workspace

> ❗ Lupa password? Hubungi Owner (Mas Radit) untuk reset.

---

## 🏠 WORKSPACE (Halaman Utama)

Ini halaman pertama yang muncul setelah login. Isinya beda-beda tergantung **siapa kamu**:

| Kamu siapa? | Yang kamu lihat |
|---|---|
| Owner | Semua menu, ringkasan keuangan |
| Admin Gudang | Menu barang masuk, stok, supplier |
| Admin Online | Menu orders, status pengiriman, pengembalian |
| Shopkeeper | Menu packing/barang keluar, orders |

---

## 📥 BARANG MASUK (Halaman: Inbound)

**Siapa yang pakai:** Admin Gudang & Owner

**Kapan dipakai:** Saat barang baru datang dari supplier dan sudah ditempel barcode dari Accurate.

### Langkah-langkah:

#### Kalau produk SUDAH PERNAH didaftarkan:

1. Buka menu **"Barang Masuk"**
2. **Scan barcode** di box sepatu (pakai alat scanner USB ATAU klik 📷 untuk pakai kamera HP)
3. Sistem otomatis tampilkan info produk: brand, model, size
4. Isi form batch:
   - **Supplier** → pilih dari dropdown
   - **Jumlah masuk** → berapa box yang masuk (misal: 3)
   - **Harga modal/unit** → harga beli per item (misal: 1300000)
   - **Jumlah defect** → berapa yang cacat (misal: 0)
   - **Diretur ke supplier** → berapa yang dikembaliin (misal: 0)
   - **Tanggal order** → kapan pesan ke supplier
   - **Tanggal diterima** → kapan barang sampai
   - ✅ Centang **"Keaslian sudah dicek"**
5. Klik **"Konfirmasi Masuk"**
6. Selesai! Stok bertambah otomatis ✓

#### Kalau produk BELUM PERNAH didaftarkan (barcode baru):

1. Scan barcode → muncul pesan "Produk belum terdaftar"
2. Isi form pendaftaran:
   - **Brand** → misal: Adidas
   - **Model** → misal: Samba White
   - **SKU** → kode unik produk (misal: ADS-SAMBA-WHT)
   - **Size** → misal: 42
   - **Warna** → misal: White
   - **Harga Jual** → harga jual ke customer (misal: 1800000)
3. Klik **"Daftarkan & Lanjut ke Batch"**
4. Lanjut isi form batch seperti di atas
5. Selesai! Produk terdaftar + stok masuk ✓

> 💡 **Tips:** Barcode itu cuma angka (misal 104163). Pertama kali scan = daftarkan produknya. Setelah itu, scan lagi barcode yang sama = sistem langsung kenal.

> 💡 **Tips:** Kalau ada 3 box ukuran sama (barcode sama), bisa scan 1x lalu isi jumlah = 3.

---

## 📤 BARANG KELUAR / PACKING (Halaman: Outbound)

**Siapa yang pakai:** Shopkeeper & Owner

**Kapan dipakai:** Saat mau kirim barang ke customer (packing).

### Langkah-langkah:

1. Buka menu **"Packing Session"**
2. Klik **"Mulai Packing"** — isi:
   - **Platform** → dari mana ordernya? (Shopee / TikTok / Tokopedia / Offline)
   - **Kurir** → JNE / J&T / SiCepat / dll
   - **Order ID** → nomor order dari platform (copy dari Shopee/TikTok). Kalau offline, kosongkan.
3. Klik **"Mulai Packing"**
4. **Scan barcode** satu per satu untuk setiap sepatu yang mau dikirim
   - Setiap scan = 1 item keluar, stok langsung berkurang
   - Bisa scan banyak item dalam 1 sesi
5. Kalau sudah semua → klik **"Selesai Packing"**
6. Setelah kurir pick up → klik **"Tandai Dikirim"**

> ❗ **Salah scan?** Klik "Hapus" di samping item yang salah. Stok otomatis balik.

> ❗ **Mau batalkan semua?** Klik "Batalkan Sesi". Semua stok dikembalikan.

---

## 📋 ORDERS (Halaman: Orders)

**Siapa yang pakai:** Semua role

**Isinya:** Daftar semua order/packing session beserta statusnya.

### Status order:

| Status | Artinya | Siapa yang ubah |
|---|---|---|
| 🟡 Packing | Sedang dipacking | — |
| 🔵 Dikirim | Sudah di-pick up kurir | Shopkeeper klik "Tandai Dikirim" |
| 🟢 Selesai | Customer sudah terima | Admin Online klik "Selesai" |
| 🔴 Pengembalian | Customer mau return | Admin Online klik "Pengembalian" |

> 💡 **Order ID** bisa di-copy dengan 1 klik untuk verifikasi ke Shopee/TikTok.

---

## 🔄 PENGEMBALIAN / RETURN (Halaman: Returns)

**Siapa yang pakai:** Admin Online & Admin Gudang

**Kapan dipakai:** Saat customer mau kembalikan barang.

### Langkah-langkah:

1. **Admin Online** buka halaman Orders → cari order yang mau di-return
2. Klik **"Pengembalian"** → isi alasan (wajib!)
3. Tunggu barang fisik sampai kembali ke gudang
4. **Admin Gudang** cek barang fisik → klik **"Verifikasi"**
5. Pilih tipe:
   - **Tukar Size** → pilih size baru → barang lama masuk stok, barang baru keluar stok
   - **Refund** → barang masuk kembali ke stok

> ❗ Return butuh **2 langkah** (Admin Online + Admin Gudang). Tidak bisa diproses sepihak.

---

## 📦 INVENTORY / STOK (Halaman: Inventory)

**Siapa yang pakai:** Semua role

**Isinya:** Daftar semua produk beserta stoknya.

- Bisa **search** berdasarkan brand, model, SKU
- Bisa **filter** berdasarkan brand atau size
- Kolom yang tampil: SKU, Brand, Model, Size, Warna, Qty, Tanggal Masuk

> 💡 Stok tidak bisa negatif. Kalau stok 0, tidak bisa scan keluar.

---

## 🏭 SUPPLIER (Halaman: Suppliers)

**Siapa yang pakai:** Admin Gudang & Owner

**Isinya:** Daftar supplier/pemasok barang.

- Tambah supplier baru: isi nama, kontak, alamat
- Lihat riwayat pembelian per supplier
- Track berapa lama lead time (dari order sampai barang datang)

---

## 📊 OVERVIEW / DASHBOARD (Halaman: Overview)

**Siapa yang pakai:** Owner saja

**Isinya:**
- Total nilai stok (berapa rupiah barang di gudang)
- Profit bulan ini
- Produk bestseller
- Grafik penjualan

---

## 📄 REPORTS (Halaman: Reports)

**Siapa yang pakai:** Owner saja

- Export laporan ke **PDF**
- Export data ke **Excel**
- Laporan profit, HPP, value barang

---

## ⚙️ SETTINGS (Halaman: Settings)

**Siapa yang pakai:** Owner saja

- **Manage Users** → tambah user baru, assign role
- **Activity Log** → lihat siapa ngapain kapan (tidak bisa dihapus/diubah)
- **Delete Requests** → approve/reject permintaan hapus data

---

## 🗑️ HAPUS DATA

**TIDAK ADA TOMBOL HAPUS** untuk siapapun selain Owner.

Kalau mau hapus sesuatu:
1. Klik **"Request Hapus"** → isi alasan
2. Owner dapat notifikasi
3. Owner approve atau reject
4. Kalau di-approve → baru terhapus

---

## 📷 CARA SCAN BARCODE

### Pakai Alat Scanner USB (di Laptop):
- Colok scanner USB ke laptop
- Klik di kolom "Scan barcode..."
- Arahkan scanner ke barcode → **otomatis terisi** (tidak perlu klik apa-apa)

### Pakai Kamera HP:
- Klik tombol **📷** di samping kolom barcode
- Izinkan akses kamera (klik "Allow" kalau browser minta)
- Arahkan kamera ke barcode
- Tunggu sampai terdeteksi → **otomatis terisi**

### Ketik Manual:
- Ketik angka barcode di kolom (misal: 104163)
- Tekan **Enter** atau klik **"Cari"**

---

## 🔢 GENERATE BARCODE (Halaman: Generate Barcode)

**Kapan dipakai:** Kalau mau bikin barcode sendiri (selain dari Accurate).

1. Buka menu **"Generate Barcode"**
2. Pilih produk atau ketik kode
3. Klik **"Generate"**
4. Download/print barcode-nya

---

## ❓ FAQ (Pertanyaan Umum)

**Q: Barcode-nya sama untuk semua box ukuran yang sama?**
A: Ya! Misal NB530 size 40.5 = barcode 104163. Semua box size 40.5 barcode-nya sama. Kalau ada 3 box, scan 1x lalu isi jumlah = 3.

**Q: Kalau scan barcode tapi belum terdaftar?**
A: Muncul form untuk daftarkan produk baru. Isi brand, model, size, harga jual. Setelah itu barcode itu sudah dikenal sistem selamanya.

**Q: HPP itu apa?**
A: Harga Pokok Penjualan = harga modal rata-rata. Kalau beli Samba 10 pcs @1.3jt, lalu beli lagi 5 pcs @1.1jt, HPP jadi rata-rata = 1.233.333. Dihitung otomatis oleh sistem.

**Q: Kenapa stok tidak bisa negatif?**
A: Supaya data akurat. Kalau stok 0, berarti memang tidak ada barang. Tidak bisa scan keluar kalau stok habis.

**Q: Siapa yang bisa lihat data keuangan (profit, HPP)?**
A: Hanya Owner.

**Q: Bisa dipakai di HP?**
A: Bisa! Buka di browser HP. Halaman scan sudah mobile-friendly. Pakai kamera HP untuk scan barcode.

**Q: Data bisa hilang?**
A: Tidak. Data disimpan di cloud (Supabase). Owner bisa backup kapan saja via export PDF/Excel atau SQL dump.

---

## 🆘 BUTUH BANTUAN?

Hubungi developer: **Mas Jhordi** via WhatsApp atau grup.
