# Artifacts — SneakerVault Project Index

Folder ini berisi tracking progress setiap sprint/task.
Setiap subfolder = satu sprint atau task besar dengan `status.md` di dalamnya.

## Status Project: **READY FOR DEPLOY** ✓

Seluruh fitur MVP (F01-F18) dari [`docs/prd.md`](../docs/prd.md) sudah terimplementasi.
Satu-satunya yang belum dilakukan: **deploy 5 migration files ke Supabase via Dashboard SQL Editor**.

---

## Daftar Artifacts

| # | Artifact | Status | Ringkasan |
|---|---|---|---|
| 000 | [Sprint 0 — Project Setup](./000-sprint-0-project-setup/status.md) | ✅ Done | Turborepo, pnpm workspace, Next.js 15, packages setup |
| 001 | [Sprint 0 — Database Migration](./001-database-migration/status.md) | 🟡 Ready to Deploy | 5 migration files lengkap (schema, functions, triggers, RLS, seed) — tinggal di-run di Supabase Dashboard |
| 002 | [Sprint 1 — Auth + Layout + Backend Logic](./002-sprint-1-auth-layout-backend/status.md) | ✅ Done | Supabase Auth, middleware, dashboard shell, semua server actions + queries |
| 003 | [Sprint 2-7 — UI & Feature Completion](./003-sprint-2-7-ui-completion/status.md) | ✅ Done | Semua UI wired, flows lengkap, export PDF/Excel, barcode gen, realtime, bulk import, backup script |
| 004 | [Sprint 4 — Audit Fixes + UI Overhaul](./004-audit-fixes-ui-overhaul/status.md) | 🟡 In Progress | Deep audit fixes, UI redesign dark sidebar, role-based menu |

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

## Next Steps (handover ke production)

1. **Deploy migration**
   - Buka Supabase Dashboard → SQL Editor
   - Copy-paste berurutan: `schema.sql` → `functions.sql` → `triggers.sql` → `rls.sql` → `seed_helpers.sql`
2. **Bootstrap owner**
   - Sign up owner account via app `/login`
   - Di SQL Editor: `SELECT public.bootstrap_first_owner('email-owner@domain.com');`
3. **Seed data awal**
   - Import produk lewat tombol "📂 Import CSV/Excel" di halaman Inventory
   - Assign role ke tim via `/settings`
4. **Deploy app**
   - Push ke GitHub → connect Vercel project
   - Set env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`
5. **Backup rutin**
   - Jalankan `./scripts/backup.sh` setiap 1-2 minggu
