ALTER TABLE products
  ADD COLUMN IF NOT EXISTS price_offline numeric NOT NULL DEFAULT 0 CHECK (price_offline >= 0);

UPDATE products SET price_offline = sell_price WHERE price_offline = 0 AND sell_price > 0;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS condition product_condition NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS defect_reason text,
  ADD COLUMN IF NOT EXISTS condition_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS condition_updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_condition ON products(condition) WHERE condition <> 'normal';

CREATE TABLE IF NOT EXISTS product_condition_history (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  previous_condition  product_condition,
  new_condition       product_condition NOT NULL,
  reason              text,
  changed_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_condition_history_product
  ON product_condition_history(product_id, changed_at DESC);

ALTER TABLE product_condition_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_condition_history_select_authenticated" ON product_condition_history;
CREATE POLICY "product_condition_history_select_authenticated"
  ON product_condition_history FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "product_condition_history_insert_gudang_owner" ON product_condition_history;
CREATE POLICY "product_condition_history_insert_gudang_owner"
  ON product_condition_history FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','admin_gudang']::user_role[]));

CREATE OR REPLACE FUNCTION public.recalculate_hpp_by_sku(
  p_product_id    uuid,
  p_new_qty       integer,
  p_new_unit_cost numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_qty integer;
  old_hpp     numeric;
  new_hpp     numeric;
BEGIN
  IF p_new_qty <= 0 THEN RAISE EXCEPTION 'p_new_qty must be positive'; END IF;
  IF p_new_unit_cost < 0 THEN RAISE EXCEPTION 'p_new_unit_cost cannot be negative'; END IF;
  SELECT quantity, hpp INTO current_qty, old_hpp FROM products WHERE id = p_product_id;
  IF current_qty IS NULL THEN RAISE EXCEPTION 'product % not found', p_product_id; END IF;
  IF current_qty <= 0 THEN RETURN; END IF;
  new_hpp := (((current_qty - p_new_qty) * old_hpp) + (p_new_qty * p_new_unit_cost)) / current_qty;
  UPDATE products SET hpp = new_hpp, updated_at = now() WHERE id = p_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_hpp_by_sku(uuid, integer, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.recalculate_hpp_by_model(
  p_brand text, p_model text, p_new_qty integer, p_new_unit_cost numeric
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RAISE WARNING 'recalculate_hpp_by_model is deprecated. Migrate to recalculate_hpp_by_sku.';
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_search_trgm
  ON products USING gin (
    (coalesce(brand, '') || ' ' || coalesce(model, '') || ' ' || coalesce(color, '') || ' ' || coalesce(sku, ''))
    gin_trgm_ops
  );

CREATE OR REPLACE FUNCTION public.search_products_fuzzy(
  p_query text, p_limit integer DEFAULT 50, p_threshold real DEFAULT 0.2
)
RETURNS TABLE (
  id uuid, brand text, model text, sku text, size numeric, color text,
  barcode text, quantity integer, hpp numeric, sell_price numeric,
  price_offline numeric, image_url text, condition product_condition, similarity real
)
LANGUAGE sql SECURITY INVOKER STABLE
AS $$
  SELECT p.id, p.brand, p.model, p.sku, p.size, p.color, p.barcode,
    p.quantity, p.hpp, p.sell_price, p.price_offline, p.image_url, p.condition,
    similarity(coalesce(p.brand,'')||' '||coalesce(p.model,'')||' '||coalesce(p.color,'')||' '||coalesce(p.sku,''), p_query) AS similarity
  FROM products p
  WHERE p.is_active = true
    AND (p.barcode ILIKE '%'||p_query||'%'
      OR similarity(coalesce(p.brand,'')||' '||coalesce(p.model,'')||' '||coalesce(p.color,'')||' '||coalesce(p.sku,''), p_query) > p_threshold)
  ORDER BY (p.barcode ILIKE '%'||p_query||'%') DESC, similarity DESC, p.brand, p.model, p.size
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_products_fuzzy(text, integer, real) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_product_condition(
  p_product_id uuid, p_new_condition product_condition, p_reason text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_prev product_condition; v_user uuid := auth.uid(); v_allowed boolean;
BEGIN
  SELECT public.has_any_role(ARRAY['owner','admin_gudang']::user_role[]) INTO v_allowed;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Only owner or admin_gudang may change product condition'; END IF;
  IF p_new_condition <> 'normal' AND (p_reason IS NULL OR length(trim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'reason required when setting non-normal condition';
  END IF;
  SELECT condition INTO v_prev FROM products WHERE id = p_product_id;
  IF v_prev IS NULL THEN RAISE EXCEPTION 'product % not found', p_product_id; END IF;
  IF v_prev = p_new_condition THEN RETURN; END IF;
  UPDATE products SET condition = p_new_condition,
    defect_reason = CASE WHEN p_new_condition = 'normal' THEN NULL ELSE p_reason END,
    condition_updated_at = now(), condition_updated_by = v_user, updated_at = now()
   WHERE id = p_product_id;
  INSERT INTO product_condition_history (product_id, previous_condition, new_condition, reason, changed_by)
  VALUES (p_product_id, v_prev, p_new_condition, p_reason, v_user);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_product_condition(uuid, product_condition, text) TO authenticated;
