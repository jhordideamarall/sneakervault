-- ============================================================================
-- Phase 3 — Sales Cycle + Kas Bank
-- ============================================================================

CREATE TYPE bank_account_type AS ENUM ('cash','bank','ewallet','marketplace_balance');
CREATE TYPE bank_transaction_type AS ENUM ('debit','credit');
CREATE TYPE sales_invoice_status AS ENUM ('draft','issued','partial','paid','cancelled');
CREATE TYPE marketplace_type AS ENUM ('shopee','tiktok','tokopedia','lazada','other');
CREATE TYPE marketplace_import_status AS ENUM ('uploaded','parsed','confirmed','cancelled');

-- ─── Bank / Cash Accounts ───────────────────────────────────────────────────
CREATE TABLE bank_accounts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            text NOT NULL,
  type            bank_account_type NOT NULL,
  bank_name       text,
  account_number  text,
  account_holder  text,
  opening_balance numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'IDR',
  is_default      boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ba_type_idx ON bank_accounts (type) WHERE is_active = true;
CREATE TRIGGER ba_set_updated_at BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Now add FK from vendor_payments.bank_account_id
ALTER TABLE vendor_payments
  ADD CONSTRAINT vp_bank_account_fk
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;

-- ─── Bank Transactions (mutasi) ─────────────────────────────────────────────
CREATE TABLE bank_transactions (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_account_id      uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  transaction_date     date NOT NULL DEFAULT CURRENT_DATE,
  type                 bank_transaction_type NOT NULL,
  amount               numeric NOT NULL CHECK (amount > 0),
  balance_after        numeric,
  reference_no         text,
  description          text NOT NULL,
  related_entity_type  text,
  related_entity_id    uuid,
  is_reconciled        boolean NOT NULL DEFAULT false,
  reconciled_at        timestamptz,
  reconciled_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bt_account_idx ON bank_transactions (bank_account_id, transaction_date DESC);
CREATE INDEX bt_unreconciled_idx ON bank_transactions (bank_account_id) WHERE is_reconciled = false;
CREATE INDEX bt_entity_idx ON bank_transactions (related_entity_type, related_entity_id) WHERE related_entity_id IS NOT NULL;

-- ─── Sales Invoices ─────────────────────────────────────────────────────────
CREATE TABLE sales_invoices (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number  text NOT NULL UNIQUE,
  customer_id     uuid REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name   text NOT NULL,  -- snapshot for walk-in customers without record
  channel         customer_channel NOT NULL DEFAULT 'offline',
  invoice_date    date NOT NULL DEFAULT CURRENT_DATE,
  due_date        date,
  subtotal        numeric NOT NULL DEFAULT 0,
  discount        numeric NOT NULL DEFAULT 0 CHECK (discount >= 0),
  shipping        numeric NOT NULL DEFAULT 0 CHECK (shipping >= 0),
  marketplace_fee numeric NOT NULL DEFAULT 0 CHECK (marketplace_fee >= 0),
  tax             numeric NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total           numeric NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid_amount     numeric NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status          sales_invoice_status NOT NULL DEFAULT 'draft',
  marketplace_order_id text,
  notes           text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT si_paid_max CHECK (paid_amount <= total)
);

CREATE INDEX si_customer_idx ON sales_invoices (customer_id);
CREATE INDEX si_status_idx ON sales_invoices (status);
CREATE INDEX si_channel_idx ON sales_invoices (channel);
CREATE INDEX si_date_idx ON sales_invoices (invoice_date DESC);

CREATE TRIGGER si_set_updated_at BEFORE UPDATE ON sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE sales_invoice_lines (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      uuid NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  product_id      uuid REFERENCES products(id) ON DELETE SET NULL,
  product_label   text NOT NULL,  -- snapshot brand+model+size+color
  qty             integer NOT NULL CHECK (qty > 0),
  unit_price      numeric NOT NULL CHECK (unit_price >= 0),
  unit_cost       numeric NOT NULL DEFAULT 0,  -- HPP snapshot for COGS journal
  subtotal        numeric NOT NULL DEFAULT 0,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sil_invoice_idx ON sales_invoice_lines (invoice_id);
CREATE INDEX sil_product_idx ON sales_invoice_lines (product_id);

-- ─── Customer Payments ──────────────────────────────────────────────────────
CREATE TABLE customer_payments (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_number  text NOT NULL UNIQUE,
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name   text NOT NULL,
  payment_date    date NOT NULL DEFAULT CURRENT_DATE,
  amount          numeric NOT NULL CHECK (amount > 0),
  payment_method  payment_method NOT NULL,
  bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  reference_no    text,
  notes           text,
  attachment_url  text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cp_customer_idx ON customer_payments (customer_id);
CREATE INDEX cp_date_idx ON customer_payments (payment_date DESC);

CREATE TABLE customer_payment_allocations (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id      uuid NOT NULL REFERENCES customer_payments(id) ON DELETE CASCADE,
  invoice_id      uuid NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
  amount          numeric NOT NULL CHECK (amount > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, invoice_id)
);

CREATE INDEX cpa_payment_idx ON customer_payment_allocations (payment_id);
CREATE INDEX cpa_invoice_idx ON customer_payment_allocations (invoice_id);

-- ─── Marketplace Imports ────────────────────────────────────────────────────
CREATE TABLE marketplace_imports (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  marketplace     marketplace_type NOT NULL,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  raw_file_url    text,
  total_orders    integer NOT NULL DEFAULT 0,
  total_gmv       numeric NOT NULL DEFAULT 0,
  total_fee       numeric NOT NULL DEFAULT 0,
  total_net       numeric NOT NULL DEFAULT 0,
  status          marketplace_import_status NOT NULL DEFAULT 'uploaded',
  notes           text,
  uploaded_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  confirmed_at    timestamptz,
  confirmed_by    uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX mi_marketplace_idx ON marketplace_imports (marketplace, period_start DESC);

-- ─── Number generators ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_sales_invoice_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prefix text; next_seq int;
BEGIN
  prefix := 'INV-' || to_char(now(), 'YYMM') || '-';
  SELECT COALESCE(MAX(SUBSTRING(invoice_number FROM '\d+$')::int), 0) + 1
    INTO next_seq FROM sales_invoices WHERE invoice_number LIKE prefix || '%';
  RETURN prefix || LPAD(next_seq::text, 4, '0');
END; $$;

CREATE OR REPLACE FUNCTION public.generate_customer_payment_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prefix text; next_seq int;
BEGIN
  prefix := 'BM-' || to_char(now(), 'YYMM') || '-';
  SELECT COALESCE(MAX(SUBSTRING(payment_number FROM '\d+$')::int), 0) + 1
    INTO next_seq FROM customer_payments WHERE payment_number LIKE prefix || '%';
  RETURN prefix || LPAD(next_seq::text, 4, '0');
END; $$;

GRANT EXECUTE ON FUNCTION public.generate_sales_invoice_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_customer_payment_number() TO authenticated;

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_imports ENABLE ROW LEVEL SECURITY;

-- Bank: finance/owner full. Read for all authenticated when needed.
CREATE POLICY ba_select ON bank_accounts FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY ba_write ON bank_accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY ba_update ON bank_accounts FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY ba_delete ON bank_accounts FOR DELETE TO authenticated
  USING (public.has_role('owner'::user_role));

CREATE POLICY bt_select ON bank_transactions FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY bt_write ON bank_transactions FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY bt_update ON bank_transactions FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));

-- Sales invoices: finance/owner/admin_online (admin_online input order)
CREATE POLICY si_select ON sales_invoices FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[]));
CREATE POLICY si_write ON sales_invoices FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[]));
CREATE POLICY si_update ON sales_invoices FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[]));
CREATE POLICY si_delete ON sales_invoices FOR DELETE TO authenticated
  USING (public.has_role('owner'::user_role));

CREATE POLICY sil_select ON sales_invoice_lines FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[]));
CREATE POLICY sil_write ON sales_invoice_lines FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[]));
CREATE POLICY sil_update ON sales_invoice_lines FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[]));
CREATE POLICY sil_delete ON sales_invoice_lines FOR DELETE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[]));

CREATE POLICY cp_select ON customer_payments FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY cp_write ON customer_payments FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY cp_update ON customer_payments FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));

CREATE POLICY cpa_all ON customer_payment_allocations FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));

CREATE POLICY mi_select ON marketplace_imports FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[]));
CREATE POLICY mi_write ON marketplace_imports FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[]));
CREATE POLICY mi_update ON marketplace_imports FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance','admin_online']::user_role[]));
