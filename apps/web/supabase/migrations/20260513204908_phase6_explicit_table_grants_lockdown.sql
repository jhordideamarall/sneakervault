-- Lockdown table grants ahead of Supabase Oct 30 2026 enforcement.
-- 
-- Strategy for Dewins.id (internal-only app):
-- - anon: NO access to any business table. Login is the only anon-facing flow.
-- - authenticated: full CRUD — RLS policies filter rows per user/role.
-- - service_role: full access for server-side admin operations.
-- 
-- Defense-in-depth: even if an RLS policy has a bug, anon can't query the table.

DO $$
DECLARE
  t TEXT;
  business_tables TEXT[] := ARRAY[
    'activity_logs','app_settings','bank_accounts','bank_transactions',
    'chart_of_accounts','customer_payment_allocations','customer_payments',
    'customers','delete_requests','fiscal_periods','internal_messages',
    'journal_entries','journal_lines','marketplace_imports','notification_preferences',
    'packing_items','packing_sessions','product_condition_history','products',
    'profiles','purchase_batches','purchase_invoices','purchase_order_lines',
    'purchase_orders','returns','sales_invoice_lines','sales_invoices',
    'stock_movements','suppliers','vendor_payment_allocations','vendor_payments'
  ];
BEGIN
  FOREACH t IN ARRAY business_tables LOOP
    -- Revoke from PUBLIC (the default grant that anon inherits)
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', t);
    -- Ensure authenticated has full CRUD (RLS handles row-level access)
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
    -- service_role retains all (server-side use only)
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- Make sure SECURITY DEFINER functions called by triggers still work.
-- (We don't revoke from postgres owner; triggers run as owner.)
