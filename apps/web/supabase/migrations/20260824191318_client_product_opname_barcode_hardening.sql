-- Client review follow-up:
-- - product barcode is immutable after INSERT;
-- - shared SKU fields and selected-variant fields update atomically;
-- - one stock-opname scan persists an atomic +1 without changing stock.

CREATE OR REPLACE FUNCTION private.prevent_product_barcode_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.barcode IS DISTINCT FROM OLD.barcode THEN
    RAISE EXCEPTION 'Barcode produk tidak dapat diubah setelah produk dibuat';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_barcode_immutable ON public.products;
CREATE TRIGGER trg_products_barcode_immutable
BEFORE UPDATE OF barcode ON public.products
FOR EACH ROW
EXECUTE FUNCTION private.prevent_product_barcode_update();

CREATE OR REPLACE FUNCTION private.update_product_variant_and_sku_shared_core(
  p_product_id uuid,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_invalid_key text;
  v_can_identity boolean;
  v_can_financial boolean;
  v_has_shared_patch boolean;
  v_updated_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Patch produk harus berupa object';
  END IF;

  SELECT key
  INTO v_invalid_key
  FROM jsonb_object_keys(p_patch) AS keys(key)
  WHERE NOT (
    key = ANY (ARRAY[
      'brand', 'model', 'sku', 'size_label', 'color', 'image_url', 'hpp',
      'sell_price', 'price_offline', 'price_website', 'price_shopee',
      'price_tiktok', 'price_tokopedia', 'default_supplier_id'
    ]::text[])
  )
  LIMIT 1;
  IF v_invalid_key IS NOT NULL THEN
    RAISE EXCEPTION 'Field produk tidak diizinkan: %', v_invalid_key;
  END IF;

  v_can_identity := public.has_any_role(
    ARRAY['owner', 'admin_gudang']::public.user_role[]
  );
  v_can_financial := public.has_any_role(
    ARRAY['owner', 'finance']::public.user_role[]
  );

  IF NOT v_can_identity AND NOT v_can_financial THEN
    RAISE EXCEPTION 'Role tidak diizinkan mengubah produk';
  END IF;
  IF NOT v_can_identity AND (
    p_patch ? 'brand' OR p_patch ? 'model' OR p_patch ? 'sku'
    OR p_patch ? 'size_label' OR p_patch ? 'color' OR p_patch ? 'image_url'
  ) THEN
    RAISE EXCEPTION 'Role tidak diizinkan mengubah identitas produk';
  END IF;
  IF NOT v_can_financial AND (
    p_patch ? 'hpp' OR p_patch ? 'sell_price' OR p_patch ? 'price_offline'
    OR p_patch ? 'price_website' OR p_patch ? 'price_shopee'
    OR p_patch ? 'price_tiktok' OR p_patch ? 'price_tokopedia'
    OR p_patch ? 'default_supplier_id'
  ) THEN
    RAISE EXCEPTION 'Role tidak diizinkan mengubah HPP atau harga jual';
  END IF;

  SELECT p.*
  INTO v_product
  FROM public.products AS p
  WHERE p.id = p_product_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produk tidak ditemukan';
  END IF;

  v_has_shared_patch :=
    p_patch ? 'brand' OR p_patch ? 'model' OR p_patch ? 'sku'
    OR p_patch ? 'color' OR p_patch ? 'image_url' OR p_patch ? 'hpp';

  UPDATE public.products AS p
  SET brand = CASE
        WHEN p_patch ? 'brand' THEN btrim(p_patch->>'brand')
        ELSE p.brand
      END,
      model = CASE
        WHEN p_patch ? 'model' THEN btrim(p_patch->>'model')
        ELSE p.model
      END,
      sku = CASE
        WHEN p_patch ? 'sku' THEN btrim(p_patch->>'sku')
        ELSE p.sku
      END,
      color = CASE
        WHEN p_patch ? 'color' THEN NULLIF(btrim(p_patch->>'color'), '')
        ELSE p.color
      END,
      image_url = CASE
        WHEN p_patch ? 'image_url' THEN NULLIF(btrim(p_patch->>'image_url'), '')
        ELSE p.image_url
      END,
      hpp = CASE
        WHEN p_patch ? 'hpp' THEN (p_patch->>'hpp')::numeric
        ELSE p.hpp
      END,
      size_label = CASE
        WHEN p.id = p_product_id AND p_patch ? 'size_label'
          THEN btrim(p_patch->>'size_label')
        ELSE p.size_label
      END,
      sell_price = CASE
        WHEN p.id = p_product_id AND p_patch ? 'sell_price'
          THEN (p_patch->>'sell_price')::numeric
        ELSE p.sell_price
      END,
      price_offline = CASE
        WHEN p.id = p_product_id AND p_patch ? 'price_offline'
          THEN (p_patch->>'price_offline')::numeric
        ELSE p.price_offline
      END,
      price_website = CASE
        WHEN p.id = p_product_id AND p_patch ? 'price_website'
          THEN CASE
            WHEN p_patch->'price_website' = 'null'::jsonb THEN NULL
            ELSE (p_patch->>'price_website')::numeric
          END
        ELSE p.price_website
      END,
      price_shopee = CASE
        WHEN p.id = p_product_id AND p_patch ? 'price_shopee'
          THEN CASE
            WHEN p_patch->'price_shopee' = 'null'::jsonb THEN NULL
            ELSE (p_patch->>'price_shopee')::numeric
          END
        ELSE p.price_shopee
      END,
      price_tiktok = CASE
        WHEN p.id = p_product_id AND p_patch ? 'price_tiktok'
          THEN CASE
            WHEN p_patch->'price_tiktok' = 'null'::jsonb THEN NULL
            ELSE (p_patch->>'price_tiktok')::numeric
          END
        ELSE p.price_tiktok
      END,
      price_tokopedia = CASE
        WHEN p.id = p_product_id AND p_patch ? 'price_tokopedia'
          THEN CASE
            WHEN p_patch->'price_tokopedia' = 'null'::jsonb THEN NULL
            ELSE (p_patch->>'price_tokopedia')::numeric
          END
        ELSE p.price_tokopedia
      END,
      default_supplier_id = CASE
        WHEN p.id = p_product_id AND p_patch ? 'default_supplier_id'
          THEN CASE
            WHEN p_patch->'default_supplier_id' = 'null'::jsonb THEN NULL
            ELSE (p_patch->>'default_supplier_id')::uuid
          END
        ELSE p.default_supplier_id
      END,
      updated_at = now()
  WHERE p.id = p_product_id
     OR (v_has_shared_patch AND p.sku = v_product.sku);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'original_sku', v_product.sku,
    'sku', COALESCE(NULLIF(btrim(p_patch->>'sku'), ''), v_product.sku),
    'updated_variants', v_updated_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_product_variant_and_sku_shared(
  p_product_id uuid,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.update_product_variant_and_sku_shared_core(p_product_id, p_patch);
$$;

CREATE OR REPLACE FUNCTION private.increment_stock_opname_count_core(
  p_session_id uuid,
  p_barcode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status public.stock_opname_status;
  v_line_id uuid;
  v_product_label text;
  v_physical_qty integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;
  IF NOT public.has_any_role(
    ARRAY['owner', 'admin_gudang', 'finance']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Role tidak diizinkan menghitung stock opname';
  END IF;
  IF NULLIF(btrim(p_barcode), '') IS NULL THEN
    RAISE EXCEPTION 'Barcode wajib diisi';
  END IF;

  SELECT s.status
  INTO v_status
  FROM public.stock_opname_sessions AS s
  WHERE s.id = p_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi stock opname tidak ditemukan';
  END IF;
  IF v_status NOT IN (
    'open'::public.stock_opname_status,
    'counting'::public.stock_opname_status
  ) THEN
    RAISE EXCEPTION 'Sesi stock opname sudah tidak bisa dihitung';
  END IF;

  SELECT line.id,
         product.brand || ' ' || product.model || ' - Size ' || product.size_label
  INTO v_line_id, v_product_label
  FROM public.stock_opname_lines AS line
  JOIN public.products AS product ON product.id = line.product_id
  WHERE line.session_id = p_session_id
    AND product.barcode = btrim(p_barcode)
  FOR UPDATE OF line;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barcode % tidak ada di sesi ini', btrim(p_barcode);
  END IF;

  UPDATE public.stock_opname_lines
  SET physical_qty = COALESCE(physical_qty, 0) + 1,
      counted_by = v_uid,
      counted_at = now(),
      updated_at = now()
  WHERE id = v_line_id
  RETURNING physical_qty INTO v_physical_qty;

  UPDATE public.stock_opname_sessions
  SET status = 'counting'::public.stock_opname_status,
      updated_at = now()
  WHERE id = p_session_id
    AND status = 'open'::public.stock_opname_status;

  RETURN jsonb_build_object(
    'line_id', v_line_id,
    'physical_qty', v_physical_qty,
    'product_label', v_product_label,
    'barcode', btrim(p_barcode)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_stock_opname_count(
  p_session_id uuid,
  p_barcode text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.increment_stock_opname_count_core(p_session_id, p_barcode);
$$;

REVOKE ALL ON FUNCTION private.update_product_variant_and_sku_shared_core(uuid, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.increment_stock_opname_count_core(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.update_product_variant_and_sku_shared_core(uuid, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.increment_stock_opname_count_core(uuid, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.update_product_variant_and_sku_shared(uuid, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_stock_opname_count(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_product_variant_and_sku_shared(uuid, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_stock_opname_count(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.update_product_variant_and_sku_shared(uuid, jsonb) IS
  'Atomically syncs SKU-shared product fields while changing size/prices only on the selected variant.';
COMMENT ON FUNCTION public.increment_stock_opname_count(uuid, text) IS
  'Persists one physical barcode scan as +1 for a compare-only stock opname session.';
