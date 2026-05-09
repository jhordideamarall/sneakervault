<p align="center">
  <img src="https://img.shields.io/badge/STATUS-IN%20DEVELOPMENT-orange?style=for-the-badge" />
</p>

<h1 align="center">🏪 SneakerVault</h1>

<p align="center">
  <strong>Sistem Manajemen Gudang Sneakers — Simpel, Transparan, Anti-Fraud</strong><br/>
  Menggantikan spreadsheet. Mencegah kecurangan. Memberikan kontrol penuh ke owner.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-000?style=flat-square&logo=next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase" />
  <img src="https://img.shields.io/badge/Turborepo-Monorepo-EF4444?style=flat-square&logo=turborepo" />
  <img src="https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss" />
  <img src="https://img.shields.io/badge/Deploy-Vercel-000?style=flat-square&logo=vercel" />
</p>

---

## 🎯 Masalah yang Diselesaikan

Toko sneakers dengan volume tinggi masih mencatat stok di dua tempat sekaligus — spreadsheet dan software akuntansi — sehingga data sering tidak sinkron. Tidak ada yang bisa menjawab dengan pasti: *"Barang ini keluar ke mana? Siapa yang packing? Kapan?"*

SneakerVault hadir untuk menjawab semua itu.

---

## ✅ Apa yang Bisa Dilakukan Sistem Ini

### Untuk Owner
- **Dashboard finansial** — lihat total nilai stok, profit bulan ini, dan produk terlaris dalam satu halaman
- **Kontrol penuh** — tidak ada yang bisa hapus data tanpa persetujuan owner
- **Activity log** — rekam jejak siapa melakukan apa dan kapan, tidak bisa dimanipulasi
- **Export data** — unduh laporan ke PDF atau Excel kapan saja, plus backup SQL untuk keamanan data jangka panjang

### Untuk Tim Gudang (Admin Gudang)
- **Scan barcode masuk** — tinggal scan barcode, stok langsung tercatat otomatis
- **HPP otomatis** — harga modal dirata-rata otomatis setiap ada batch baru masuk

### Untuk Tim Packing (Shopkeeper)
- **Scan barcode keluar** — scan barang yang mau dipacking, stok langsung berkurang
- **Catat per sesi** — satu sesi packing bisa berisi banyak item sekaligus, lengkap dengan platform (Shopee/TikTok/dll), nomor order, dan kurir

### Untuk Admin Online
- **Update status order** — dari Packing → Dikirim → Selesai, cukup satu tombol
- **Proses pengembalian** — tukar size atau refund, dengan verifikasi 2 langkah agar tidak ada yang bisa manipulasi

---

## 🔒 Sistem Anti-Fraud

Ini yang membedakan SneakerVault dari spreadsheet biasa:

| Fitur | Cara Kerja |
|---|---|
| **Tidak ada tombol Hapus** | Semua role hanya bisa *request* hapus — owner yang approve atau tolak |
| **Activity Log immutable** | Setiap aksi tercatat permanen: siapa, apa, kapan. Tidak bisa diedit atau dihapus. |
| **Stok tidak bisa negatif** | Dijaga di dua lapis: validasi aplikasi + constraint database |
| **Role-based access** | Setiap orang hanya bisa akses fitur sesuai tugasnya |

---

## 📱 Alur Kerja Sehari-hari

```
BARANG MASUK
Tim Akuntan input ke Accurate → Print barcode → Tempel di box
→ Admin Gudang scan barcode di SneakerVault → Stok tercatat ✓

BARANG KELUAR
Shopkeeper buka SneakerVault → Buat sesi packing → Scan barang satu per satu
→ Isi platform + nomor order + kurir → Selesai → Stok berkurang otomatis ✓

PENGEMBALIAN
Admin Online tandai "Pengembalian" + isi alasan
→ Admin Gudang cek fisik barang → Verified
→ Pilih: Tukar Size (stok in/out) atau Refund (stok masuk kembali) ✓
```

---

## 🗺️ Rencana Integrasi ke Depan

Sistem ini dibangun dengan arsitektur **monorepo** — artinya ketika website toko sudah jadi, integrasi stok antara sistem gudang dan website bisa dilakukan tanpa membangun ulang dari nol. Stok di gudang dan stok di website akan sinkron otomatis.


---

## 📚 Dokumentasi Teknis

| Dokumen | Isi |
|---|---|
| [`docs/prd.md`](./docs/prd.md) | Spesifikasi lengkap semua fitur |
| [`docs/architecture.md`](./docs/architecture.md) | Desain database & arsitektur teknis |
| [`docs/implementation-plan.md`](./docs/implementation-plan.md) | Rencana sprint & checklist task |

---

## 👤 Developer

Built by **[Jhordi De Amarall](https://github.com/jhordideamarall)**

---

## 📄 Lisensi

```
Copyright (c) 2026 Jhordi De Amarall. All rights reserved.

Software ini bersifat proprietary dan rahasia. Dilarang menyalin,
mendistribusikan, atau menggunakan tanpa izin tertulis dari developer.

Dibangun sebagai proyek komisi. Kepemilikan source code ada pada developer.
```
