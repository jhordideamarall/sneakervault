-- SKU sebagai jangkar colorway; size = variant.
-- Realita: SKU marketplace (mis. "DQ0300 100", "IE7096") = kode colorway, BERULANG
-- antar ukuran. Sistem lama paksa sku unik per baris → import multi-size ke-skip
-- sebagai "duplikat". Fix: identitas produk = (sku, size_label).
--
-- Grouping variant & paginasi inventory pindah ke sku (lihat get_inventory_page).
-- Catatan: pencocokan marketplace by sku+size & lookup .eq(sku).maybeSingle() di
-- jalur marketplace/fallback dikerjakan di Fase B (jalur itu belum dipakai saat
-- seeding inventory). Tidak menghapus apa pun di sini.

-- 1) Ganti unik global sku -> unik (sku, size_label).
DROP INDEX IF EXISTS public.idx_products_sku;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_size
  ON public.products (sku, size_label);
-- index non-unik untuk lookup/grouping by sku (colorway).
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products (sku);

-- 2) get_inventory_page: paginasi & kelompokkan per SKU (colorway), bukan per model.
--    Satu "halaman" = N colorway; tiap colorway bawa semua ukurannya (variant).
CREATE OR REPLACE FUNCTION public.get_inventory_page(
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
          coalesce(p.sku, '') || ' ' ||
          coalesce(p.size_label, '')
        ) ILIKE '%' || n.q || '%'
      )
  ),
  sku_page AS (
    SELECT f.sku
    FROM filtered f
    GROUP BY f.sku
    ORDER BY min(f.brand), min(f.model), f.sku
    LIMIT greatest(coalesce(p_limit, 50), 1)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  ),
  summary AS (
    SELECT
      count(*)::bigint AS total_sku,
      count(DISTINCT f.sku)::bigint AS total_models,
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
  JOIN sku_page sp ON sp.sku = p.sku
  LEFT JOIN suppliers s ON s.id = p.default_supplier_id
  CROSS JOIN summary
  ORDER BY p.brand, p.model, p.sku, p.size;
$$;

GRANT EXECUTE ON FUNCTION public.get_inventory_page(text, integer, integer) TO authenticated;
