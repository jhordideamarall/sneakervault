# PRD: Sistem Gudang Sneakers (SneakerVault)

## 1. Overview

### 1.1 Latar Belakang
Client (Mas Radit) memiliki toko sneakers di Bali. Saat ini pencatatan stok gudang dilakukan secara manual via spreadsheet DAN di Accurate (software POS/akuntansi). Data tercecer di dua tempat, tidak ada tracking barang keluar yang jelas, rawan fraud dari tim internal, dan tidak ada visibility profit per produk secara real-time.

### 1.2 Tujuan Sistem
Membangun **sistem manajemen gudang berbasis web** yang:
- Menggantikan pencatatan manual spreadsheet (bukan menggantikan Accurate)
- Menjaga flow tim lebih simpel dan tidak ribet
- Mencegah kecurangan/fraud dari tim internal
- Memberikan transparansi penuh atas pergerakan stok
- Menghitung HPP, harga jual, dan profit per produk

### 1.3 Hubungan dengan Accurate
- Accurate tetap digunakan untuk: POS toko fisik, akuntansi, perpajakan, pencatatan pembelian
- Sistem ini TIDAK terintegrasi secara otomatis dengan Accurate
- Integrasi hanya melalui **barcode yang sama** — barcode di-generate dari Accurate, ditempel di box, lalu di-scan ke sistem ini
- Input stok ke sistem ini dilakukan **manual** oleh admin gudang via scan barcode

### 1.4 Rencana Integrasi Website Toko
- Client punya website toko yang sedang di-rebuild (kemungkinan pakai React, deploy ke Vercel)
- Setelah sistem gudang jadi, rencana integrasi stok dengan website toko (auto-decrease saat sold di website)
- Syarat integrasi: satu database atau monorepo, perlu source code website
- Arsitektur monorepo dipilih agar integrasi di masa depan lebih mudah

---

## 2. Users & Roles

### 2.1 Stakeholders
| Stakeholder | Deskripsi |
|---|---|
| Owner (Mas Radit) | Pemilik toko, decision maker, satu-satunya yang bisa approve hapus data |
| Tim Akuntan | Input pembelian ke Accurate, print barcode (TIDAK pakai sistem ini) |
| Admin Gudang | Scan barang masuk, manage stok di sistem |
| Admin Online | Handle status pengiriman, pengembalian |
| Shopkeeper | Packing barang, scan keluar, update status dikirim |

### 2.2 Role & Permission Matrix

| Permission | Owner | Admin Gudang | Admin Online | Shopkeeper |
|---|:---:|:---:|:---:|:---:|
| Lihat dashboard finansial (HPP, profit, value) | ✅ | ❌ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ | ❌ |
| Approve delete request | ✅ | ❌ | ❌ | ❌ |
| Lihat activity log | ✅ | ❌ | ❌ | ❌ |
| Input HPP & harga jual | ✅ | ❌ | ❌ | ❌ |
| Lihat stok | ✅ | ✅ | ✅ | ✅ |
| Scan barang masuk | ✅ | ✅ | ❌ | ❌ |
| Input supplier | ✅ | ✅ | ❌ | ❌ |
| Scan barang keluar (packing) | ✅ | ❌ | ❌ | ✅ |
| Input data packing (platform, order ID, packer) | ✅ | ❌ | ❌ | ✅ |
| Batalkan sesi packing (hanya saat status 'packing') | ✅ | ❌ | ❌ | ✅ |
| Ubah status: Packing → Dikirim | ✅ | ❌ | ❌ | ✅ |
| Ubah status: Dikirim → Selesai | ✅ | ❌ | ✅ | ❌ |
| Ubah status: Dikirim → Pengembalian | ✅ | ❌ | ✅ | ❌ |
| Proses pengembalian (tukar size/refund) | ✅ | ✅ | ✅ | ❌ |
| Verifikasi fisik barang return | ✅ | ✅ | ❌ | ❌ |
| Hapus data stok | ✅ (via approve request) | ❌ | ❌ | ❌ |
| Request hapus data | ✅ | ✅ | ✅ | ✅ |
| Export PDF/Excel | ✅ | ❌ | ❌ | ❌ |

> **PENTING**: Tidak ada tombol hapus untuk siapapun selain owner. Admin/shopkeeper hanya bisa "request hapus" yang harus di-approve owner.

---

## 3. Business Flow Detail

### 3.1 Flow Barang Masuk (Inbound)

```
1. Owner beli barang dari supplier (catat tanggal order ke supplier)
2. Tim akuntan transfer pembayaran
3. Barang datang → dicek quantity (misal 200 pcs)
4. Cek defect → yang defect dihitung → langsung retur ke supplier
5. Cek keaslian barang (manual, di luar sistem)
6. Tim akuntan input ke Accurate → otomatis jadi stok di Accurate
7. Accurate print barcode → ditempel di box sepatu
8. Admin gudang buka website sistem → halaman "Barang Masuk"
9. Admin gudang scan barcode satu per satu (1 scan = +1 qty)
   - Jika ada 3 box NB530 size 40.5 (barcode sama: 104163), scan 3x
   - ATAU scan 1x lalu input quantity manual = 3
10. Sistem auto-fill info produk (brand, model, size) dari barcode
11. Admin input data batch: brand, model, jumlah total, jumlah defect, harga beli per item
    - Input per MODEL (bukan per size) — sesuai cara client beli "200 Samba White, harga 1,3jt"
    - HPP otomatis diratain ke semua size dalam model tersebut
12. Admin centang konfirmasi: "Keaslian sudah dicek ✓" (wajib sebelum submit)
13. Stok bertambah di sistem + HPP ter-recalculate
14. Tanggal masuk tercatat otomatis
```

**Detail barcode dari Accurate:**
- Setiap barcode unik per SKU + size (contoh: NB530 size 40 = barcode 104132, NB530 size 40.5 = barcode 104163)
- Label barcode berisi: tanggal, nomor barcode, nama brand/model, size
- Saat di-scan, sistem harus bisa auto-complete semua info produk
- Multiple unit dengan barcode sama bisa ada (misal 3 box size 40.5 = barcode sama semua)

### 3.2 Flow Barang Keluar (Outbound/Packing)

```
1. Shopkeeper buka website → halaman "Packing/Keluar"
2. Shopkeeper klik "Buat Sesi Packing Baru"
3. Input data sesi packing (header):
   - Siapa yang packing (pilih dari daftar user shopkeeper — bukan free text, FK ke profiles)
   - Platform penjualan (Shopee / TikTok / Tokopedia / Offline / Lainnya)
   - Nomor order / ID order dari platform
   - Kurir / ekspedisi (JNE / J&T / SiCepat / Anteraja / Offline / Lainnya)
4. Scan barcode barang satu per satu (bisa banyak item dalam 1 sesi)
   - Setiap scan = 1 item keluar, stok berkurang
   - Bisa scan 5 sepatu berbeda dalam 1 sesi packing
5. Setelah semua item di-scan → klik "Selesai Packing"
6. Status sesi: "Packing"
7. Setelah di-pick up kurir:
   - Shopkeeper ubah status sesi → "Dikirim"
```

> **PENTING**: 1 sesi packing bisa berisi BANYAK item (multi-item per shipment). Semua item dalam 1 sesi share platform, order ID, dan kurir yang sama. Stok berkurang per item saat di-scan, bukan saat sesi selesai.

### 3.3 Flow Status Tracking

```
Status Flow:
┌─────────┐     ┌──────────┐     ┌──────────────┐
│ Packing │ ──► │ Dikirim  │ ──► │   Selesai    │ ──► masuk ke "Sold"
└─────────┘     └──────────┘     └──────────────┘
  (Shopkeeper)    (Shopkeeper)      (Admin Online)
                       │
                       ▼
                ┌──────────────┐     ┌──────────────┐
                │ Pengembalian │ ──► │  Verified    │
                └──────────────┘     └──────────────┘
                  (Admin Online)       (Admin Gudang cek fisik)
                                            │
                                   ┌────────┴────────┐
                                   ▼                 ▼
                             ┌───────────┐    ┌──────────┐
                             │Tukar Size │    │  Refund  │
                             └───────────┘    └──────────┘
                              (stok in+out)    (stok in)
```

**Siapa ubah status apa:**
- **Shopkeeper**: Packing → Dikirim (setelah kurir pick up)
- **Admin Online**: Dikirim → Selesai (order complete, masuk ke view "Sold")
- **Admin Online**: Dikirim → Pengembalian (harus input alasan)
- **Admin Gudang**: Pengembalian → Verified (setelah cek barang fisik yang kembali)
- **Admin Gudang/Online**: Verified → Processed (tukar size atau refund)

### 3.4 Flow Pengembalian (Return)

```
1. Admin online ubah status order ke "Pengembalian"
2. Wajib input alasan pengembalian
3. Barang fisik dikirim balik oleh customer

4. Admin gudang VERIFIKASI barang fisik yang kembali:
   - Cek kondisi barang
   - Konfirmasi alasan sesuai (misal benar mau tukar size)
   - Update status return: "Verified"

5. Pilih tipe: Tukar Size ATAU Refund

Jika Tukar Size:
  - Input size baru yang diminta
  - Barang lama: masuk kembali ke stok (return_in)
  - Barang baru (size baru): keluar dari stok (return_out) → packing ulang
  - Owner bisa verifikasi: cek di Shopee/TikTok apakah memang ada pengembalian

Jika Refund:
  - Barang masuk kembali ke stok (return_in)
  - Dicatat sebagai refund
  - Tidak ada barang keluar baru
```

> **PENTING**: Return bukan 1 step. Ada verifikasi fisik oleh admin gudang sebelum proses tukar/refund.

### 3.5 Flow Anti-Fraud

```
1. Tidak ada tombol "Hapus" di level admin/shopkeeper
2. Jika ingin hapus data → submit "Delete Request" dengan alasan
3. Owner menerima notifikasi request
4. Owner approve/reject
5. Semua aktivitas tercatat di Activity Log:
   - Siapa login kapan
   - Siapa scan apa
   - Siapa ubah status apa
   - Siapa request hapus apa
```

---

## 4. Functional Requirements

### 4.1 Must Have (MVP)

| ID | Feature | Deskripsi |
|---|---|---|
| F01 | Auth & Role Management | Login, register (by owner), role assignment |
| F02 | Product Management | CRUD produk: brand, model, SKU, size, barcode, warna |
| F03 | Barcode Scan - Masuk | Scan barcode (hardware + kamera) → auto-fill product → tambah stok |
| F04 | Barcode Scan - Keluar | Scan barcode (multi-item) → kurangi stok per item → attach ke sesi packing |
| F05 | Data Packing (Sesi) | Input per sesi: packer name, platform, order ID, kurir/ekspedisi. 1 sesi = 1 shipment = banyak item |
| F06 | Status Tracking | Packing → Dikirim → Selesai/Pengembalian |
| F07 | Pengembalian | Tukar size (stok in/out) atau refund (stok in) |
| F08 | HPP Rata-rata | Weighted average cost per model/SKU, auto-recalculate saat batch baru masuk |
| F09 | Dashboard Owner | Total value stok, profit, bestseller, grafik penjualan |
| F10 | Activity Log | Log semua aktivitas user (immutable) |
| F11 | Delete Request/Approval | Request → Owner approve → baru terhapus |
| F12 | Supplier Management | Data supplier, riwayat pembelian, tracking defect/retur |

### 4.2 Should Have

| ID | Feature | Deskripsi |
|---|---|---|
| F13 | Export PDF | Laporan stok, profit, penjualan dalam format PDF |
| F14 | Export Excel | Data stok & transaksi dalam format spreadsheet |
| F15 | Generate Barcode | Sistem bisa generate barcode sendiri (selain pakai Accurate) |
| F16 | Laporan Value | Value barang masuk/keluar, modal vs profit |
| F17 | Bestseller Report | Produk paling laku, produk yang stoknya habis |
| F18 | Stok Aging | Berapa lama barang ada di gudang |

### 4.3 Nice to Have (Future)

| ID | Feature | Deskripsi |
|---|---|---|
| F19 | Integrasi Website Toko | Sync stok dengan website e-commerce (auto-decrease) |
| F20 | Notifikasi | Alert stok menipis, order baru, dll |
| F21 | Multi-gudang | Support lebih dari satu lokasi gudang |

---

## 5. Non-Functional Requirements

| ID | Requirement | Detail |
|---|---|---|
| NF01 | Performance | Harus cepat, tidak lemot. Dipakai banyak user bersamaan. Target: page load < 2s |
| NF02 | Cloud Storage | Supabase (PostgreSQL + Storage). Akses database dipegang owner |
| NF03 | Data Backup | Support SQL dump + PDF export. Owner bisa backup 6 bulan sekali |
| NF04 | Responsive | Bisa diakses dari laptop (utama) dan HP (secondary) |
| NF05 | Scalable | Monorepo architecture, siap integrasi website toko di masa depan |
| NF06 | Security | RLS, role-based access, no hard delete tanpa approval |
| NF07 | Availability | Cloud-based, accessible 24/7 |
| NF08 | Data Integrity | Stok tidak bisa negatif, setiap mutasi harus ada trail |

---

## 6. Data Model (Konseptual)

### 6.1 Entitas Utama

| Entity | Deskripsi | Key Fields |
|---|---|---|
| User | Pengguna sistem | email, name, role, avatar |
| Product | Produk sneakers | brand, model, sku, size, color, barcode, quantity, hpp, sell_price, first_inbound_at |
| Supplier | Pemasok barang | name, contact, address |
| PurchaseBatch | Batch pembelian (untuk HPP) | supplier, brand, model, product_id (nullable), qty, defect_qty, returned_to_supplier, unit_cost, ordered_at, received_at |
| StockMovement | Setiap pergerakan stok | product, type(in/out/return_in/return_out), qty, performed_by, date |
| PackingSession | Satu sesi packing = satu shipment | platform, order_id, courier, packed_by (FK profiles), status, timestamps |
| PackingItem | Item dalam satu sesi packing | packing_session_id, product_id, barcode_scanned |
| Return | Pengembalian | packing_item_id, type(exchange/refund), reason, new_size, verified_by, verified_at |
| ActivityLog | Log aktivitas | user, action, entity, metadata, timestamp |
| DeleteRequest | Request hapus data | requested_by, entity, reason, status, reviewed_by, review_notes |

### 6.2 HPP Calculation

**Metode: Weighted Average Cost (Rata-rata Tertimbang)**

```
HPP Baru = (Stok Lama × HPP Lama + Qty Baru × Harga Beli Baru) / (Stok Lama + Qty Baru)
```

Contoh:
- Samba White stok 10 pcs @ Rp1.300.000
- Beli lagi 5 pcs @ Rp1.100.000
- HPP baru = (10 × 1.300.000 + 5 × 1.100.000) / 15 = Rp1.233.333

**Scope:** Per model (semua size dalam satu model punya HPP yang sama, sesuai permintaan client "diratain"). Ketika batch baru masuk untuk model X, HPP baru di-update ke SEMUA rows products yang punya model yang sama (semua size). Field `hpp` di tabel `products` menyimpan nilai per row, tapi recalculation selalu dilakukan per model — bukan per size individual.

**Implementasi recalculation:**
- "Stok lama" diambil dari `SUM(products.quantity)` untuk semua size dalam model yang sama (bukan dari stock_movements, untuk konsistensi)
- Recalculation dijalankan dalam satu database transaction untuk mencegah race condition jika 2 batch masuk bersamaan
- Setelah recalculate, nilai `hpp` baru di-UPDATE ke semua rows products dengan brand+model yang sama

### 6.3 Barcode Specification

- **Format:** Numerik (contoh: 104132, 104163)
- **Keunikan:** Per SKU + per size (setiap kombinasi model+size punya barcode berbeda)
- **Sumber:** Di-generate dari Accurate, di-print, ditempel di box
- **Isi label:** Tanggal, nomor barcode, nama brand/model, size
- **Di sistem ini:** Barcode digunakan sebagai identifier unik untuk lookup produk
- **Fleksibilitas:** Jika barcode belum terdaftar saat scan, sistem prompt untuk daftarkan produk baru (quick-add). Jika sudah ada, langsung auto-fill + tambah qty.

---

## 7. UI/UX Requirements

### 7.1 Halaman Utama

| Halaman | Deskripsi | Akses |
|---|---|---|
| Login | Email + password | Public |
| Dashboard/Overview | Ringkasan: total stok, value, profit bulan ini, bestseller | Owner |
| Workspace | Landing page per role: task hari ini, quick actions | All (content varies by role) |
| Inventory | List semua produk + stok, search, filter by brand/size. **Kolom: SKU, Brand, Model, Size, Warna, Qty, Tanggal Masuk, Qty Keluar** | All |
| Barang Masuk (Inbound) | Scan barcode → auto-fill → input qty + batch data → confirm masuk | Admin Gudang |
| Barang Keluar (Outbound) | Buat sesi packing → input header (platform, order ID, kurir, packer) → scan item satu per satu → selesai | Shopkeeper |
| Orders | List order dengan status, filter by status. **Order ID harus prominent & mudah di-copy** untuk verifikasi ke platform | All |
| Sold | Dedicated view: semua barang yang sudah status "Selesai". Filter by date, platform, product | Owner, Admin Online |
| Pengembalian (Returns) | Proses return: verifikasi fisik → tukar size / refund | Admin Online, Admin Gudang |
| Suppliers | List supplier, riwayat pembelian, lead time | Admin Gudang, Owner |
| Reports | Laporan profit, HPP, value + export PDF/Excel | Owner |
| Settings | Manage users, activity log, delete requests | Owner |

### 7.2 UX Priorities
- **Scan harus cepat**: Scan → auto-fill → 1 klik confirm. Minimal friction.
- **packed_by auto-fill**: Jika shopkeeper yang login membuat sesi packing, field "siapa yang packing" otomatis terisi dengan nama user yang sedang login. Bisa diubah jika perlu (misal owner yang input untuk orang lain).
- **sell_price input flow**: Owner input `sell_price` saat pertama kali mendaftarkan produk (form quick-add atau product management). Bisa diupdate kapan saja dari halaman inventory/product detail. Hanya owner yang bisa ubah.
- **Status update harus simpel**: Tinggal pencet tombol untuk ubah status (bukan form panjang)
- **Dashboard harus informatif**: Owner bisa lihat sekilas kondisi gudang tanpa drill-down
- **Order ID harus mudah diverifikasi**: Platform order ID prominent, bisa di-copy 1 klik, agar owner bisa cross-check ke Shopee/TikTok
- **Workspace per role**: Setiap role punya landing page yang menunjukkan task relevan hari ini (misal: shopkeeper lihat list packing hari ini, admin gudang lihat barang yang perlu di-scan masuk)

### 7.3 UX Hard Rules (Non-Negotiable)

> Client berulang kali menekankan: "simpel, enggak ribet, jangan lemot". Berikut constraint yang TIDAK BOLEH dilanggar:

| Rule | Detail |
|---|---|
| Max 2 klik untuk aksi utama | Scan masuk: scan → confirm. Scan keluar: buat sesi (form 4 field) → scan items → selesai. Ubah status: 1 tombol. |
| Tidak ada form lebih dari 5 field | Jika perlu lebih, gunakan progressive disclosure (expand/collapse) |
| Halaman harus load < 2 detik | Gunakan skeleton loading, optimistic updates |
| Navigasi sidebar max 8 item | Sesuai role, hanya tampilkan menu yang relevan |
| Mobile-friendly scan page | Shopkeeper di gudang mungkin pakai HP, halaman scan harus usable di mobile |
| Bahasa Indonesia di UI | Semua label, button, placeholder dalam Bahasa Indonesia |
| Feedback instan setiap aksi | Toast notification setelah scan berhasil, status berubah, dll |
| Zero training needed | Tim client harus bisa pakai tanpa training khusus. UI self-explanatory. |

---

## 8. Constraints & Assumptions

### Constraints
- Tidak ada integrasi API langsung dengan Accurate (Accurate tidak menyediakan public API yang accessible)
- Barcode dari Accurate sudah fix formatnya, sistem harus bisa membaca format tersebut
- Budget: Rp12 juta (termasuk 2 bulan maintenance)
- Tim client tidak technical — UI harus sangat simpel

### Assumptions
- Setiap produk yang masuk ke sistem sudah punya barcode dari Accurate
- Barcode mengandung informasi cukup untuk identify produk (brand, model, size)
- Hardware barcode scanner tersedia di gudang (USB plug & play)
- Internet stabil di lokasi gudang
- Client akan menyediakan data produk awal untuk seeding

---

## 9. Success Metrics

| Metric | Target |
|---|---|
| Waktu input barang masuk (per item) | < 5 detik (scan + confirm) |
| Waktu proses packing | < 30 detik (scan + input data + confirm) |
| Akurasi stok vs fisik | > 99% |
| Downtime | < 1% per bulan |
| User adoption | Semua tim pakai dalam 1 minggu setelah launch |

---

## 10. Design Decisions: Handling Ambiguity with Flexibility

> Prinsip: Sistem harus fleksibel agar tidak perlu banyak konfirmasi ke client. Jika ada kontradiksi, support KEDUA skenario.

| # | Ambiguitas | Keputusan Desain |
|---|---|---|
| D1 | Barcode: per-unit unik ATAU per-SKU+size sama? | **Support keduanya.** Field barcode di products = identifier per SKU+size. Tapi sistem juga support scan individual item (jika ternyata tiap box punya barcode unik, treat sebagai product row terpisah). Admin bisa pilih: "Scan = +1 qty" ATAU "Scan = register new item". |
| D2 | Scan masuk: satu-satu atau bulk? | **Support keduanya.** Mode 1: Scan berulang (setiap scan = +1). Mode 2: Scan 1x → input qty manual. Toggle di UI. |
| D3 | Admin online & admin gudang: orang berbeda atau sama? | **Support multi-role.** Satu user bisa punya >1 role (misal admin_gudang + admin_online). Permission = union dari semua role yang dimiliki. |
| D4 | Penjualan offline (POS Accurate) perlu dicatat? | **Support manual outbound tanpa order ID.** Platform "offline" tidak wajib isi order ID. Jadi admin/shopkeeper bisa catat barang keluar untuk penjualan toko fisik juga. |
| D5 | Data produk awal: import atau manual? | **Support keduanya.** Fitur import CSV/Excel untuk bulk seeding + manual entry per item. Saat scan barcode yang belum terdaftar, sistem prompt "Produk belum ada, mau daftarkan?" → form quick-add. |
| D6 | 1 order = 1 item atau banyak item? | **1 sesi packing = banyak item.** Struktur: `packing_sessions` (header: platform, order_id, courier, packed_by, status) + `packing_items` (detail: product_id per item). Stok berkurang per item saat di-scan, bukan saat sesi selesai. Return tetap bisa dilakukan per item individual dalam sesi. |
| D7 | Kurir/ekspedisi wajib diisi atau opsional? | **Opsional untuk offline, wajib untuk online.** Jika platform = "offline", kurir tidak wajib. Jika platform = Shopee/TikTok/Tokopedia, kurir wajib diisi. Validasi di frontend + server action. |
| D8 | HPP recalculation: per size atau per model? | **Per model.** Saat batch baru masuk untuk model X (misal Samba White), HPP baru dihitung dari total semua batch model X, lalu di-update ke SEMUA rows products dengan brand+model yang sama (semua size). Ini sesuai permintaan client "diratain". |
| D9 | Return: per sesi atau per item? | **Per item.** Return dilakukan per item individual (bukan per sesi). Satu sesi bisa punya 5 item, tapi hanya 1 yang dikembalikan. Return entity reference ke `packing_items.id`, bukan ke `packing_sessions.id`. |
| D10 | Kurir field: free text atau dropdown? | **Dropdown + "Lainnya" dengan free text.** Opsi default: JNE, J&T, SiCepat, Anteraja, GoSend, GrabExpress, Offline. Jika pilih "Lainnya", muncul input text. Ini menghindari typo dan memudahkan filter laporan per kurir. |
| D11 | Kapan sell_price diinput? | **Saat produk pertama kali didaftarkan.** Form quick-add dan product management wajib isi sell_price. Owner bisa update kapan saja dari halaman product detail. Jika belum diisi, sistem tampilkan warning di dashboard (profit tidak bisa dihitung). |
| D12 | defect_quantity vs returned_to_supplier: sama atau beda? | **Beda field.** `defect_quantity` = jumlah yang ditemukan cacat. `returned_to_supplier` = jumlah yang benar-benar diretur (default = defect_quantity, tapi bisa berbeda jika supplier hanya mau terima sebagian). Ini sesuai transkrip: "yang defect itu langsung diretur ke supplier" — perlu tracking berapa yang benar-benar kembali. |
