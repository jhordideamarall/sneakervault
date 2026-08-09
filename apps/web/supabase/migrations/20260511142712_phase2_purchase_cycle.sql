-- ============================================================================
-- Phase 2 — Purchase Cycle (PO → Receive → Invoice → Payment)
-- ============================================================================

-- ─── Enums ──────────────────────────────────────────────────────────────────
CREATE TYPE po_status AS ENUM ('draft','approved','receiving','completed','cancelled');
CREATE TYPE purchase_invoice_status AS ENUM ('unpaid','partial','paid','cancelled');
CREATE TYPE payment_method AS ENUM ('cash','bank_transfer','marketplace','other');

-- ─── Purchase Orders (header) ───────────────────────────────────────────────
CREATE TABLE purchase_orders (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number       text NOT NULL UNIQUE,
  supplier_id     uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  order_date      date NOT NULL DEFAULT CURRENT_DATE,
  expected_date   date,
  status          po_status NOT NULL DEFAULT 'draft',
  subtotal        numeric NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax             numeric NOT NULL DEFAULT 0 CHECK (tax >= 0),
  shipping        numeric NOT NULL DEFAULT 0 CHECK (shipping >= 0),
  total           numeric NOT NULL DEFAULT 0 CHECK (total >= 0),
  notes           text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX po_supplier_idx ON purchase_orders (supplier_id);
CREATE INDEX po_status_idx ON purchase_orders (status);
CREATE INDEX po_date_idx ON purchase_orders (order_date DESC);

CREATE TRIGGER po_set_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Purchase Order Lines ───────────────────────────────────────────────────
CREATE TABLE purchase_order_lines (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id           uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  ordered_qty     integer NOT NULL CHECK (ordered_qty > 0),
  received_qty    integer NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  unit_cost       numeric NOT NULL CHECK (unit_cost >= 0),
  subtotal        numeric NOT NULL DEFAULT 0,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT po_line_received_max CHECK (received_qty <= ordered_qty)
);

CREATE INDEX pol_po_idx ON purchase_order_lines (po_id);
CREATE INDEX pol_product_idx ON purchase_order_lines (product_id);

-- ─── Purchase Invoices (faktur dari vendor) ────────────────────────────────
CREATE TABLE purchase_invoices (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number  text NOT NULL UNIQUE,
  supplier_id     uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  po_id           uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  invoice_date    date NOT NULL DEFAULT CURRENT_DATE,
  due_date        date,
  subtotal        numeric NOT NULL DEFAULT 0,
  tax             numeric NOT NULL DEFAULT 0,
  total           numeric NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid_amount     numeric NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status          purchase_invoice_status NOT NULL DEFAULT 'unpaid',
  notes           text,
  attachment_url  text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pi_paid_max CHECK (paid_amount <= total)
);

CREATE INDEX pi_supplier_idx ON purchase_invoices (supplier_id);
CREATE INDEX pi_status_idx ON purchase_invoices (status);
CREATE INDEX pi_due_idx ON purchase_invoices (due_date) WHERE status IN ('unpaid','partial');

CREATE TRIGGER pi_set_updated_at BEFORE UPDATE ON purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Vendor Payments ────────────────────────────────────────────────────────
CREATE TABLE vendor_payments (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_number  text NOT NULL UNIQUE,
  supplier_id     uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  payment_date    date NOT NULL DEFAULT CURRENT_DATE,
  amount          numeric NOT NULL CHECK (amount > 0),
  payment_method  payment_method NOT NULL,
  bank_account_id uuid,  -- FK akan di-add saat bank_accounts table dibuat (Phase 3)
  reference_no    text,
  notes           text,
  attachment_url  text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vp_supplier_idx ON vendor_payments (supplier_id);
CREATE INDEX vp_date_idx ON vendor_payments (payment_date DESC);

-- ─── Allocations: payment ↔ invoice (many-to-many) ──────────────────────────
CREATE TABLE vendor_payment_allocations (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id      uuid NOT NULL REFERENCES vendor_payments(id) ON DELETE CASCADE,
  invoice_id      uuid NOT NULL REFERENCES purchase_invoices(id) ON DELETE RESTRICT,
  amount          numeric NOT NULL CHECK (amount > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, invoice_id)
);

CREATE INDEX vpa_payment_idx ON vendor_payment_allocations (payment_id);
CREATE INDEX vpa_invoice_idx ON vendor_payment_allocations (invoice_id);

-- ─── PO number generator ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_po_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prefix text;
  next_seq int;
BEGIN
  prefix := 'PO-' || to_char(now(), 'YYMM') || '-';
  SELECT COALESCE(MAX(SUBSTRING(po_number FROM '\d+$')::int), 0) + 1
    INTO next_seq
    FROM purchase_orders
    WHERE po_number LIKE prefix || '%';
  RETURN prefix || LPAD(next_seq::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_purchase_invoice_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prefix text; next_seq int;
BEGIN
  prefix := 'FB-' || to_char(now(), 'YYMM') || '-';
  SELECT COALESCE(MAX(SUBSTRING(invoice_number FROM '\d+$')::int), 0) + 1
    INTO next_seq FROM purchase_invoices WHERE invoice_number LIKE prefix || '%';
  RETURN prefix || LPAD(next_seq::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_vendor_payment_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prefix text; next_seq int;
BEGIN
  prefix := 'BV-' || to_char(now(), 'YYMM') || '-';
  SELECT COALESCE(MAX(SUBSTRING(payment_number FROM '\d+$')::int), 0) + 1
    INTO next_seq FROM vendor_payments WHERE payment_number LIKE prefix || '%';
  RETURN prefix || LPAD(next_seq::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_po_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_purchase_invoice_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_vendor_payment_number() TO authenticated;

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payment_allocations ENABLE ROW LEVEL SECURITY;

-- Finance & owner: full CRUD. Gudang: read PO + lines (for receive flow).
CREATE POLICY po_select ON purchase_orders FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance','admin_gudang']::user_role[]));
CREATE POLICY po_write_finance ON purchase_orders FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY po_update_finance ON purchase_orders FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY po_delete_owner ON purchase_orders FOR DELETE TO authenticated
  USING (public.has_role('owner'::user_role));

CREATE POLICY pol_select ON purchase_order_lines FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance','admin_gudang']::user_role[]));
CREATE POLICY pol_write ON purchase_order_lines FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY pol_update ON purchase_order_lines FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance','admin_gudang']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance','admin_gudang']::user_role[]));
CREATE POLICY pol_delete ON purchase_order_lines FOR DELETE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]));

CREATE POLICY pi_select ON purchase_invoices FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY pi_write ON purchase_invoices FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY pi_update ON purchase_invoices FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY pi_delete ON purchase_invoices FOR DELETE TO authenticated
  USING (public.has_role('owner'::user_role));

CREATE POLICY vp_select ON vendor_payments FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY vp_write ON vendor_payments FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY vp_update ON vendor_payments FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY vp_delete ON vendor_payments FOR DELETE TO authenticated
  USING (public.has_role('owner'::user_role));

CREATE POLICY vpa_select ON vendor_payment_allocations FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY vpa_write ON vendor_payment_allocations FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY vpa_update ON vendor_payment_allocations FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
CREATE POLICY vpa_delete ON vendor_payment_allocations FOR DELETE TO authenticated
  USING (public.has_any_role(ARRAY['owner','finance']::user_role[]));
