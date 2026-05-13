# Demo Data Runbook

Goal: reset business data and reseed a 90-day activity story that is consistent across stock, finance, audit log, notifications, and internal mail.

## Order

1. Ensure migrations are applied through Phase 4.
2. Create or update demo login users:

```bash
node scripts/seed-demo-users.mjs
```

3. Reset demo/business data, but keep auth users and profiles:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/reset-demo-db.sql
```

4. Seed the 90-day demo story:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/seed-demo-90-days.sql
```

5. Verify data consistency:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/verify-demo-data.sql
```

## Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Owner | owner@sneakervault.com | owner123456 |
| Finance | finance@sneakervault.com | finance123456 |
| Gudang | budi@sneakervault.com | employee123456 |
| Online | siti@sneakervault.com | employee123456 |
| Shopkeeper | agus@sneakervault.com | employee123456 |

## What Should Be Present

- Owner can open every dashboard page without a 404.
- Inventory has 40 SKUs, stock movements, HPP, return movements, defect items, and dormant items.
- Purchase flow has POs, purchase invoices, vendor payments, AP journals, and bank debit transactions.
- Sales flow has invoices, packing sessions, customer payments, AR journals, COGS journals, and bank/cash credit transactions.
- Mail has both system notifications and manual staff chat threads.
- Activity log has actions from owner, finance, gudang, online, and shopkeeper.

## Verification Rules

The verification script should return empty rows for failure sections:

- active staff with no activity
- stock mismatch between products and stock_movements
- unbalanced journal entries
- invoice overpayments
- bank current balance mismatch

The volume and mail sections are summaries, not failures.
