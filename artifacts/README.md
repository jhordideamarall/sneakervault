# Artifacts — SneakerVault Project Index

Folder ini berisi tracking progress setiap sprint/task.
Setiap subfolder = satu sprint atau task besar dengan `status.md` di dalamnya.

## Status Project: **LOCAL READY FOR UAT / DB HARDENING REVIEW**

Seluruh fitur MVP dan scope gap PDF utama sudah terimplementasi lokal. Status saat ini bukan "langsung deploy", karena ada migration hardening baru yang perlu direview sebelum diterapkan ke Supabase remote dan database belum di-reset untuk testing operasional.

---

## Daftar Artifacts

| # | Artifact | Status | Ringkasan |
|---|---|---|---|
| 000 | [Sprint 0 — Project Setup](./000-sprint-0-project-setup/status.md) | ✅ Done | Turborepo, pnpm workspace, Next.js 15, packages setup |
| 001 | [Sprint 0 — Database Migration](./001-database-migration/status.md) | 🟡 Ready to Deploy | 5 migration files lengkap (schema, functions, triggers, RLS, seed) — tinggal di-run di Supabase Dashboard |
| 002 | [Sprint 1 — Auth + Layout + Backend Logic](./002-sprint-1-auth-layout-backend/status.md) | ✅ Done | Supabase Auth, middleware, dashboard shell, semua server actions + queries |
| 003 | [Sprint 2-7 — UI & Feature Completion](./003-sprint-2-7-ui-completion/status.md) | ✅ Done | Semua UI wired, flows lengkap, export PDF/Excel, barcode gen, realtime, bulk import, backup script |
| 004 | [Sprint 4 — Audit Fixes + UI Overhaul](./004-audit-fixes-ui-overhaul/status.md) | 🟡 In Progress | Deep audit fixes, UI redesign dark sidebar, role-based menu |
| 019 | [PDF Scope Gap A1 — Expenses Foundation](./019-expenses-foundation/status.md) | ✅ Done | Pengeluaran/beban, kategori, storage bukti, jurnal expense |
| 020 | [PDF Scope Gap A2 — POS Kasir Offline](./020-pos-kasir-offline/status.md) | ✅ Done | POS checkout offline, invoice+payment+stock+journal, struk, sound asset |
| 021 | [PDF Scope Gap A3 — Stock Opname](./021-stock-opname/status.md) | ✅ Done | Cycle count, variance, approval, stock movement, adjustment journal |
| 022 | [PDF Scope Gap A4 — Fiscal Period Lock](./022-fiscal-period-lock/status.md) | ✅ Done | Tutup buku, reopen, lock enforcement di action transaksi |
| 023 | [PDF Scope Gap B1-B4 — Import, Reports, Data Sync](./023-import-reports-data-sync/status.md) | ✅ Done | Marketplace parser, reports, dashboard stats, Accurate cutover sync, PDF parser |
| 024 | [Operational Hardening — Accounting, Stock, Rekonsiliasi](./024-operational-hardening/status.md) | 🟡 Review | Auth inactive gate, stock movement RPC migration, rekonsiliasi parser, accounting action error handling |

---

## Peta Fitur vs Artifact

| Feature (PRD ID) | Deskripsi | Diimplementasi di |
|---|---|---|
| F01 | Auth & Role Management | 002 |
| F02 | Product Management | 002, 003 |
| F03 | Scan Barang Masuk | 002, 003 |
| F04 | Scan Barang Keluar | 002, 003 |
| F05 | Data Packing (Sesi) | 002, 003 |
| F06 | Status Tracking | 002, 003 |
| F07 | Pengembalian (2-step) | 002, 003 |
| F08 | HPP Rata-rata per model | 001 (RPC), 002 (action) |
| F09 | Dashboard Owner | 003 |
| F10 | Activity Log | 001 (table+RLS), 002 (logger), 003 (viewer) |
| F11 | Delete Request/Approval | 002, 003 |
| F12 | Supplier Management | 002, 003 |
| F13 | Export PDF | 003 |
| F14 | Export Excel | 003 |
| F15 | Generate Barcode | 003 |
| F16 | Laporan Value | 003 |
| F17 | Bestseller Report | 003 |
| F18 | Stok Aging | 003 |

---

## Next Steps (review sebelum production)

1. **Review migration hardening lokal**
   - File: `apps/web/supabase/migrations/20260602091212_operational_hardening_no_reset.sql`
   - Scope: RPC stok/HPP, RPC stock movement, policy storage `chat-attachments`.
2. **Apply migration setelah disetujui**
   - Jangan reset database sebelum keputusan testing operasional.
3. **Testing operasional per role**
   - Owner, finance, admin gudang, admin online, shopkeeper.
   - Fokus: POS, marketplace import, PO receive, payment, expense, stock opname, rekonsiliasi, mail/pesan anti-fraud.
4. **Refine UI per modul**
   - Prioritas setelah logic stabil: numeric input formatter, density table, dan microcopy workflow.
5. **Deploy production**
   - Vercel + env vars + domain + backup/monitoring setelah UAT hijau.
