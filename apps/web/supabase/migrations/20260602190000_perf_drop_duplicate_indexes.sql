-- Drop 7 duplicate indexes (each pair indexes the same columns). Keeps the
-- descriptive idx_* name, drops the redundant twin. Pure perf/storage cleanup.
DROP INDEX IF EXISTS public.bt_account_idx;            -- keep idx_bank_transactions_account_date
DROP INDEX IF EXISTS public.jl_entry_idx;              -- keep idx_journal_lines_entry_id
DROP INDEX IF EXISTS public.jl_account_idx;            -- keep idx_journal_lines_account_id
DROP INDEX IF EXISTS public.pi_status_idx;             -- keep idx_purchase_invoices_status
DROP INDEX IF EXISTS public.po_status_idx;             -- keep idx_purchase_orders_status
DROP INDEX IF EXISTS public.si_status_idx;             -- keep idx_sales_invoices_status
DROP INDEX IF EXISTS public.idx_stock_movements_product; -- keep idx_stock_movements_product_date
