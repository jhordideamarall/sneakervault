-- Reset only transactional/demo data. Accounts and configuration masters are
-- intentionally kept intact: profiles, chart_of_accounts, expense_categories,
-- app_settings, fiscal_periods, bank_accounts, notification_preferences, and
-- suppliers.
--
-- Run before scripts/seed-demo-90-days.sql when you want a fresh demo story.

begin;

do $$
declare
  table_name text;
  demo_tables text[] := array[
    'internal_messages',
    'activity_logs',
    'delete_requests',
    'returns',
    'packing_items',
    'packing_sessions',
    'stock_movements',
    'product_condition_history',
    'customer_payment_allocations',
    'customer_payments',
    'sales_invoice_lines',
    'sales_invoices',
    'marketplace_imports',
    'vendor_payment_allocations',
    'vendor_payments',
    'purchase_invoices',
    'purchase_order_lines',
    'purchase_orders',
    'journal_lines',
    'journal_entries',
    'bank_transactions',
    'purchase_batches',
    'products',
    'customers'
  ];
begin
  foreach table_name in array demo_tables loop
    if to_regclass('public.' || table_name) is not null then
      execute format('truncate table public.%I restart identity cascade', table_name);
    end if;
  end loop;
end $$;

commit;
