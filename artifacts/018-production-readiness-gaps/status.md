# Production Readiness Gaps — Dewins.id MVP

**Status:** 🟡 Local Ready for UAT / DB Hardening Review
**Sprint:** Final Stretch (pre-production)
**Tanggal Mulai:** 2026-05-14
**Tanggal Selesai:** —
**Owner:** Jhordi + Claude + Codex

---

## 0. Executive Summary

**Feature completeness:** ~95%+ lokal untuk scope MVP + gap PDF utama.
**Production readiness:** belum final sampai migration hardening direview, data testing operasional disiapkan, dan UAT per role selesai.

> Catatan 2026-06-02: gap besar seperti POS, import marketplace, data sync Accurate, rekonsiliasi, stock opname, fiscal lock, dan expense sudah ada secara lokal. Yang perlu dijaga sekarang adalah correctness data akuntansi, apply migration hardening tanpa reset, dan testing operasional dengan data format asli client.

---

## 1. CRITICAL — wajib selesai sebelum go-live

### 1.1 Import Marketplace Excel Parser 🟡
**Lokasi:** `/penjualan/import-marketplace`
**Status update:** Parser/import flow sudah tersedia lokal dan wired ke invoice, stock decrement, dan jurnal. Masih perlu diuji dengan export asli Shopee/TikTok client untuk memastikan mapping kolom final.

**Yang perlu dibangun:**
- Parser Excel/CSV Shopee dengan field mapping (Order ID, SKU, qty, harga jual, biaya admin, ongkir, diskon, voucher, kanal, status)
- Parser TikTok Shop (format berbeda dari Shopee)
- Auto-create sales invoices bulk + auto-decrement stock + auto-journal
- Handle biaya marketplace: Beban Administrasi (6.1), Diskon & Promo (6.2), Beban Pengiriman (6.3)
- Detect duplicate (order ID sama tidak boleh double-input)
- Preview mode sebelum bulk-create
- Error report untuk row yang gagal di-parse

**Estimasi sisa:** 0.5-1 hari untuk sample asli + edge-case mapping.

### 1.2 Data Migration dari Accurate Online 🟡
**Status update:** Jalur `/settings/data-sync` sudah tersedia untuk master data dan saldo awal secara deterministic/non-AI. Tetap perlu sample export Accurate dan verifikasi trial balance di tanggal cutoff.

**Yang perlu disiapkan:**
- Export schema dari Accurate Online (saldo awal CoA, master produk, customer, supplier, outstanding invoices)
- Script seed untuk:
  - **Opening balance journal entry** (Dr/Cr semua akun per posisi tanggal cutoff)
  - Bulk import produk dengan HPP awal
  - Bulk import customer + supplier
  - Bulk import outstanding purchase_invoices + sales_invoices (status partial/unpaid)
- Cutoff strategy: tanggal X jam Y, sistem lama freeze, sistem baru go-live
- Verification: trial balance Accurate = Neraca Dewins.id di tanggal cutoff

**Estimasi sisa:** 0.5-1.5 hari tergantung kerapian export Accurate.

### 1.3 Production Deployment 🔴
**Why critical:** Saat ini app jalan di localhost. Tim Dewin tidak bisa pakai.

**Checklist deploy:**
- [ ] Vercel project setup (linked ke GitHub repo)
- [ ] Environment variables di Vercel (Supabase URL, anon key, service role)
- [ ] Custom domain (e.g. `app.dewins.id` atau subdomain Socialbrand)
- [ ] SSL/HTTPS verification
- [ ] Production Supabase = staging dipakai sekarang? atau buat project baru?
- [ ] CORS settings di Supabase untuk production domain
- [ ] Backup strategy (Supabase auto-backup atau scheduled export)
- [ ] Monitoring: Vercel analytics + Supabase logs

**Estimasi:** 0.5-1 hari (mostly config)

### 1.4 Persona Walkthrough & UAT 🔴
**Why critical:** Build green ≠ user-tested. Beberapa workflow yang kelihatan logical buat developer bisa jadi confusing buat finance/gudang/shopkeeper.

**Yang perlu dilakukan:**
- Buat akun test untuk tiap role: owner, finance, admin_gudang, admin_online, shopkeeper
- Skenario test per role (tiap orang selesaikan 1 workflow lengkap):
  - **Finance:** Buat PO Dewin → Approve → Terima barang → Cek faktur+payment auto → Cek Neraca + Laba Rugi
  - **Gudang:** Stock opname → Scan barcode → Update kondisi defect → Cek inventory
  - **Admin Online:** Import marketplace → Cek invoice ter-create → Cek stok berkurang
  - **Shopkeeper:** Tambah customer baru → Buat sales invoice offline → Penerimaan kas tunai
- Catat semua friction points, fix, retest

**Estimasi:** 0.5-1 hari testing + 1 hari fix iterasi. Ini tetap wajib sebelum production.

---

## 2. MEDIUM — perlu tapi tidak blocking

### 2.1 Rekonsiliasi BCA/Mandiri Dedicated 🟡
**Lokasi:** `/kas-bank/rekonsiliasi`
**Status update:** Upload XLSX/CSV, parser rekening koran, auto-match scoring, manual match, duplicate guard, validasi server-side, dan audit log match sudah tersedia lokal.
**Sisa:** uji dengan file rekening koran asli client dan tambah template khusus bila format bank berbeda.

### 2.2 POS untuk Penjualan WA / Offline / Toko ✅
**Status update:** POS sudah tersedia lokal dan membuat invoice, payment, stock movement, mutasi bank, dan jurnal dalam satu flow. UX input nominal di POS sudah memakai text formatted `id-ID` tanpa spinner.

### 2.3 Multi-Warehouse (Jember) 🟡
**Saat ini:** Pakai notes di inventory (workaround).
**Future-need:** Proper multi-warehouse dengan stok terpisah, transfer antar gudang.
**Estimasi:** 2-3 hari kalau serius — sementara note workaround masih OK karena Jember stok kecil.

---

## 3. LOW — nice to have

- Training session untuk tim Dewin (record video walkthrough)
- Mobile-responsive review per page (sekarang desktop-first)
- Notification real-time untuk owner saat ada transaksi besar
- Approval workflow untuk DP > X juta (4-eyes principle)
- Backup/restore manual button untuk owner
- Audit trail UI yang lebih powerful (filter per user, per entity, per range)

---

## 4. Bukan Gap, Sudah Live

Untuk hindari kebingungan, ini yang **SUDAH OK** dan tidak perlu dikerjakan ulang:

- ✅ Database schema (Phase 1-5) full migrated di Supabase remote
- ✅ Pembelian: PO + payment terms (Kredit/Lunas/DP) → Receive (auto-faktur + auto-payment kalau cash/dp) → Bayar Vendor manual untuk credit
- ✅ Penjualan: Invoice multi-channel pricing → Penerimaan Kas
- ✅ Kas & Bank 4 submenu (Akun, Penerimaan, Pengeluaran, Mutasi)
- ✅ Buku Besar: CoA tree, drill-down ledger per akun, Jurnal manual edit/delete
- ✅ Laporan: Neraca, Laba Rugi, Perubahan Ekuitas, Arus Kas + PDF/Excel export
- ✅ Auto-Journal engine balanced + reversible
- ✅ Inventory: HPP averaged per SKU, multi-condition, low stock alert
- ✅ Customer + Supplier master data
- ✅ Activity log + role-based permissions
- ✅ QuickTip onboarding di 12 halaman
- ✅ Branding Dewins.id

---

## 5. Tasks (urutan prioritas)

- [x] **#1 Import Marketplace Parser** (Shopee + TikTok) — selesai lokal, perlu sample asli
- [ ] **#2 Production Deployment** ke Vercel + domain — 0.5-1 hari
- [x] **#3 Data Migration dari Accurate** (script + verifikasi trial balance) — jalur lokal selesai, trial balance butuh sample Accurate
- [ ] **#4 Persona Walkthrough & UAT** — 1-2 hari
- [x] #5 Rekonsiliasi BCA/Mandiri dedicated parser — selesai lokal, perlu sample asli
- [x] #6 POS module untuk WA/Offline/Toko — selesai lokal
- [ ] #7 Training session tim Dewin
- [ ] #8 Mobile responsiveness + UI numeric formatting pass

**Estimasi sisa sebelum production:** UAT + sample data + deployment + UI refinement, sekitar 2-4 hari fokus tergantung temuan testing.

---

## 6. Communication ke Client

Saran narrative ke Dewin (jangan pakai "99%"):

> "Sistem inti—pembelian, penjualan, akuntansi, dan laporan keuangan—sudah jadi dan sudah di-tes balance-nya. Sekarang tinggal 4 hal sebelum bisa kalian pakai harian:
>
> 1. **Import marketplace** Shopee/TikTok dari Excel
> 2. **Migrasi data lama** dari Accurate ke sistem baru
> 3. **Deploy** ke server production dengan domain Dewins
> 4. **Walkthrough tim** untuk pastikan tiap divisi nyaman pakainya
>
> Setelah ke-4 ini selesai, kita bisa cutover dari Accurate Online ke Dewins.id."

---

## 7. File Penting

```
docs/prd.md                                              → spec asli
docs/implementation-plan.md                              → roadmap baseline
meeting2.md, meeting3.md                                 → transkrip mentah feedback client
artifacts/011-mvp-accurate-replacement/status.md         → master control room (Phase 2-5)
artifacts/018-production-readiness-gaps/status.md        → FILE INI (gap menuju production)
```
