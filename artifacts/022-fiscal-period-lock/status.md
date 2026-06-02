# Fiscal Period Lock

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** PDF Scope Gap A4
**Tanggal Mulai:** 2026-06-01
**Tanggal Selesai:** 2026-06-02

## Tasks
- [x] Add `assertPeriodOpen` helper
- [x] Add close/reopen fiscal period server actions
- [x] Create `/buku-besar/periode` page and client UI
- [x] Enforce period lock in transaction actions
- [x] Add sidebar and route permission

## Blockers
- None.

## Files Modified
- packages/shared/src/validators.ts
- apps/web/src/lib/fiscal-periods.ts
- apps/web/src/lib/actions/fiscal-periods.ts
- apps/web/src/lib/actions/bank-transactions.ts
- apps/web/src/lib/actions/customer-payments.ts
- apps/web/src/lib/actions/expenses.ts
- apps/web/src/lib/actions/inbound.ts
- apps/web/src/lib/actions/journal-entries.ts
- apps/web/src/lib/actions/marketplace-import.ts
- apps/web/src/lib/actions/purchase-invoices.ts
- apps/web/src/lib/actions/purchase-orders.ts
- apps/web/src/lib/actions/purchase-receive.ts
- apps/web/src/lib/actions/sales-invoices.ts
- apps/web/src/lib/actions/stock-opname.ts
- apps/web/src/lib/actions/vendor-payments.ts
- apps/web/src/app/(dashboard)/buku-besar/periode/page.tsx
- apps/web/src/components/buku-besar/fiscal-periods-client.tsx
- apps/web/src/components/dashboard/sidebar.tsx
- apps/web/src/config/permissions.ts

## Verification
- `pnpm --filter @sneakervault/web type-check` ✅
- `pnpm --filter @sneakervault/web build` ✅
- Route `/buku-besar/periode` included in production build ✅

