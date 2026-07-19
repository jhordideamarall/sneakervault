# Transaction Delete Dependency Flow

**Status:** [x] In Progress | [ ] Done | [ ] Blocked
**Sprint:** Client Review Correction
**Tanggal Mulai:** 2026-07-19
**Tanggal Selesai:** -

## Tasks
- [x] Verify the connected Supabase project is SneakerVault `jogqvffdjtjqdnflvubi`
- [x] Audit the distinction between Pembelian Barang and customer Pre Order
- [x] Add purchase receipt history and atomic receiving
- [x] Add dependency-aware hard-delete RPCs for purchase and sales accounting
- [x] Add owner/finance server actions and guided delete UI
- [x] Remove the mistaken POS cancellation flow and obsolete reversal/cancel copy
- [x] Update Quick Tips and welcome card without conflating Pembelian Barang with Pre Order
- [x] Run database rollback tests, type-check, lint, and production build
- [ ] Run authenticated UI QA on the Vercel production deployment
- [ ] Commit, push, open PR, merge, and verify Vercel production

## Blockers
- None.

## Files Modified
- `artifacts/047-transaction-delete-dependency-flow/status.md`
- `apps/web/supabase/migrations/20260719124225_purchase_receipts_and_atomic_receive.sql`
- `apps/web/supabase/migrations/20260719124226_transaction_hard_delete_rpcs.sql`
- `apps/web/src/lib/actions/transaction-deletes.ts`
- `apps/web/src/lib/actions/purchase-receive.ts`
- `apps/web/src/lib/actions/purchase-orders.ts`
- `apps/web/src/lib/actions/purchase-invoices.ts`
- `apps/web/src/lib/actions/vendor-payments.ts`
- `apps/web/src/lib/actions/sales-invoices.ts`
- `apps/web/src/lib/actions/customer-payments.ts`
- `apps/web/src/lib/actions/pos.ts`
- `apps/web/src/lib/queries/index.ts`
- `apps/web/src/components/transaction-delete-dialog.tsx`
- `apps/web/src/components/pembelian/po-client.tsx`
- `apps/web/src/components/pembelian/penerimaan-client.tsx`
- `apps/web/src/components/pembelian/faktur-client.tsx`
- `apps/web/src/components/pembelian/pembayaran-client.tsx`
- `apps/web/src/components/penjualan/invoice-client.tsx`
- `apps/web/src/components/penjualan/penerimaan-kas-client.tsx`
- `apps/web/src/components/penjualan/pos-client.tsx`
- `apps/web/src/components/pre-order/pre-order-client.tsx`
- `apps/web/src/components/dashboard/client-review-welcome-card.tsx`
- `apps/web/src/app/(dashboard)/panduan/page.tsx`
- `packages/supabase/src/types.ts`
- `docs/superpowers/2026-07-19-transaction-delete-dependency-flow.md`

## Verification

- Supabase MCP URL: `https://jogqvffdjtjqdnflvubi.supabase.co`
- Receipt backfill: 3 headers, 4 lines, 0 quantity mismatches
- Production data remained intact after all rollback tests
- Purchase rollback chain: `BV -> FB -> RCV -> Pembelian Barang`
- Sales rollback chain: `Penerimaan Customer -> Invoice Penjualan`
- Verified dependency, closed period, reconciled bank, used stock, marketplace,
  unauthorized role, and repeat-delete blockers
- `pnpm type-check`: passed
- `pnpm --filter @sneakervault/web lint`: passed with 72 existing warnings
- `pnpm --filter @sneakervault/web build`: passed
- `git diff --check`: passed
