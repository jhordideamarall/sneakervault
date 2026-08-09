# UAT-0001 Finance & Operational Workflows

## Goal

Resolve every workflow gap in Supabase feedback `UAT-0001` and make each flow
operable by the owner and Finance role without developer assistance.

## Audit Summary

The report is valid. Several earlier changes implemented a technical primitive
but did not implement the client's complete workflow or make it discoverable.
The 2026-07-26 work primarily protects accounting and logistics integrity and
has not been deployed to production; it does not, by itself, close UAT-0001.

| UAT requirement | Current behavior | Required acceptance |
|---|---|---|
| Cash/DP purchase reduces BCA after approval | Payment is deferred until final receipt | Approval atomically records supplier advance and reduces the selected bank; receipt never deducts it twice |
| Manual product creation | UI/action limited to owner/admin gudang | Finance sees `Tambah Produk`, can create a SKU+size variant, and gets an actionable duplicate error |
| Stock Opname access | Route permits Finance but is nested under Gudang | Finance has a direct, visible entry point and can start/count/submit; only owner approves |
| Select payroll employees manually | All active employees are preloaded | New payroll starts empty; user adds one employee at a time and cannot add the same employee twice |
| Flexible payroll components | One aggregate allowance and deduction | Each employee supports named earning and deduction rows (salary, daily pay, BPJS, overtime, THR, bonus, lateness, tax, custom) |
| Pay payroll liability later | Null bank only posts Hutang Gaji; no settlement action | Outstanding payroll can later be paid once from BCA/cash with linked bank transaction and balanced journal |
| Payslip per employee | One PDF contains all employees | Each employee has a separate payslip download showing every component and take-home pay |
| Employee edit/reactivate | Update action exists but UI only creates/deactivates | Finance can edit, deactivate, show inactive, and reactivate employees |
| Manual invoice customer master | Free text is not saved as a customer | User can select a master customer or create/link one inline; saved invoice carries `customer_id` |
| Detailed General Ledger | Mandatory report is only account totals | Export contains account, journal date/number, description, debit, credit, and running balance for all transactions |
| Period filter on every report | Reports default to month/day but expose no global control | Visible from/to and month shortcuts drive every mandatory report and its export label |
| Stock card | Export lists movements only | Per product: opening qty, each in/out/adjustment, running qty, and closing qty |
| AP and AR reports | Combined report | Separate Utang Supplier and Piutang Customer blocks/files, grouped by party |
| Balance Sheet period/formula | As-of date only; current income uses all queried P&L balances | User can select reporting date/month; current-year profit uses Jan 1..as-of and equals P&L for the same range |
| Equity Changes | Prive inferred as residual | Profit is the same P&L result; Prive is read from the dedicated Prive account; owner capital is shown separately |

## Accounting Decisions

1. A cash or DP Purchase Order approval is a supplier advance, not inventory.
   The journal is Debit `Uang Muka Pembelian` and Credit the selected bank COA.
2. Goods receipt recognizes inventory and the supplier invoice. Any recorded
   advance is applied to the payable without a second bank deduction.
3. Posting payroll without a bank creates `Hutang Gaji`. Paying that liability
   later debits `Hutang Gaji` and credits the selected cash/bank COA.
4. Payroll deductions remain explicit liabilities where applicable; named
   components are retained on the payslip and in the audit trail.
5. `Laba Tahun Berjalan` is year-to-date through the Balance Sheet date.
6. `Prive` comes from postings to the dedicated Prive COA, never a residual.

## UAT Evidence Required

For every mutation flow, record the before/after business state and the related
bank transaction and journal. For every report, test a range containing an
opening balance and at least two movements. Render payslip PDFs to PNG and
inspect text, alignment, totals, and page separation before marking done.

## Production Safety

- Do not modify production while implementing or testing this specification.
- All schema changes use a new additive, idempotent migration.
- Do not edit, rename, or delete historical migrations.
- Do not use `supabase db push --include-all`.
- Obtain explicit confirmation before migration-history repair or production push.
