CREATE OR REPLACE FUNCTION public.parse_size_to_numeric(p_label text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  s    text := btrim(coalesce(p_label, ''));
  frac text;
  v    numeric;
BEGIN
  IF s = '' THEN
    RETURN 0;
  END IF;
  s := replace(s, ',', '.');
  IF s ~ '^[0-9]+ +[0-9]+/[0-9]+$' THEN
    frac := split_part(s, ' ', 2);
    RETURN split_part(s, ' ', 1)::numeric
         + (split_part(frac, '/', 1)::numeric / nullif(split_part(frac, '/', 2)::numeric, 0));
  END IF;
  IF s ~ '^[0-9]+/[0-9]+$' THEN
    RETURN split_part(s, '/', 1)::numeric / nullif(split_part(s, '/', 2)::numeric, 0);
  END IF;
  v := nullif(substring(s from '^[0-9]+(\.[0-9]+)?'), '')::numeric;
  RETURN coalesce(v, 0);
END;
$$;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS size_label text;

UPDATE public.products
SET size_label = btrim(to_char(size, 'FM999999990.######'))
WHERE size_label IS NULL;

CREATE OR REPLACE FUNCTION public.products_sync_size()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.size_label IS NOT NULL AND btrim(NEW.size_label) <> '' THEN
    NEW.size := public.parse_size_to_numeric(NEW.size_label);
  ELSIF NEW.size IS NOT NULL THEN
    NEW.size_label := btrim(to_char(NEW.size, 'FM999999990.######'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_sync_size ON public.products;
CREATE TRIGGER trg_products_sync_size
  BEFORE INSERT OR UPDATE OF size, size_label ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_sync_size();

ALTER TABLE public.products ALTER COLUMN size_label SET NOT NULL;

DROP FUNCTION IF EXISTS public.get_inventory_page(text, integer, integer);

CREATE FUNCTION public.get_inventory_page(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, brand text, model text, sku text,
  size numeric, size_label text, color text, barcode text,
  quantity integer, hpp numeric, sell_price numeric, price_offline numeric,
  image_url text, condition product_condition, defect_reason text, is_active boolean,
  created_at timestamptz, first_inbound_at timestamptz, supplier_name text,
  total_sku bigint, total_models bigint, total_qty bigint,
  normal_qty bigint, defect_qty bigint, dormant_qty bigint
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
    p.id, p.brand, p.model, p.sku,
    p.size, p.size_label, p.color, p.barcode,
    p.quantity, p.hpp, p.sell_price, p.price_offline,
    p.image_url, p.condition, p.defect_reason, p.is_active,
    p.created_at, p.first_inbound_at, s.name AS supplier_name,
    summary.total_sku, summary.total_models, summary.total_qty,
    summary.normal_qty, summary.defect_qty, summary.dormant_qty
  FROM filtered p
  JOIN model_page mp ON mp.brand = p.brand AND mp.model = p.model
  LEFT JOIN suppliers s ON s.id = p.default_supplier_id
  CROSS JOIN summary
  ORDER BY p.brand, p.model, p.size;
$$;

GRANT EXECUTE ON FUNCTION public.get_inventory_page(text, integer, integer) TO authenticated;
