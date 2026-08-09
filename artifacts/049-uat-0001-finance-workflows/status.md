# UAT-0001 Finance & Operational Workflows

**Status:** [x] In Progress | [ ] Done | [ ] Blocked
**Sprint:** Client UAT Correction
**Tanggal Mulai:** 2026-08-09
**Tanggal Selesai:** -

## Source of Truth
- Supabase project: `jogqvffdjtjqdnflvubi` (read-only audit).
- Feedback: `UAT-0001` — **Review Web Terbaru**.
- Reporter role: `finance`.
- Reported production version: `9682c14`.
- Reported at: 2026-08-07 14:29 WIB.
- Detailed acceptance matrix:
  `docs/superpowers/2026-08-09-uat-0001-finance-workflows.md`.

## Tasks
- [x] Authenticate the SneakerVault Supabase MCP project and read UAT-0001.
- [x] Audit UAT-0001 against the current UI, actions, schema, and prior artifacts.
- [x] Deduct cash/DP at Purchase Order approval, not goods receipt.
- [x] Make manual product creation available and obvious to Finance.
- [x] Make Stock Opname access discoverable and verify the Finance permission path.
- [x] Change payroll to opt-in employees with flexible earning/deduction components.
- [x] Add a separate payroll-liability settlement flow to cash/bank.
- [x] Generate and visually verify one payslip PDF per employee.
- [x] Add employee edit, deactivate, and reactivate controls.
- [x] Auto-link or create a customer when a manual sales invoice is entered.
- [x] Export a detailed general ledger containing transaction lines.
- [x] Add visible date/period filters to all mandatory operational reports.
- [x] Export stock cards with opening, movement, and closing quantities per product.
- [x] Split accounts payable and accounts receivable into separate reports.
- [x] Make Balance Sheet current-year income agree with Profit & Loss.
- [x] Make Equity Changes derive profit from P&L and withdrawals from the Prive account.
- [ ] Run authenticated browser UAT after the migration is available in a non-production environment.
- [x] Run database regression, type-check, lint/build, and PDF render inspection.
- [x] Write an operator checklist that the owner can repeat without developer assistance.

## Verification Evidence

- Production schema-only dump loaded into disposable Supabase Postgres; no
  production rows were copied.
- Migration applied successfully and reapplied successfully to prove
  idempotency.
- `20260809_uat_0001_finance_workflows.sql` passed inside a transaction and
  rolled back all fixtures. It verifies:
  - cash PO approval reduces bank immediately;
  - final receipt does not reduce bank a second time;
  - supplier advance is reclassified to inventory;
  - payroll creation/revision retains named components;
  - Hutang Gaji settlement reduces bank once and rejects a second settlement;
  - normalized manual customer names resolve to one master row.
- Function security check: all six public UAT functions have locked empty
  `search_path`; mutating functions are `SECURITY DEFINER`, customer resolver is
  `SECURITY INVOKER`; `anon` has no execute and `authenticated` does.
- `pnpm type-check`: passed.
- `pnpm --filter @sneakervault/web lint`: 0 errors; 64 existing warnings.
- `pnpm build`: passed, including all affected dynamic routes.
- Individual A4 payslip: 1 page, rendered to PNG and visually inspected;
  component labels, values, status, and take-home pay are legible and aligned.

## Blockers
- Production deployment is intentionally not started. The existing remote/local
  migration history is divergent; production migration repair or push requires
  explicit confirmation after local verification.
- Authenticated browser UAT is pending because the current linked production
  schema intentionally does not contain the new additive migration.

## Files Modified
- `artifacts/049-uat-0001-finance-workflows/status.md`
- `docs/superpowers/2026-08-09-uat-0001-finance-workflows.md`
- `docs/UAT-0001-PANDUAN-OPERATOR.md`
- `apps/web/supabase/migrations/20260808233901_uat_0001_finance_workflows.sql`
- `apps/web/supabase/tests/20260809_uat_0001_finance_workflows.sql`
- Purchase, receiving, inventory, invoice/customer, employees, payroll,
  reports, Balance Sheet, Equity Changes, shared validators, and in-app guide
  files listed by `git diff --name-only`.
