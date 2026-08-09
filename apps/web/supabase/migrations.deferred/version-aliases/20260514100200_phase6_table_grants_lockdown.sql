-- Phase 6 — Security: Explicit table grants lockdown.
--
-- Problem: All tables inherited PUBLIC default grant → anon role could attempt reads
--          on every table (RLS was the only defense layer).
-- Fix: Revoke from PUBLIC + anon on all 31 application tables.
--       Grant only authenticated for CRUD, service_role for ALL.
-- This makes defense-in-depth: even if an RLS policy has a bug, anon gets a 403.
--
-- Supabase enforcement date: 2026-10-30.
-- Applied proactively.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'profiles', 'suppliers', 'products', 'purchase_orders', 'purchase_order_items',
    'purchase_batches', 'purchase_invoices', 'purchase_invoice_items',
    'vendor_payments', 'vendor_payment_allocations',
    'sales_invoices', 'sales_invoice_items',
    'customer_payments', 'customer_payment_allocations',
    'bank_accounts', 'bank_transactions',
    'journal_entries', 'journal_lines', 'chart_of_accounts', 'fiscal_periods',
    'stock_movements', 'packing_sessions', 'packing_items',
    'returns', 'activity_logs', 'delete_requests',
    'app_settings', 'internal_messages', 'chat_attachments',
    'marketplace_imports', 'product_condition_history'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);
  END LOOP;
END;
$$;

-- Sequences: authenticated must be able to advance serial sequences
DO $$
DECLARE
  seq text;
BEGIN
  FOR seq IN
    SELECT sequence_name FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated', seq);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role', seq);
  END LOOP;
END;
$$;
