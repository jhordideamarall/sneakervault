<p align="center">
  <img src="https://img.shields.io/badge/STATUS-IN%20DEVELOPMENT-orange?style=for-the-badge" />
</p>

<h1 align="center">🏪 SneakerVault</h1>

<p align="center">
  Sistem manajemen gudang sneakers yang dibangun untuk kecepatan, transparansi, dan keamanan data.<br/>
  Dari scan barcode hingga laporan profit — semua dalam satu platform.
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

## Mengapa SneakerVault?

Toko sneakers volume tinggi tidak bisa lagi mengandalkan spreadsheet. Data tercecer, tidak ada jejak siapa yang melakukan apa, dan owner tidak punya visibilitas real-time terhadap stok maupun profit.

SneakerVault menggantikan itu semua — dengan sistem yang dirancang khusus untuk alur kerja toko sneakers.

---

## Fitur Utama

**Untuk Owner**
- Dashboard finansial: nilai stok, profit, dan produk terlaris dalam satu tampilan
- Activity log yang tidak bisa dimanipulasi — setiap aksi tercatat permanen
- Tidak ada yang bisa menghapus data tanpa persetujuan owner
- Export laporan ke PDF, Excel, atau SQL backup kapan saja

**Untuk Tim Gudang**
- Scan barcode masuk → stok langsung tercatat, HPP otomatis ter-update
- Tracking defect dan retur ke supplier per batch pembelian

**Untuk Shopkeeper**
- Buat sesi packing → scan barang satu per satu → stok berkurang otomatis
- Catat platform (Shopee/TikTok/dll), nomor order, dan kurir dalam satu sesi

**Untuk Admin Online**
- Update status order dengan satu tombol: Packing → Dikirim → Selesai
- Proses pengembalian dengan verifikasi 2 langkah — tukar size atau refund

---

## Anti-Fraud by Design

| | |
|---|---|
| Tidak ada tombol Hapus | Semua role hanya bisa *request* — owner yang memutuskan |
| Activity log immutable | Siapa, apa, kapan — tercatat permanen, tidak bisa diubah |
| Stok tidak bisa negatif | Dijaga di level aplikasi dan database sekaligus |
| Role-based access | Setiap orang hanya melihat dan mengakses apa yang relevan |

---

## Alur Kerja

```
BARANG MASUK
Tim Akuntan input ke Accurate → Print barcode → Tempel di box
→ Admin Gudang scan barcode di SneakerVault → input harga beli → Stok tercatat ✓
  (HPP otomatis dirata-rata jika model yang sama pernah masuk sebelumnya)

BARANG KELUAR
Shopkeeper buka SneakerVault → Buat sesi packing → Scan barang satu per satu
→ Isi platform + nomor order + kurir → Selesai → Stok berkurang otomatis ✓
  (Satu sesi bisa berisi banyak item sekaligus)

PENGEMBALIAN
Admin Online tandai "Pengembalian" + isi alasan
→ Admin Gudang cek fisik barang → Verified
→ Pilih: Tukar Size (stok in/out) atau Refund (stok masuk kembali) ✓
  (2 langkah verifikasi — tidak bisa diproses sepihak)
```

---

## Siap Berkembang

Dibangun dengan arsitektur monorepo — ketika website toko siap, integrasi stok bisa dilakukan tanpa membangun ulang dari nol.

---

## Dokumentasi

| | |
|---|---|
| [`docs/prd.md`](./docs/prd.md) | Spesifikasi lengkap semua fitur |
| [`docs/architecture.md`](./docs/architecture.md) | Desain database & arsitektur teknis |
| [`docs/implementation-plan.md`](./docs/implementation-plan.md) | Rencana sprint & checklist task |

---

## Developer

Built by **[Jhordi De Amarall](https://github.com/jhordideamarall)**

---

## Lisensi

```
Copyright (c) 2026 Jhordi De Amarall. All rights reserved.

Software ini bersifat proprietary dan rahasia. Dilarang menyalin,
mendistribusikan, atau menggunakan tanpa izin tertulis dari developer.
```
