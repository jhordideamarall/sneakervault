-- Inventory listing performance:
-- - paginates by distinct brand/model in Postgres
-- - returns only variants for models on the requested page
-- - returns summary counters from the same filtered set
--
-- SECURITY INVOKER keeps the same RLS behavior as direct products/suppliers
-- reads from the app.

CREATE OR REPLACE FUNCTION public.get_inventory_page(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  brand text,
  model text,
  sku text,
  size numeric,
  color text,
  barcode text,
  quantity integer,
  hpp numeric,
  sell_price numeric,
  price_offline numeric,
  image_url text,
  condition product_condition,
  defect_reason text,
  is_active boolean,
  created_at timestamptz,
  first_inbound_at timestamptz,
  supplier_name text,
  total_sku bigint,
  total_models bigint,
  total_qty bigint,
  normal_qty bigint,
  defect_qty bigint,
  dormant_qty bigint
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH normalized AS (
    SELECT nullif(trim(coalesce(p_search, '')), '') AS q
  ),
  filtered AS (
    SELECT p.*
    FROM products p
    CROSS JOIN normalized n
    WHERE p.is_active = true
      AND (
        n.q IS NULL
        OR p.barcode ILIKE '%' || n.q || '%'
        OR (
          coalesce(p.brand, '') || ' ' ||
          coalesce(p.model, '') || ' ' ||
          coalesce(p.color, '') || ' ' ||
          coalesce(p.sku, '')
        ) ILIKE '%' || n.q || '%'
      )
  ),
  model_page AS (
    SELECT f.brand, f.model
    FROM filtered f
    GROUP BY f.brand, f.model
    ORDER BY f.brand, f.model
    LIMIT greatest(coalesce(p_limit, 50), 1)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  ),
  summary AS (
    SELECT
      count(*)::bigint AS total_sku,
      count(DISTINCT (f.brand, f.model))::bigint AS total_models,
      coalesce(sum(f.quantity), 0)::bigint AS total_qty,
      coalesce(sum(f.quantity) FILTER (WHERE f.condition = 'normal'), 0)::bigint AS normal_qty,
      coalesce(sum(f.quantity) FILTER (WHERE f.condition = 'defect'), 0)::bigint AS defect_qty,
      coalesce(sum(f.quantity) FILTER (WHERE f.condition = 'dormant'), 0)::bigint AS dormant_qty
    FROM filtered f
  )
  SELECT
    p.id,
    p.brand,
    p.model,
    p.sku,
    p.size,
    p.color,
    p.barcode,
    p.quantity,
    p.hpp,
    p.sell_price,
    p.price_offline,
    p.image_url,
    p.condition,
    p.defect_reason,
    p.is_active,
    p.created_at,
    p.first_inbound_at,
    s.name AS supplier_name,
    summary.total_sku,
    summary.total_models,
    summary.total_qty,
    summary.normal_qty,
    summary.defect_qty,
    summary.dormant_qty
  FROM filtered p
  JOIN model_page mp
    ON mp.brand = p.brand
   AND mp.model = p.model
  LEFT JOIN suppliers s
    ON s.id = p.default_supplier_id
  CROSS JOIN summary
  ORDER BY p.brand, p.model, p.size;
$$;

GRANT EXECUTE ON FUNCTION public.get_inventory_page(text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_inventory_summary(p_search text DEFAULT NULL)
RETURNS TABLE (
  total_sku bigint,
  total_models bigint,
  total_qty bigint,
  normal_qty bigint,
  defect_qty bigint,
  dormant_qty bigint
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH normalized AS (
    SELECT nullif(trim(coalesce(p_search, '')), '') AS q
  ),
  filtered AS (
    SELECT p.brand, p.model, p.quantity, p.condition
    FROM products p
    CROSS JOIN normalized n
    WHERE p.is_active = true
      AND (
        n.q IS NULL
        OR p.barcode ILIKE '%' || n.q || '%'
        OR (
          coalesce(p.brand, '') || ' ' ||
          coalesce(p.model, '') || ' ' ||
          coalesce(p.color, '') || ' ' ||
          coalesce(p.sku, '')
        ) ILIKE '%' || n.q || '%'
      )
  )
  SELECT
    count(*)::bigint AS total_sku,
    count(DISTINCT (brand, model))::bigint AS total_models,
    coalesce(sum(quantity), 0)::bigint AS total_qty,
    coalesce(sum(quantity) FILTER (WHERE condition = 'normal'), 0)::bigint AS normal_qty,
    coalesce(sum(quantity) FILTER (WHERE condition = 'defect'), 0)::bigint AS defect_qty,
    coalesce(sum(quantity) FILTER (WHERE condition = 'dormant'), 0)::bigint AS dormant_qty
  FROM filtered;
$$;

GRANT EXECUTE ON FUNCTION public.get_inventory_summary(text) TO authenticated;
