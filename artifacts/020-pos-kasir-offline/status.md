# POS Kasir Offline

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** PDF Scope Gap A2
**Tanggal Mulai:** 2026-06-01
**Tanggal Selesai:** 2026-06-02

## Tasks
- [x] Add POS checkout validator
- [x] Build `posCheckout` server action
- [x] Create `/penjualan/pos` page and POS client UI
- [x] Wire customer/product/bank data
- [x] Add receipt export flow and public notification sound asset
- [x] Add sidebar and route permission

## Blockers
- None.

## Files Modified
- packages/shared/src/validators.ts
- apps/web/src/lib/actions/pos.ts
- apps/web/src/app/(dashboard)/penjualan/pos/page.tsx
- apps/web/src/components/penjualan/pos-client.tsx
- apps/web/src/components/penjualan/pos-customer-combobox.tsx
- apps/web/src/components/penjualan/pos-payment-modal.tsx
- apps/web/src/components/penjualan/pos-product-card.tsx
- apps/web/src/components/penjualan/pos-receipt.tsx
- apps/web/src/components/penjualan/pos-receipt-settings.tsx
- apps/web/src/components/dashboard/sidebar.tsx
- apps/web/src/config/permissions.ts
- apps/web/public/sounds/simple-happy-beep.ogg
- apps/web/public/sounds/NOTICE.md

## Verification
- `pnpm --filter @sneakervault/web type-check` ✅
- `pnpm --filter @sneakervault/web build` ✅
- `/sounds/simple-happy-beep.ogg` served as `audio/ogg` ✅

