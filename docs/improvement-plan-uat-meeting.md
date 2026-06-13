# Plan Improvement Dewinst — Hasil Meeting Client (13 Juni 2026)

> Sumber: `newmeeting.md` (transkrip meeting Mas Radit + dev).
> Status: **usulan** — belum dikerjakan. Tujuan dokumen: kamu baca, setujui/koreksi, baru kita eksekusi per item.
> Konteks besar: alur marketplace rumit karena **settlement Shopee cair ≤7 hari** padahal barang sudah dikirim → tim butuh **stok real-time**, bukan nunggu pencairan.

---

## TL;DR — 1 kalimat per perubahan

| # | Perubahan | Kategori | Dampak | Effort |
|---|-----------|----------|--------|--------|
| 1 | Jalur **Preorder/Dropship** terpisah (modal tak masuk HPP) | Fitur + Flow | Tinggi | Besar |
| 2 | **Rename "Purchase Order" → "Pembelian Barang"** | UX | Rendah | Kecil |
| 3 | **Packing kurangi stok real-time** pakai order ID | Flow | Tinggi | Sedang |
| 4 | **Hapus fallback "tambah produk/stok 1"** di import, ganti "Mencocokkan" | Flow + UX | Tinggi | Sedang |
| 5 | Matching pakai **SKU + Order ID** (nama bebas) | Flow | Tinggi | Sedang |
| 6 | **Size free-text** (Adidas 42 2/3), jangan paksa numerik | Fitur | Sedang | Kecil |
| 7 | **POS: opsi Preorder/Dropship** + lacak ambil-di-toko | Fitur | Sedang | Sedang |
| 8 | **Packing form diperkaya** + daftar "packing hari ini" | UX | Sedang | Sedang |
| 9 | **Cleanup role & panduan** (import = finance, bukan admin online) | UX | Rendah | Kecil |

Saran urutan kerja → lihat bagian **Roadmap** di bawah.

---

## Detail per item

### 1. Preorder / Dropship sebagai jalur penjualan terpisah 🔴
**Masalah:** Penjualan bisa dari (a) stok, atau (b) dropship/preorder/request-buyer. Harga sneaker dari luar fluktuatif. Kalau modal preorder ikut masuk **HPP averaging** stok, HPP barang reguler jadi korup (naik gara-gara melayani 1 buyer).

**Keputusan:**
- Preorder/dropship punya **label & ID terpisah** — modalnya **tidak** di-average ke stok.
- Bedanya dropship vs preorder cuma **estimasi waktu** (dropship: ambil dari toko Indo yang ready; preorder: kirim dari luar negeri). Perlakuan sistem sama.
- Barang **boleh tidak ada di inventory** → izinkan **ketik nama produk manual**.
- Nyambung ke **penjualan** (dengan label preorder) dan ke **jurnal/COA** → tambah akun **"Modal Preorder"** terpisah (seperti beban administrasi/sewa yang sudah dipisah).

**Open question buat kamu:** Preorder masuknya dari mana — tab baru di menu "Pembelian Barang", atau dari POS (lihat #7), atau keduanya? Rekomendasiku: **keduanya** (POS untuk order offline, tab khusus untuk tracking).

---

### 2. Rename "Purchase Order" → "Pembelian Barang" 🟢
**Masalah:** "PO" dikira "Pre-Order" oleh tim → salah persepsi.
**Keputusan:** Menu/label "Purchase Order" diganti **"Pembelian Barang"** (atau "Purchase Item"). Istilah "PO" disisakan khusus konteks preorder.
**Catatan:** Murni ganti label + ikon; tak ubah logika. Cepat & aman.

---

### 3. Packing mengurangi stok real-time pakai Order ID 🔴
**Masalah:** Sekarang stok baru berkurang setelah **upload settlement** (bisa 7 hari). Tim butuh stok akurat saat barang **dikirim**.

**Keputusan (flow target):**
- Saat packing **"siap kirim"** diklik → **stok langsung berkurang**, dicatat dengan **Order ID** (Shopee/TikTok).
- Saat **import pesanan** masuk kemudian → kalau Order ID **sudah match** dari packing, **tidak** kurangi stok lagi (cegah dobel). Kurangi stok **hanya** untuk pesanan yang kelewat (lupa di-packing).
- Flow harus jalan **2 arah**:
  - **Packing dulu → import nyusul**: sistem cocokkan via Order ID.
  - **Import dulu → packing nyusul**: invoice tampil status **"belum di-packing"**.

**Inti teknis:** Order ID jadi **kunci pencocokan** antara sesi packing ↔ invoice penjualan ↔ data import.

---

### 4. Hapus fallback "Tambah Produk / Tambah Stok 1" di Import Marketplace 🔴
**Masalah:** Saat produk pesanan tak ketemu, sistem sekarang menawarkan "tambah produk" (stok 1, HPP 0). Tapi **pesanan nyata pasti barangnya ada** di inventory (mustahil kirim barang yang tak punya). Fallback ini bikin **produk duplikat HPP 0** → averaging korup (qty jadi 2, satu HPP 0).

**Keputusan:**
- **Hapus** opsi auto tambah produk/stok di jalur import pesanan.
- Kalau tak match → tampilkan **sinyal "data tidak cocok"** (bukan diam-diam error), lalu beri **UI "Mencocokkan"**: tunjukkan kandidat barang yang sudah dipacking → kemungkinan **salah ketik Order ID** → user benerin Order ID-nya, bukan bikin barang baru.
- Pengecualian dropship/preorder (barang memang tak di stok) → lewat **jalur #1**, bukan import pesanan. Jadi import pesanan **tak pernah** nambah inventory.

---

### 5. Pencocokan: SKU (ketat) + Order ID — nama bebas 🟠
**Masalah:** Nama beda antar platform: sistem "AJ1" vs Shopee "Air Jordan 1"/"L Jordan 1" (+ "100% Autentik"), TikTok "Air Jordan 4" vs sistem "AJ4", dst. Normalisasi nama itu yang paling susah.
**Keputusan:** **SKU jadi satu-satunya kunci match yang ketat** — nama apa pun diterima asal SKU sama. (Order ID untuk pencocokan pesanan ↔ packing, lihat #3/#4.) Standarisasi nama menyusul.

---

### 6. Size free-text untuk pecahan (Adidas) 🟠
**Masalah:** Rule sekarang **size harus numerik** (40 / 43.33). Tapi Adidas pakai pecahan resmi: 37 1/3, 38 2/3, 40 2/3, 41 1/2, 42 2/3, 43 1/3 — dunia tahunya begitu, dan Shopee menulisnya plain text "42 2/3". Memaksa desimal bikin bingung semua orang.
**Keputusan:** Size jadi **free-text / parser** yang **ikut format ekspor marketplace**; jangan paksa numerik. SKU tetap kunci. New Balance/Nike (37.5) tetap aman.

---

### 7. POS: opsi Preorder/Dropship + lacak penerimaan 🟠
**Keputusan:**
- Di POS (order offline/WA), tambah pilihan tandai **Preorder/Dropship** saat barang belum ready → masuk jalur #1 tanpa perlu Order ID marketplace.
- Saat barang preorder **datang**, lacak: **diambil di toko** vs **dipacking/dikirim**, + tanggal.
- Shopkeeper bisa **mantau** barang mana yang belum diterima/dikirim.

---

### 8. Packing form diperkaya + visibilitas 🟠
**Masalah:** Form packing terlalu sederhana (cuma Order ID). Daftar "apa yang dipacking hari ini" cuma ada di **activity log**.
**Keputusan:**
- Packing bisa pilih item **dari stok** ATAU **dari barang PO/preorder** (PO tak masuk stok).
- Tambah **daftar "Packing Hari Ini"** (item apa saja) — visibilitas untuk shopkeeper.

---

### 9. Cleanup role & panduan 🟢
**Keputusan:**
- **Import pesanan = tugas Finance (Mei)**, bukan admin_online → hapus role berlebih di `/penjualan/import-marketplace`.
- Rapikan panduan: "sinkronisasi marketplace" jangan muncul di semua role.
- **Penerimaan kas / sinkronisasi**: pertahankan **v1** dulu (sudah benar, cuma nambah kerja); sederhanakan nanti setelah flow stabil.

---

## Roadmap yang disarankan

**Fase A — Quick win & blocker UAT (kerjakan dulu, sebelum Senin)**
1. #2 Rename PO → Pembelian Barang
2. #6 Size free-text (Adidas) — penting buat import data real
3. #4 Hapus fallback "tambah produk" + sinyal "data tidak cocok" (versi minimal: sinyal dulu, UI Mencocokkan menyusul)
4. #9 Cleanup role import = finance

**Fase B — Inti flow marketplace (setelah lihat data real & wawancara Mei)**
5. #3 Packing real-time stock via Order ID (2 arah)
6. #5 Matching SKU + Order ID
7. #4 (lanjut) UI "Mencocokkan" penuh

**Fase C — Preorder/Dropship (fitur terpisah, paling besar)**
8. #1 Jalur preorder/dropship + akun jurnal "Modal Preorder"
9. #7 POS opsi preorder + lacak penerimaan
10. #8 Packing form diperkaya + daftar packing hari ini

> **Penting (kata dev & sesuai catatanku):** Fase B & C **butuh data operasional real + use-case Mei** dulu. Data sampel lama tidak akurat — itu sumber banyak "error" semu di percobaan sebelumnya. Jadi: **Senin pakai data real → temukan gap sungguhan → baru kunci desain Fase B/C.**

---

## Yang aku butuh dari kamu sebelum eksekusi
1. **Setujui urutan Fase A** (atau geser prioritas).
2. **#1 Preorder masuk via mana** — tab khusus, POS, atau keduanya? (rekomendasiku: keduanya)
3. **Nama akun jurnal** untuk modal preorder — "Modal Preorder" oke atau ada istilah finance-mu sendiri?
4. Konfirmasi label final **#2**: "Pembelian Barang" vs "Purchase Item".
