# Production Hardening Plan

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** Production Hardening
**Tanggal Mulai:** 2026-05-12
**Tanggal Selesai:** 2026-05-12

## Tasks
- [x] Investigasi runtime error Supabase Realtime inbox setelah upgrade stack
- [x] Perbaiki runtime error realtime channel duplicate subscription
- [x] Audit dan harden topic Realtime DB subscription lain yang memakai `postgres_changes`
- [x] Verifikasi type-check, lint, build
- [x] Smoke test production server lokal untuk route utama
- [x] Susun rencana security dan stabilitas untuk penggunaan internal 10-30 pegawai
- [x] Dokumentasikan risiko masa depan dan urutan prioritas hardening

## Blockers
- Tidak ada blocker saat ini.

## Root Cause
- Setelah upgrade stack, Supabase Realtime menolak penambahan callback `postgres_changes` pada channel yang sudah subscribed.
- React development/Strict Mode dan effect remount dapat membuat topic channel yang sama dipakai ulang sebelum cleanup channel lama selesai.
- Fix: topic untuk DB change subscription dibuat unik per effect instance dengan suffix `crypto.randomUUID()`, sementara presence channel tidak diubah karena memang butuh shared topic.

## Verification
- `pnpm --filter @sneakervault/web type-check` — pass
- `pnpm --filter @sneakervault/web lint` — pass dengan 61 warning non-blocking yang sudah ada
- `rm -rf apps/web/.next && pnpm --filter @sneakervault/web build` — pass
- `pnpm --filter @sneakervault/web exec next start -p 3001` — server start pass
- Smoke routes:
  - `/login` -> 200
  - `/workspace` -> redirect/login 200
  - `/overview` -> redirect/login 200
  - `/inventory` -> redirect/login 200

## Files Modified
- apps/web/src/lib/use-inbox.ts
- apps/web/src/components/dashboard/right-sidebar.tsx
- apps/web/src/lib/use-realtime-refresh.ts
- apps/web/src/lib/use-live-refresh.ts
- docs/plans/2026-05-12-production-hardening-roadmap.md
- artifacts/016-production-hardening-plan/status.md
