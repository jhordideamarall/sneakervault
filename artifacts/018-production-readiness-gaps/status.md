# Production Readiness Gaps — Dewins.id MVP

**Status:** 🟡 In Progress
**Sprint:** Final Stretch (pre-production)
**Tanggal Mulai:** 2026-05-14
**Tanggal Selesai:** —
**Owner:** Jhordi + Claude

---

## 0. Executive Summary

**Feature completeness:** ~85-90% (core loops live, schema 15/15 OK di Supabase)
**Production readiness:** ~60-65%

> ⚠️ **Jangan janjikan "99% final" ke client sekarang.** Sistem inti memang sudah balance-tested dan build green, tapi 4 hal kritis di bawah ini belum dikerjakan. Tanpa itu, app tidak bisa dipakai harian oleh tim Dewin.

---

## 1. CRITICAL — wajib selesai sebelum go-live

### 1.1 Import Marketplace Excel Parser 🔴
**Lokasi:** `/penjualan/import-marketplace` (saat ini stub)
**Why critical:** Dewin jualan terutama via Shopee + TikTok. **Tanpa parser ini, tidak ada cara rekam penjualan marketplace ke sistem.** Manual input invoice 100+/hari mustahil.

**Yang perlu dibangun:**
- Parser Excel/CSV Shopee dengan field mapping (Order ID, SKU, qty, harga jual, biaya admin, ongkir, diskon, voucher, kanal, status)
- Parser TikTok Shop (format berbeda dari Shopee)
- Auto-create sales invoices bulk + auto-decrement stock + auto-journal
- Handle biaya marketplace: Beban Administrasi (6.1), Diskon & Promo (6.2), Beban Pengiriman (6.3)
- Detect duplicate (order ID sama tidak boleh double-input)
- Preview mode sebelum bulk-create
- Error report untuk row yang gagal di-parse

**Estimasi:** 1-2 hari deep work

### 1.2 Data Migration dari Accurate Online 🔴
**Why critical:** Saldo awal akun, master produk existing, customer existing, hutang/piutang outstanding — semua harus dipindah supaya sistem ini bisa "lanjut" dari posisi keuangan client saat ini, bukan zero.

**Yang perlu disiapkan:**
- Export schema dari Accurate Online (saldo awal CoA, master produk, customer, supplier, outstanding invoices)
- Script seed untuk:
  - **Opening balance journal entry** (Dr/Cr semua akun per posisi tanggal cutoff)
  - Bulk import produk dengan HPP awal
  - Bulk import customer + supplier
  - Bulk import outstanding purchase_invoices + sales_invoices (status partial/unpaid)
- Cutoff strategy: tanggal X jam Y, sistem lama freeze, sistem baru go-live
- Verification: trial balance Accurate = Neraca Dewins.id di tanggal cutoff

**Estimasi:** 1-2 hari (tergantung volume data dan kerapian export Accurate)

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

**Estimasi:** 0.5-1 hari testing + 1 hari fix iterasi

---

## 2. MEDIUM — perlu tapi tidak blocking

### 2.1 Rekonsiliasi BCA Dedicated 🟡
**Lokasi:** `/kas-bank/rekonsiliasi` (stub)
**Workaround sekarang:** Toggle reconciled di Mutasi Bank — works tapi tidak ideal untuk volume tinggi.
**Yang ideal:** Upload statement BCA (CSV/PDF) → auto-match dengan bank_transactions → manual approve untuk yang tidak ke-match.
**Estimasi:** 0.5-1 hari

### 2.2 POS untuk Penjualan WA / Offline / Toko 🟡
**Why:** Di meeting, client confirm "WA bisa diakalin lewat POS". Tapi sistem POS belum ada — saat ini admin harus manual buat sales invoice untuk tiap penjualan offline. Tidak scalable kalau volume offline tinggi.
**Yang dibutuhkan:** Quick POS form (1 customer + multi product line + bayar tunai/transfer langsung) yang generate invoice+payment+kurang stok dalam 1 step.
**Estimasi:** 1 hari

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

- [ ] **#1 Import Marketplace Parser** (Shopee + TikTok) — 1-2 hari
- [ ] **#2 Production Deployment** ke Vercel + domain — 0.5-1 hari
- [ ] **#3 Data Migration dari Accurate** (script + verifikasi trial balance) — 1-2 hari
- [ ] **#4 Persona Walkthrough & UAT** — 1-2 hari
- [ ] #5 Rekonsiliasi BCA dedicated parser — 0.5-1 hari
- [ ] #6 POS module untuk WA/Offline/Toko — 1 hari
- [ ] #7 Training session tim Dewin
- [ ] #8 Mobile responsiveness pass

**Total estimasi critical (1-4): 3.5-7 hari fokus.**

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
