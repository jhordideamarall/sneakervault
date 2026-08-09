-- Pre Order foundation.
--
-- Pre-order is demand/reservation, not physical stock. products.quantity remains
-- the source of truth for ready stock; stock_reservations records allocation.

DO $$ BEGIN
  CREATE TYPE public.pre_order_status AS ENUM (
    'review',
    'ready_from_stock',
    'needs_purchase',
    'purchase_created',
    'waiting_stock',
    'ready_to_pack',
    'packed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.pre_order_source AS ENUM ('manual', 'marketplace');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.stock_reservation_status AS ENUM (
    'active',
    'released',
    'consumed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.pre_orders (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source                public.pre_order_source NOT NULL DEFAULT 'manual',
  channel               text NOT NULL DEFAULT 'manual'
                          CHECK (channel IN ('manual','wa','shopee','tiktok','tokopedia','offline','website','other')),
  marketplace_order_id  text,
  customer_id           uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name         text NOT NULL CHECK (length(trim(customer_name)) > 0),
  order_date            date NOT NULL DEFAULT current_date,
  deadline_date         date,
  status                public.pre_order_status NOT NULL DEFAULT 'review',
  marketplace_status    text,
  notes                 text,
  created_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pre_orders_marketplace_order_required
    CHECK (source <> 'marketplace' OR marketplace_order_id IS NOT NULL),
  CONSTRAINT pre_orders_deadline_after_order
    CHECK (deadline_date IS NULL OR deadline_date >= order_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pre_orders_channel_order
  ON public.pre_orders(channel, marketplace_order_id)
  WHERE marketplace_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pre_orders_status_date
  ON public.pre_orders(status, order_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pre_orders_customer
  ON public.pre_orders(customer_name, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pre_order_lines (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pre_order_id    uuid NOT NULL REFERENCES public.pre_orders(id) ON DELETE CASCADE,
  product_id      uuid REFERENCES public.products(id) ON DELETE SET NULL,
  sku             text NOT NULL CHECK (length(trim(sku)) > 0),
  product_name    text NOT NULL CHECK (length(trim(product_name)) > 0),
  brand           text,
  model           text,
  color           text,
  size_label      text NOT NULL CHECK (length(trim(size_label)) > 0),
  size_value      numeric CHECK (size_value IS NULL OR size_value > 0),
  requested_qty   integer NOT NULL CHECK (requested_qty > 0),
  reserved_qty    integer NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  purchase_qty    integer NOT NULL DEFAULT 0 CHECK (purchase_qty >= 0),
  unit_price      numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  estimated_cost  numeric NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  status          public.pre_order_status NOT NULL DEFAULT 'review',
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pre_order_lines_qty_bounds
    CHECK (reserved_qty <= requested_qty AND purchase_qty <= requested_qty)
);

CREATE INDEX IF NOT EXISTS idx_pre_order_lines_order
  ON public.pre_order_lines(pre_order_id);
CREATE INDEX IF NOT EXISTS idx_pre_order_lines_product
  ON public.pre_order_lines(product_id)
  WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pre_order_lines_status
  ON public.pre_order_lines(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pre_order_lines_sku_size
  ON public.pre_order_lines(sku, size_label);

CREATE TABLE IF NOT EXISTS public.pre_order_procurement_links (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pre_order_line_id       uuid NOT NULL REFERENCES public.pre_order_lines(id) ON DELETE CASCADE,
  purchase_order_id       uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  purchase_order_line_id  uuid REFERENCES public.purchase_order_lines(id) ON DELETE SET NULL,
  quantity                integer NOT NULL CHECK (quantity > 0),
  created_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pre_order_procurement_pre_order_line
  ON public.pre_order_procurement_links(pre_order_line_id);
CREATE INDEX IF NOT EXISTS idx_pre_order_procurement_po
  ON public.pre_order_procurement_links(purchase_order_id);

CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pre_order_line_id  uuid NOT NULL REFERENCES public.pre_order_lines(id) ON DELETE CASCADE,
  product_id         uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity           integer NOT NULL CHECK (quantity > 0),
  status             public.stock_reservation_status NOT NULL DEFAULT 'active',
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  released_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_line
  ON public.stock_reservations(pre_order_line_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product_active
  ON public.stock_reservations(product_id, status)
  WHERE status = 'active';

ALTER TABLE public.pre_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_order_procurement_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pre_orders_select_internal" ON public.pre_orders;
CREATE POLICY "pre_orders_select_internal"
ON public.pre_orders FOR SELECT
TO authenticated
USING (public.has_any_role(ARRAY['owner','finance','admin_online','admin_gudang','shopkeeper']::public.user_role[]));

DROP POLICY IF EXISTS "pre_orders_insert_internal" ON public.pre_orders;
CREATE POLICY "pre_orders_insert_internal"
ON public.pre_orders FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role(ARRAY['owner','finance','admin_online']::public.user_role[]));

DROP POLICY IF EXISTS "pre_orders_update_internal" ON public.pre_orders;
CREATE POLICY "pre_orders_update_internal"
ON public.pre_orders FOR UPDATE
TO authenticated
USING (public.has_any_role(ARRAY['owner','finance','admin_online','admin_gudang']::public.user_role[]))
WITH CHECK (public.has_any_role(ARRAY['owner','finance','admin_online','admin_gudang']::public.user_role[]));

DROP POLICY IF EXISTS "pre_orders_delete_owner" ON public.pre_orders;
CREATE POLICY "pre_orders_delete_owner"
ON public.pre_orders FOR DELETE
TO authenticated
USING (public.has_role('owner'));

DROP POLICY IF EXISTS "pre_order_lines_select_internal" ON public.pre_order_lines;
CREATE POLICY "pre_order_lines_select_internal"
ON public.pre_order_lines FOR SELECT
TO authenticated
USING (public.has_any_role(ARRAY['owner','finance','admin_online','admin_gudang','shopkeeper']::public.user_role[]));

DROP POLICY IF EXISTS "pre_order_lines_insert_internal" ON public.pre_order_lines;
CREATE POLICY "pre_order_lines_insert_internal"
ON public.pre_order_lines FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role(ARRAY['owner','finance','admin_online']::public.user_role[]));

DROP POLICY IF EXISTS "pre_order_lines_update_internal" ON public.pre_order_lines;
CREATE POLICY "pre_order_lines_update_internal"
ON public.pre_order_lines FOR UPDATE
TO authenticated
USING (public.has_any_role(ARRAY['owner','finance','admin_online','admin_gudang']::public.user_role[]))
WITH CHECK (public.has_any_role(ARRAY['owner','finance','admin_online','admin_gudang']::public.user_role[]));

DROP POLICY IF EXISTS "pre_order_lines_delete_owner" ON public.pre_order_lines;
CREATE POLICY "pre_order_lines_delete_owner"
ON public.pre_order_lines FOR DELETE
TO authenticated
USING (public.has_role('owner'));

DROP POLICY IF EXISTS "pre_order_procurement_select_internal" ON public.pre_order_procurement_links;
CREATE POLICY "pre_order_procurement_select_internal"
ON public.pre_order_procurement_links FOR SELECT
TO authenticated
USING (public.has_any_role(ARRAY['owner','finance','admin_online','admin_gudang','shopkeeper']::public.user_role[]));

DROP POLICY IF EXISTS "pre_order_procurement_mutate_internal" ON public.pre_order_procurement_links;
CREATE POLICY "pre_order_procurement_mutate_internal"
ON public.pre_order_procurement_links FOR ALL
TO authenticated
USING (public.has_any_role(ARRAY['owner','finance','admin_online']::public.user_role[]))
WITH CHECK (public.has_any_role(ARRAY['owner','finance','admin_online']::public.user_role[]));

DROP POLICY IF EXISTS "stock_reservations_select_internal" ON public.stock_reservations;
CREATE POLICY "stock_reservations_select_internal"
ON public.stock_reservations FOR SELECT
TO authenticated
USING (public.has_any_role(ARRAY['owner','finance','admin_online','admin_gudang','shopkeeper']::public.user_role[]));

DROP POLICY IF EXISTS "stock_reservations_mutate_internal" ON public.stock_reservations;
CREATE POLICY "stock_reservations_mutate_internal"
ON public.stock_reservations FOR ALL
TO authenticated
USING (public.has_any_role(ARRAY['owner','finance','admin_online','admin_gudang']::public.user_role[]))
WITH CHECK (public.has_any_role(ARRAY['owner','finance','admin_online','admin_gudang']::public.user_role[]));

REVOKE ALL ON public.pre_orders FROM PUBLIC, anon;
REVOKE ALL ON public.pre_order_lines FROM PUBLIC, anon;
REVOKE ALL ON public.pre_order_procurement_links FROM PUBLIC, anon;
REVOKE ALL ON public.stock_reservations FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pre_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pre_order_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pre_order_procurement_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_reservations TO authenticated;

GRANT ALL ON public.pre_orders TO service_role;
GRANT ALL ON public.pre_order_lines TO service_role;
GRANT ALL ON public.pre_order_procurement_links TO service_role;
GRANT ALL ON public.stock_reservations TO service_role;

COMMENT ON TABLE public.pre_orders IS
  'Customer pre-order demand. Does not add or subtract physical inventory.';
COMMENT ON TABLE public.pre_order_lines IS
  'Line-level requested SKU/size demand. product_id may be null for manual/not-yet-created items.';
COMMENT ON TABLE public.stock_reservations IS
  'Ready-stock allocation for pre-order lines. This marks reservation only; products.quantity remains physical stock.';
