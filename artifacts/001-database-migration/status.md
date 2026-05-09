# Sprint 0 — Database Migration

**Status:** Ready to Deploy
**Sprint:** Sprint 0
**Tanggal Mulai:** 2026-05-10
**Tanggal Selesai:** 2026-05-10

## Migration Files (apply in order)

| # | File | Purpose |
|---|---|---|
| 00 | `20260510000000_schema.sql` | Extensions, enums, tables with CHECK constraints, indexes |
| 01 | `20260510000001_functions.sql` | Role helpers, stock RPCs (increment/decrement), HPP recalc, trigger functions |
| 02 | `20260510000002_triggers.sql` | on_auth_user_created, set_updated_at, guard_profiles_roles |
| 03 | `20260510000003_rls.sql` | All Row Level Security policies |
| 04 | `20260510000004_seed_helpers.sql` | One-time bootstrap_first_owner helper |

## Tasks
- [x] Buat migration SQL: semua tabel sesuai architecture.md
- [x] Buat indexes
- [x] Buat CHECK constraints (defect <= qty, returned <= defect, non-empty strings, etc)
- [x] Buat RLS policies (owner/admin_gudang/admin_online/shopkeeper)
- [x] Buat triggers (auto profile, updated_at, guard roles)
- [x] Buat RPC functions (increment/decrement atomic, HPP recalc, role helpers)
- [x] Buat bootstrap_first_owner helper (one-time, self-disabling)
- [ ] Deploy ke Supabase (manual via Dashboard SQL Editor, berurutan 00 → 04)
- [ ] Jalankan `SELECT public.bootstrap_first_owner('owner@email.com')` setelah owner sign up

## Deployment Steps
1. Buka Supabase Dashboard → SQL Editor
2. Copy-paste `00_schema.sql` → Run
3. Copy-paste `01_functions.sql` → Run
4. Copy-paste `02_triggers.sql` → Run
5. Copy-paste `03_rls.sql` → Run
6. Copy-paste `04_seed_helpers.sql` → Run
7. Owner sign up via app `/login` (atau Supabase Auth dashboard)
8. Di SQL Editor: `SELECT public.bootstrap_first_owner('alamat-owner@email.com');`

## Files Modified
- apps/web/supabase/migrations/20260510000000_schema.sql
- apps/web/supabase/migrations/20260510000001_functions.sql
- apps/web/supabase/migrations/20260510000002_triggers.sql
- apps/web/supabase/migrations/20260510000003_rls.sql
- apps/web/supabase/migrations/20260510000004_seed_helpers.sql
