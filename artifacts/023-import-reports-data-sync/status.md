# Import, Reports, and Data Sync

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** PDF Scope Gap B1-B4
**Tanggal Mulai:** 2026-06-01
**Tanggal Selesai:** 2026-06-02

## Tasks
- [x] Add deterministic Excel/CSV marketplace parser UI
- [x] Add reports for marketplace cost, expense category, profit by channel, and stock card
- [x] Add report export sections
- [x] Add dashboard stats for pending orders, low stock, defect stock, slow moving
- [x] Add data sync server action for supplier/customer/product/bank/opening balance/outstanding import
- [x] Add `/settings/data-sync` cutover UI
- [x] Add deterministic PDF text parser for BCA statement and Shopee settlement templates
- [x] Add public notification sound asset and license notice
- [x] Exclude audio assets from auth middleware

## Blockers
- None for deterministic template-based implementation.
- Real Accurate/Shopee/TikTok/BCA exports still need client sample files for mapping refinement during review.

## Files Modified
- apps/web/src/lib/actions/data-sync.ts
- apps/web/src/lib/actions/marketplace-import.ts
- apps/web/src/lib/queries/index.ts
- apps/web/src/components/penjualan/import-marketplace-client.tsx
- apps/web/src/app/(dashboard)/penjualan/import-marketplace/page.tsx
- apps/web/src/app/(dashboard)/reports/page.tsx
- apps/web/src/components/reports/reports-export.tsx
- apps/web/src/app/(dashboard)/settings/data-sync/page.tsx
- apps/web/src/components/settings/data-sync-client.tsx
- apps/web/src/components/dashboard/sidebar.tsx
- apps/web/src/config/permissions.ts
- apps/web/src/proxy.ts
- apps/web/public/sounds/simple-happy-beep.ogg
- apps/web/public/sounds/NOTICE.md

## Verification
- `pnpm --filter @sneakervault/web type-check` ✅
- `pnpm --filter @sneakervault/web build` ✅
- Route `/settings/data-sync` included in production build ✅
- Public sound asset returns `200 OK` with `Content-Type: audio/ogg` ✅

