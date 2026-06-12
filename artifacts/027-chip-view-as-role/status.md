# Chip View-as-Role (Owner Preview)

**Status:** [x] Done
**Sprint:** Marketplace File-Based Sync
**Tanggal Mulai:** 2026-06-12
**Tanggal Selesai:** 2026-06-12

## Tasks
- [x] Overlay effective-roles di `getCurrentUserCached` (owner preview -> role itu), simpan `real_roles`
- [x] Cookie `view_as_role` (owner-only, tidak escalate)
- [x] Server action `setViewAsRole(role|null)` — gate via `real_roles`
- [x] Komponen `ViewAsBanner` (chip slim, reset, owner-only)
- [x] Integrasi `(dashboard)/layout.tsx` + guard anti-kekunci
- [x] type-check hijau

## Blockers
- (kosong)

## Files Modified
- apps/web/src/lib/auth-session.ts (overlay effective roles + VIEW_AS_COOKIE)
- apps/web/src/lib/actions/view-as.ts (baru)
- apps/web/src/components/dashboard/view-as-banner.tsx (baru)
- apps/web/src/app/(dashboard)/layout.tsx (banner + guard)

## Catatan Desain
- Overlay transparan di `getCurrentUserCached`: SEMUA konsumen (`requireRole`, `canSeeHpp`, sidebar `filterGroupsByRole`, field helper) otomatis ikut preview tanpa edit per-halaman.
- Preview hanya MEMPERSEMPIT (owner -> 1 role lebih rendah), tak pernah escalate. Non-owner: cookie diabaikan.
- DB RLS tetap pakai sesi owner asli — preview murni app-layer (read/test), aman.
- Bar selalu tampil utk owner asli (render dari `real_roles`), jadi Reset selalu 1 klik — tak bisa kekunci.
- Guard layout: preview role buka path terlarang -> redirect `/workspace` (akses semua role), bukan loop/logout.
