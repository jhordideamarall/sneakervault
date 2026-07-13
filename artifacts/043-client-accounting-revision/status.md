# Client Accounting Revision

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** Client Revision
**Tanggal Mulai:** 2026-07-14
**Tanggal Selesai:** 2026-07-14

## Tasks
- [x] Map all requirements from `BUKU BESAR, ASET DAN LAPORAN.docx` and `WEBSITE NEW REVIEW.pdf`
- [x] Add flexible Chart of Accounts add/edit flow
- [x] Connect each bank/cash account to its own COA account
- [x] Fix cash/bank receipt and expense posting to use selected COA counterpart accounts
- [x] Add PO workflow shortcuts and safe approved-PO delete guard
- [x] Extend manual purchase invoices with item lines and immediate stock receipt
- [x] Add PDF/Excel export coverage for revised transaction screens
- [x] Make stock opname barcode/count comparison-only with export, no automatic stock adjustment
- [x] Ensure opening stock import posts Persediaan debit and Modal Awal credit
- [x] Add fixed asset register, depreciation schedule, disposal basics, and closing depreciation
- [x] Add employee master data and payroll run with payslip PDF and salary journal posting
- [x] Add marketplace import item override for cases where shipped item differs from marketplace order
- [x] Rename Jurnal Penyesuaian to Jurnal Umum across navigation/UI/docs
- [x] Fix financial reports: bank account names in balance sheet, other income in P&L, Prive label
- [x] Final reread of both client documents and audit against implemented flows
- [x] Tighten accounting edge cases found in final audit: payroll gross/deductions, fixed asset funding source, PO/invoice delete reversal
- [x] Update docs/navigation and run web typecheck verification
- [x] Prepare final migration + Supabase MCP application step at the end only

## Blockers
- None.

## Files Modified
- `apps/web/src/lib/actions/coa.ts`
- `apps/web/src/lib/actions/bank-accounts.ts`
- `apps/web/src/lib/actions/bank-transactions.ts`
- `apps/web/src/lib/actions/data-sync.ts`
- `apps/web/src/lib/actions/purchase-orders.ts`
- `apps/web/src/lib/actions/purchase-invoices.ts`
- `apps/web/src/lib/actions/marketplace-import.ts`
- `apps/web/src/lib/actions/stock-opname.ts`
- `apps/web/src/lib/actions/employees.ts`
- `apps/web/src/lib/actions/payroll.ts`
- `apps/web/src/lib/actions/fixed-assets.ts`
- `apps/web/src/lib/actions/fiscal-periods.ts`
- `apps/web/src/lib/journal-engine.ts`
- `apps/web/src/lib/marketplace/parsers.ts`
- `apps/web/src/lib/queries/index.ts`
- `apps/web/src/components/buku-besar/coa-tree.tsx`
- `apps/web/src/components/buku-besar/journal-client.tsx`
- `apps/web/src/components/kas-bank/*`
- `apps/web/src/components/pembelian/*`
- `apps/web/src/components/penjualan/pos-customer-combobox.tsx`
- `apps/web/src/components/penjualan/import-marketplace-client.tsx`
- `apps/web/src/components/inventory/stock-opname-client.tsx`
- `apps/web/src/components/employees/employees-client.tsx`
- `apps/web/src/components/payroll/payroll-client.tsx`
- `apps/web/src/components/fixed-assets/fixed-assets-client.tsx`
- `apps/web/src/components/customers/customers-client.tsx`
- `apps/web/src/app/(dashboard)/aset/page.tsx`
- `apps/web/src/app/(dashboard)/employees/page.tsx`
- `apps/web/src/app/(dashboard)/buku-besar/payroll/page.tsx`
- `apps/web/src/app/(dashboard)/panduan/page.tsx`
- `apps/web/supabase/migrations/20260713194949_client_accounting_revision.sql`
- `packages/shared/src/validators.ts`
- `packages/supabase/src/types.ts`
- `packages/ui/src/select.tsx`
- `docs/PROJECT-GUIDE.md`
- `docs/manual-book.md`
- `artifacts/043-client-accounting-revision/status.md`

## Verification
- `pnpm --filter @sneakervault/web type-check` passed.
- `pnpm type-check` passed.
- `pnpm --filter @sneakervault/web build` passed.
- `pnpm --filter @sneakervault/web lint` passed with warnings only (React hook/typing warnings; no lint errors).
- Supabase MCP migration applied successfully as `20260713194949_client_accounting_revision`.
- Supabase MCP verification confirmed new tables/columns/RLS/policies/RPC, bank-to-COA mappings, COA seeds, and inventory data counts.
- Supabase generated TypeScript types refreshed from remote schema after MCP migration.
- Final verification on 2026-07-14: `pnpm --filter @sneakervault/web type-check`, `pnpm --filter @sneakervault/web lint`, and `pnpm --filter @sneakervault/web build` all passed.

## Final Audit Notes
- Re-read `/Users/jhordideamarall/Downloads/BUKU BESAR, ASET DAN LAPORAN.docx` and `/Users/jhordideamarall/Downloads/WEBSITE NEW REVIEW.pdf` in full after implementation.
- Payroll now posts gross salary to expense, net cash/bank or salary payable, and deductions to BPJS/PPh payroll liability.
- Fixed asset acquisition now supports cash/bank source or unpaid Hutang Usaha, so the acquisition journal matches Dr Aset Tetap / Cr Kas-Bank/Hutang.
- Fixed asset register now has PDF/Excel export for acquisition value, accumulated depreciation, book value, method, location, department, and disposal status.
- Purchase invoice delete now reverses purchase invoice journals before deletion, preventing orphan GL balances.
- PO delete now supports approved PO cleanup when no stock has been received: exclusive related vendor payments are auto-reversed, invoices are deleted with journal reversal, and unsafe mixed payments/received stock are blocked.
- QA fix after Vercel review: closing a PO-shortcut modal on `Pembelian -> Faktur` or `Pembelian -> Penerimaan` no longer reopens immediately from the lingering `?po=` URL.
