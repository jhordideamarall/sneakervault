# UAT Feedback Module

**Status:** [x] Done
**Sprint:** Post-MVP / UAT enablement
**Tanggal Mulai:** 2026-06-13
**Tanggal Selesai:** 2026-06-13

## Tasks
- [x] Tabel + RLS + RPC (`feedback_reports/comments/attachments`, `generate_feedback_number`)
- [x] Bucket privat `feedback-screenshots` + policies (signed URL only)
- [x] Shared types + Zod schemas (`feedbackInputSchema` dkk)
- [x] `NEXT_PUBLIC_APP_VERSION` dari git SHA
- [x] Server actions create/comment/triage + signed URL (role ditangkap server-side)
- [x] Read queries list + detail
- [x] Route permission `/feedback` semua role
- [x] Form upload screenshot + auto-context client
- [x] FAB melayang gated `NEXT_PUBLIC_UAT_MODE` + mount layout
- [x] Detail: auto-context block + thread komentar + status owner
- [x] Papan list + routing detail
- [x] Sidebar entry + owner signal laporan `baru`

## Blockers
- (kosong)

## Files Modified
- apps/web/supabase/migrations/20260613090000_feedback_tables.sql (new)
- apps/web/supabase/migrations/20260613090100_feedback_storage.sql (new)
- packages/shared/src/types.ts
- packages/shared/src/validators.ts
- apps/web/next.config.ts
- apps/web/src/lib/actions/feedback.ts (new)
- apps/web/src/lib/queries/feedback.ts (new)
- apps/web/src/config/permissions.ts
- apps/web/src/components/feedback/feedback-form.tsx (new)
- apps/web/src/components/feedback/feedback-fab.tsx (new)
- apps/web/src/components/feedback/feedback-detail.tsx (new)
- apps/web/src/app/(dashboard)/feedback/page.tsx (new)
- apps/web/src/app/(dashboard)/layout.tsx (mount FAB)
- apps/web/src/components/dashboard/sidebar.tsx (menu item)
- apps/web/src/lib/sidebar-signals.ts (owner signal)

## Notes
- `NEXT_PUBLIC_UAT_MODE=true` mengaktifkan FAB + menu. Matikan/kosongkan pasca go-live.
- `reporter_role` = effective role (mengikuti chip "Lihat sebagai") — berguna walau UAT pakai 1 akun owner.
- Bucket privat: screenshot diakses via signed URL server (TTL 300s).
- Verifikasi: migrasi di-apply via MCP (3 tabel + bucket private), RPC nomor berurutan (UAT-0001..0003 saat smoke-test, baris smoke sudah dihapus), type-check hijau.
- Spec: `docs/superpowers/specs/2026-06-13-uat-feedback-module-design.md`; Plan: `docs/superpowers/plans/2026-06-13-uat-feedback-module.md`.
