-- Add the tables that drive sidebar activity signals to the realtime
-- publication so the dots refresh live (useRealtimeRefresh -> router.refresh).
-- Idempotent: only adds a table if it is not already a publication member.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'stock_opname_sessions',
    'purchase_orders',
    'purchase_invoices',
    'sales_invoices',
    'bank_transactions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
