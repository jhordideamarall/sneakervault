-- Phase 2 — Master Data Customer
-- Foundation untuk Sales Invoice (Phase 3) & Penerimaan Kas (Phase 3).

CREATE TYPE customer_channel AS ENUM (
  'wa',
  'shopee',
  'tiktok',
  'offline',
  'website',
  'mixed'
);

CREATE TABLE customers (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  contact_person  text,
  phone           text,
  email           text,
  address         text,
  channel         customer_channel NOT NULL DEFAULT 'wa',
  npwp            text,
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customers_name_trgm_idx ON customers USING gin (name gin_trgm_ops);
CREATE INDEX customers_phone_idx ON customers (phone) WHERE phone IS NOT NULL;
CREATE INDEX customers_active_idx ON customers (is_active) WHERE is_active = true;

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select_authenticated" ON customers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "customers_insert_authorized" ON customers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[])
  );

CREATE POLICY "customers_update_authorized" ON customers
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[])
  )
  WITH CHECK (
    public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[])
  );

CREATE POLICY "customers_delete_owner" ON customers
  FOR DELETE TO authenticated
  USING (public.has_role('owner'::user_role));

COMMENT ON TABLE customers IS 'Master data customer untuk Sales Invoice (Phase 3) & AR tracking';
COMMENT ON COLUMN customers.channel IS 'Channel utama customer; bukan eksklusif — tetap bisa transaksi di channel lain';
