# Production Hardening & Stability Roadmap Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Menjadikan SneakerVault aman, stabil, dan mudah dirawat untuk 1 perusahaan dengan 10-30 pegawai dan 20-100 transaksi per hari.

**Architecture:** Fokus pada hardening bertahap tanpa over-engineering: Supabase RLS/RPC security, audit trail, backup, E2E smoke test, observability ringan, dan cleanup React/Realtime setelah upgrade Next 16 + React 19.2. Untuk skala ini, prioritas bukan microservice atau infra kompleks, tetapi kontrol akses benar, data aman, transaksi idempotent, backup teruji, dan workflow utama punya regression test.

**Tech Stack:** Next.js 16.2, React 19.2, TypeScript 6, Supabase PostgreSQL 17/Auth/Storage/Realtime, pnpm/Turborepo, Vercel.

---

## Scope & Assumptions

- Pengguna internal: 10-30 pegawai.
- Volume: 20-100 transaksi/hari; traffic rendah-menengah, tapi data stok/keuangan penting.
- Sistem dipakai satu perusahaan/tenant, bukan SaaS multi-tenant.
- Target: production internal yang aman dan bisa dipulihkan jika terjadi salah input, fraud, atau incident.
- Tidak melakukan destructive DB operation tanpa approval eksplisit.
- Semua schema/security change harus lewat migration baru.

---

## Release Gate Definition

Aplikasi dianggap production-ready jika semua gate ini lulus:

1. Security gate
   - Supabase Advisor security warning critical/high sudah 0 atau ada documented exception.
   - Semua SECURITY DEFINER function punya `search_path` eksplisit dan EXECUTE privilege minimal.
   - `anon` tidak bisa menjalankan RPC internal.
   - Storage bucket policy tidak mengizinkan broad listing yang tidak perlu.
   - Leaked password protection aktif.

2. Data integrity gate
   - Mutation stok dan accounting memakai transaction/RPC yang atomic.
   - Workflow penting punya audit log.
   - Tidak ada hard delete untuk data operasional kecuali melalui owner-approved flow.
   - Backup dan restore dry-run terdokumentasi.

3. Stability gate
   - `pnpm --filter @sneakervault/web type-check` pass.
   - `pnpm --filter @sneakervault/web lint` pass tanpa error; React 19 compiler warnings diprioritaskan turun ke 0 untuk area dashboard/realtime/scanner.
   - `pnpm --filter @sneakervault/web build` pass.
   - Production smoke route pass.
   - Minimal Playwright smoke untuk login + 3 workflow utama pass.

4. Operational gate
   - Vercel environment variables lengkap dan tidak ada secret di repo.
   - Supabase backup aktif.
   - Owner punya SOP backup/export/restore.
   - Ada checklist deploy dan rollback.

---

## Phase 1 — Immediate Runtime Stabilization

### Task 1: Stabilkan Supabase Realtime channel lifecycle

**Objective:** Mencegah runtime error `cannot add postgres_changes callbacks ... after subscribe()` pada React Strict Mode / re-render.

**Files:**
- Modify: `apps/web/src/lib/use-inbox.ts`
- Modify: `apps/web/src/components/dashboard/right-sidebar.tsx`
- Modify: `apps/web/src/lib/use-realtime-refresh.ts`
- Modify: `apps/web/src/lib/use-live-refresh.ts`

**Steps:**
1. Gunakan channel topic unik per effect instance untuk subscription postgres_changes, contoh `inbox:${userId}:${crypto.randomUUID()}`.
2. Jangan ubah presence channel `online-users`, karena presence butuh topic bersama.
3. Cleanup dengan `supabase.removeChannel(channel)` pada return effect.
4. Verifikasi:
   - `pnpm --filter @sneakervault/web type-check`
   - `pnpm --filter @sneakervault/web lint`
   - `rm -rf apps/web/.next && pnpm --filter @sneakervault/web build`
   - `pnpm --filter @sneakervault/web exec next start -p 3001`
   - Smoke `/login`, `/workspace`, `/overview`, `/inventory`.

**Expected:** Tidak ada duplicate subscription error saat membuka dashboard/sidebar.

### Task 2: Audit semua subscription Realtime

**Objective:** Pastikan tidak ada subscription dengan topic statis yang berpotensi reuse channel setelah subscribe.

**Files:**
- Search under: `apps/web/src/**/*.ts*`

**Steps:**
1. Search `.channel(` dan `postgres_changes`.
2. Kategorikan:
   - DB change subscription: topic boleh unik per instance.
   - Presence/broadcast room: topic harus shared.
3. Update hanya DB change subscription yang berisiko.
4. Catat exception di artifact.

**Verification:** Tidak ada topic statis untuk postgres_changes kecuali benar-benar intentional dan cleanup-nya aman.

---

## Phase 2 — Supabase Security Hardening

### Task 3: Inventory RPC / function exposure

**Objective:** Membuat daftar fungsi mana yang boleh dipanggil client, mana yang internal-only.

**Files:**
- Create: `docs/security/rpc-exposure-matrix.md`
- Read: `apps/web/supabase/migrations/*.sql`

**Steps:**
1. Query Supabase function list dan Advisor security.
2. Buat matrix kolom:
   - function name
   - purpose
   - SECURITY DEFINER/INVOKER
   - callable by anon?
   - callable by authenticated?
   - allowed app roles
   - recommended grant/revoke
3. Prioritaskan function yang mengubah role, stok, HPP, invoice/payment, dan delete/cleanup.

**Verification:** Matrix lengkap untuk semua warning Supabase Advisor terkait SECURITY DEFINER.

### Task 4: Revoke anon EXECUTE untuk RPC internal

**Objective:** Mencegah anonymous user menjalankan function yang bukan public.

**Files:**
- Create migration: `apps/web/supabase/migrations/YYYYMMDDHHMMSS_harden_rpc_execute_privileges.sql`

**Steps:**
1. Untuk function internal, tambahkan `revoke execute on function ... from anon;`.
2. Untuk function yang harus dipanggil signed-in user, grant hanya ke `authenticated` jika perlu.
3. Untuk function admin/owner-only, jangan expose langsung ke client; panggil via server action yang validasi role.
4. Jangan hardcode generated UUID.

**Verification:** Supabase Advisor warning `anon_security_definer_function_executable` turun signifikan/0 untuk function internal.

### Task 5: Harden SECURITY DEFINER functions

**Objective:** Mengurangi risiko privilege escalation dan search_path hijacking.

**Files:**
- Create migration: lanjutkan migration hardening atau buat migration terpisah.

**Steps:**
1. Set `search_path` eksplisit untuk semua SECURITY DEFINER function, minimal `set search_path = public, extensions` atau schema yang dibutuhkan.
2. Function role-sensitive wajib cek `auth.uid()` dan/atau `has_role(...)` di dalam function.
3. Function bootstrap owner/employee harus diproteksi khusus:
   - `bootstrap_first_owner` hanya untuk initial setup, setelah owner pertama ada harus gagal.
   - `bootstrap_employee_role` hanya owner/admin.
4. Hindari SECURITY DEFINER untuk function yang tidak butuh privilege elevated.

**Verification:** Advisor `function_search_path_mutable` clean; manual SQL test memastikan anon tidak bisa call function internal.

### Task 6: Storage bucket policy hardening

**Objective:** Mencegah listing file attachment yang tidak perlu.

**Files:**
- Create migration: `apps/web/supabase/migrations/YYYYMMDDHHMMSS_harden_storage_policies.sql`

**Steps:**
1. Review bucket `chat-attachments`.
2. Hapus broad SELECT policy yang memungkinkan listing semua object.
3. Buat policy scoped by owner/path jika attachment harus private.
4. Jika bucket tetap public untuk object URL, jangan beri list permission broad.

**Verification:** Supabase Advisor `public_bucket_allows_listing` clean atau documented exception.

### Task 7: Enable Auth leaked password protection

**Objective:** Mengurangi risiko akun internal memakai password bocor.

**Steps:**
1. Aktifkan Supabase Auth leaked password protection di dashboard.
2. Set password policy minimum sesuai kebutuhan internal.
3. Dokumentasikan SOP reset password pegawai.

**Verification:** Auth Advisor warning hilang.

---

## Phase 3 — Database Performance & Data Integrity

### Task 8: Index foreign keys yang penting

**Objective:** Menjaga query tetap cepat untuk 20-100 transaksi/hari dan data yang tumbuh bulanan.

**Files:**
- Create migration: `apps/web/supabase/migrations/YYYYMMDDHHMMSS_add_missing_fk_indexes.sql`

**Steps:**
1. Dari Supabase Performance Advisor, prioritaskan FK di table transaksi utama:
   - `products.default_supplier_id`
   - `purchase_orders.created_by`, `approved_by`
   - `purchase_invoices.po_id`, `created_by`
   - `sales_invoices.created_by`, `customer_id` jika belum ada
   - `bank_transactions.created_by`, `reconciled_by`
   - `journal_entries.created_by`, `reversed_by`
   - `stock_movements.performed_by`
2. Gunakan `create index if not exists`.
3. Jangan hapus unused index dulu sampai ada traffic production minimal 2-4 minggu.

**Verification:** Advisor unindexed FK warning turun; build tetap pass.

### Task 9: Optimize RLS initplan

**Objective:** Mengurangi evaluasi `auth.uid()`/auth function per row.

**Files:**
- Create migration: `apps/web/supabase/migrations/YYYYMMDDHHMMSS_optimize_rls_policies.sql`

**Steps:**
1. Ubah pola RLS dari `auth.uid()` menjadi `(select auth.uid())` pada policy yang Advisor tandai.
2. Gabungkan multiple permissive policies jika logic bisa disatukan tanpa mengubah akses.
3. Test setiap role: owner, admin gudang, admin online, shopkeeper.

**Verification:** Advisor `auth_rls_initplan` dan `multiple_permissive_policies` turun.

### Task 10: Transaction safety untuk workflow stok/akuntansi

**Objective:** Mutation penting harus atomic agar tidak ada stok minus/journal setengah jadi.

**Files:**
- Audit: `apps/web/src/lib/actions/*.ts`
- Audit: DB functions di migrations.

**Steps:**
1. Identifikasi action yang melakukan multi-step mutation:
   - inbound receive
   - outbound scan/packing
   - return process
   - purchase invoice/payment
   - sales invoice/payment
   - bank reconciliation
   - journal posting
2. Pastikan mutation multi-step dipindah ke RPC transaction atau server-side transaction pattern.
3. Tambahkan idempotency key untuk import marketplace / order external agar tidak double-posting.

**Verification:** Manual double-submit test tidak membuat duplikasi stok/journal.

---

## Phase 4 — Frontend Stability & React 19 Cleanup

### Task 11: Turunkan React 19 lint warnings prioritas tinggi

**Objective:** Menghindari bug subtle saat React Compiler/rules makin ketat.

**Files Prioritas:**
- `apps/web/src/lib/use-inbox.ts`
- `apps/web/src/components/dashboard/right-sidebar.tsx`
- `apps/web/src/components/dashboard/sales-chart.tsx`
- `apps/web/src/components/dashboard/workspace-charts.tsx`
- `apps/web/src/lib/use-date-filter.tsx`
- `apps/web/src/app/(dashboard)/reports/page.tsx`

**Steps:**
1. Pindahkan `Date.now()` dari render ke memo/state yang stabil.
2. Pindahkan komponen inline seperti tooltip/tick keluar dari render component.
3. Hindari update ref saat render; update dalam effect.
4. Hapus unused imports.
5. Kurangi `any` pada area dashboard/realtime.

**Verification:** Lint warning turun dari 61 ke target <10, lalu 0 untuk area runtime utama.

### Task 12: Tambah error boundary untuk dashboard

**Objective:** Error di widget/sidebar tidak menjatuhkan seluruh dashboard.

**Files:**
- Create: `apps/web/src/components/error-boundary.tsx`
- Modify: dashboard layout/sidebar area.

**Steps:**
1. Tambahkan client error boundary ringan.
2. Wrap komponen non-critical seperti mail sidebar, realtime widgets, charts.
3. Tampilkan fallback dalam Bahasa Indonesia.

**Verification:** Simulasi throw error di child component hanya menampilkan fallback, layout utama tetap jalan.

---

## Phase 5 — Automated Tests & QA

### Task 13: Tambah Playwright smoke test

**Objective:** Menjamin flow utama tidak rusak setelah upgrade/deploy.

**Files:**
- Create: `apps/web/e2e/*.spec.ts`
- Modify: `apps/web/package.json`

**Smoke minimum:**
1. Login owner/staff test account.
2. Buka workspace/dashboard.
3. Inventory search/filter.
4. Inbound draft/validation.
5. Packing/outbound validation.
6. Reports page render.

**Verification:** `pnpm --filter @sneakervault/web test:e2e` pass di local dan CI.

### Task 14: Role permission regression test

**Objective:** Mencegah role melihat menu/route yang tidak boleh.

**Steps:**
1. Buat matrix role-route dari PRD.
2. Test minimal untuk owner, admin_gudang, admin_online, shopkeeper.
3. Cek route protected redirect atau forbidden sesuai desain.

**Verification:** Semua route permission sesuai PRD.

---

## Phase 6 — Backup, Monitoring, and Operations

### Task 15: Backup & restore SOP

**Objective:** Owner bisa pulihkan data jika salah deploy/salah input besar.

**Files:**
- Create: `docs/operations/backup-restore.md`
- Create/update: backup script jika belum ada.

**Steps:**
1. Pastikan Supabase scheduled backup aktif.
2. Buat SOP manual export SQL/data penting.
3. Buat restore dry-run ke Supabase branch/dev project.
4. Dokumentasikan RPO/RTO realistis untuk bisnis.

**Recommendation untuk skala ini:**
- Daily automated backup cukup.
- Manual export sebelum migration besar.
- Restore drill minimal 1x sebelum go-live.

### Task 16: Deploy checklist & rollback plan

**Objective:** Deploy tidak bergantung ingatan developer.

**Files:**
- Create: `docs/operations/deploy-checklist.md`

**Checklist:**
1. `git status` bersih atau diff terkontrol.
2. Type-check/lint/build pass.
3. Supabase migration reviewed.
4. Backup sebelum migration.
5. Deploy staging/preview.
6. Smoke test.
7. Deploy production.
8. Post-deploy smoke.
9. Rollback path jelas.

### Task 17: Observability ringan

**Objective:** Error production cepat diketahui tanpa setup rumit.

**Steps:**
1. Aktifkan Vercel runtime logs/alerts.
2. Pertimbangkan Sentry atau Logtail jika budget memungkinkan.
3. Tambah structured logging minimal di server actions penting.
4. Buat error report SOP untuk pegawai: screenshot, jam kejadian, akun, halaman, aksi terakhir.

---

## Priority Timeline

### Minggu 1 — Wajib sebelum production data real
- Phase 1 Realtime stabilization.
- Phase 2 Supabase security hardening.
- Backup/restore SOP draft.
- Deploy checklist.

### Minggu 2 — Wajib sebelum dipakai 10-30 pegawai penuh
- FK indexes prioritas.
- RLS initplan optimization prioritas.
- Playwright smoke login + dashboard + inventory.
- Role permission test.

### Minggu 3-4 — Stabilitas dan polish
- React lint warnings turun ke <10 atau 0 untuk area utama.
- Error boundary dashboard.
- Monitoring ringan.
- Restore drill.

### Setelah 2-4 minggu production
- Review unused indexes berdasarkan real traffic.
- Review slow query logs.
- Review audit logs dan role assignments.
- Perbaiki UX berdasarkan feedback pegawai.

---

## Non-Goals

- Tidak perlu multi-tenant architecture.
- Tidak perlu Kubernetes/Docker infra kompleks.
- Tidak perlu queue system besar kecuali import marketplace mulai berat.
- Tidak perlu full enterprise SOC2-style control; cukup audit, backup, least privilege, dan regression test.

---

## Current Known Risks

1. Supabase SECURITY DEFINER exposure masih perlu hardening.
2. Storage bucket `chat-attachments` broad listing perlu dipersempit.
3. Leaked password protection belum aktif.
4. Beberapa RLS policy belum optimal.
5. Banyak FK belum punya covering index.
6. React 19 lint warning masih 61 warning non-blocking.
7. Belum ada E2E regression test.
8. Banyak file uncommitted dari sprint sebelumnya; perlu commit strategy setelah review.

---

## Verification Commands

Run before every production deploy:

```bash
pnpm --filter @sneakervault/web type-check
pnpm --filter @sneakervault/web lint
rm -rf apps/web/.next && pnpm --filter @sneakervault/web build
pnpm --filter @sneakervault/web exec next start -p 3001
```

Smoke routes:

```bash
curl -I http://127.0.0.1:3001/login
curl -I http://127.0.0.1:3001/workspace
curl -I http://127.0.0.1:3001/inventory
curl -I http://127.0.0.1:3001/overview
```
