# Returns UI Fix

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** UI Polish
**Tanggal Mulai:** 2026-05-12
**Tanggal Selesai:** 2026-05-12

## Tasks
- [x] Baca dokumen proyek dan artifact relevan
- [x] Audit komponen `/returns` yang masih memakai gaya UI lama
- [x] Perbaiki layout, header, tab, list retur, modal tukar size, dan form agar konsisten dengan dashboard dark theme
- [x] Verifikasi type-check untuk file yang diubah
- [x] Verifikasi lint file returns client
- [x] Update artifact status

## Blockers
- Tidak ada blocker.

## Verification
- `pnpm --filter @sneakervault/web type-check` — pass
- `pnpm --filter @sneakervault/web exec eslint src/components/returns/returns-client.tsx` — pass

## Files Modified
- apps/web/src/components/returns/returns-client.tsx
- artifacts/017-returns-ui-fix/status.md
