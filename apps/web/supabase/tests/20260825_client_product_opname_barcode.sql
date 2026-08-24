-- Regression coverage for the client-review product, barcode, and stock-opname
-- changes. Run only on a disposable/test database after applying
-- 20260824191318_client_product_opname_barcode_hardening.sql.
-- Every fixture is rolled back. Authentication uses the transaction-local
-- request.jwt.claim.sub setting read by Supabase's built-in auth.uid().

BEGIN;

DO $test$
DECLARE
  v_user_id uuid;
  v_product_40 uuid;
  v_product_41 uuid;
  v_product_42 uuid;
  v_session_id uuid;
  v_prefix text := 'CLIENT-MINOR-' || substr(gen_random_uuid()::text, 1, 8);
  v_result jsonb;
  v_count integer;
  v_qty integer;
  v_blocked boolean := false;
BEGIN
  SELECT profile.id
  INTO v_user_id
  FROM public.profiles AS profile
  WHERE profile.is_active
    AND 'owner'::public.user_role = ANY(profile.roles)
  ORDER BY profile.created_at
  LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Regression test requires one active owner profile';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  -- One SQL statement mirrors the app batch insert: two size variants share
  -- product data but keep independent barcodes and channel prices.
  INSERT INTO public.products(
    brand, model, sku, size, size_label, color, barcode, quantity, hpp,
    sell_price, price_offline, price_website, price_shopee,
    price_tiktok, price_tokopedia, image_url
  )
  VALUES
    (
      'Test', 'Client Batch', v_prefix, 40, '40', 'White', v_prefix || '-40',
      3, 100, 200, 190, 180, 210, 205, 215, 'https://example.invalid/old.jpg'
    ),
    (
      'Test', 'Client Batch', v_prefix, 41, '41', 'White', v_prefix || '-41',
      4, 100, 250, 240, 230, 260, 255, 265, 'https://example.invalid/old.jpg'
    );

  SELECT id INTO v_product_40
  FROM public.products WHERE sku = v_prefix AND size_label = '40';
  SELECT id INTO v_product_41
  FROM public.products WHERE sku = v_prefix AND size_label = '41';

  -- A duplicate barcode in the second row must roll back the whole statement,
  -- including the otherwise-valid first row.
  BEGIN
    INSERT INTO public.products(
      brand, model, sku, size, size_label, color, barcode, hpp, sell_price, price_offline
    )
    VALUES
      ('Test', 'Atomic Abort', v_prefix, 42, '42', 'White', v_prefix || '-42', 100, 200, 190),
      ('Test', 'Atomic Abort', v_prefix, 43, '43', 'White', v_prefix || '-40', 100, 200, 190);
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  SELECT count(*) INTO v_count
  FROM public.products
  WHERE sku = v_prefix AND size_label IN ('42', '43');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Batch insert was partial; expected 0 rows, got %', v_count;
  END IF;

  SELECT public.update_product_variant_and_sku_shared(
    v_product_40,
    jsonb_build_object(
      'brand', 'Updated Brand',
      'model', 'Updated Model',
      'sku', v_prefix || '-UPDATED',
      'color', 'Black',
      'image_url', 'https://example.invalid/new.jpg',
      'hpp', 150,
      'size_label', '40.5',
      'sell_price', 300,
      'price_offline', 290,
      'price_website', 280,
      'price_shopee', 310,
      'price_tiktok', 305,
      'price_tokopedia', 315
    )
  ) INTO v_result;

  IF COALESCE((v_result->>'updated_variants')::integer, 0) <> 2 THEN
    RAISE EXCEPTION 'Expected two synced variants, got %', v_result;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.products
  WHERE id IN (v_product_40, v_product_41)
    AND brand = 'Updated Brand'
    AND model = 'Updated Model'
    AND sku = v_prefix || '-UPDATED'
    AND color = 'Black'
    AND image_url = 'https://example.invalid/new.jpg'
    AND hpp = 150;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Shared product fields were not synced to both variants';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.products
  WHERE id = v_product_40
    AND size_label = '40.5'
    AND sell_price = 300
    AND price_offline = 290
    AND price_website = 280
    AND price_shopee = 310
    AND price_tiktok = 305
    AND price_tokopedia = 315;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Selected variant fields were not updated';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.products
  WHERE id = v_product_41
    AND size_label = '41'
    AND sell_price = 250
    AND price_offline = 240
    AND price_website = 230
    AND price_shopee = 260
    AND price_tiktok = 255
    AND price_tokopedia = 265;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Sibling variant size/prices changed unexpectedly';
  END IF;

  -- "Tambah size" dari modal edit menyalin detail bersama/HPP dari variant
  -- sumber dan hanya menerima identitas + harga untuk variant baru.
  INSERT INTO public.products(
    brand, model, sku, color, image_url, hpp, default_supplier_id,
    size_label, barcode, sell_price, price_offline, price_website,
    price_shopee, price_tiktok, price_tokopedia, quantity, is_active
  )
  SELECT
    source.brand, source.model, source.sku, source.color, source.image_url,
    source.hpp, source.default_supplier_id, '42', v_prefix || '-42',
    320, 310, 320, 325, 330, 335, 0, true
  FROM public.products AS source
  WHERE source.id = v_product_40
  RETURNING id INTO v_product_42;

  SELECT count(*) INTO v_count
  FROM public.products
  WHERE id = v_product_42
    AND brand = 'Updated Brand'
    AND model = 'Updated Model'
    AND sku = v_prefix || '-UPDATED'
    AND color = 'Black'
    AND hpp = 150
    AND size_label = '42'
    AND barcode = v_prefix || '-42'
    AND sell_price = 320
    AND price_offline = 310
    AND price_website = 320
    AND price_shopee = 325
    AND price_tiktok = 330
    AND price_tokopedia = 335;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Tambah size did not inherit shared fields or keep variant prices';
  END IF;

  BEGIN
    UPDATE public.products
    SET barcode = v_prefix || '-REPLACED'
    WHERE id = v_product_40;
  EXCEPTION
    WHEN others THEN
      v_blocked := SQLERRM LIKE '%tidak dapat diubah%';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'Barcode update was not blocked by the immutable trigger';
  END IF;

  INSERT INTO public.stock_opname_sessions(
    opname_number, opname_date, status, scope, started_by
  )
  VALUES (v_prefix || '-OPNAME', current_date, 'open', 'all', v_user_id)
  RETURNING id INTO v_session_id;

  INSERT INTO public.stock_opname_lines(
    session_id, product_id, system_qty, physical_qty, unit_cost
  )
  VALUES
    (v_session_id, v_product_40, 3, NULL, 150),
    (v_session_id, v_product_41, 4, NULL, 150);

  SELECT public.increment_stock_opname_count(v_session_id, v_prefix || '-40')
  INTO v_result;
  SELECT public.increment_stock_opname_count(v_session_id, v_prefix || '-40')
  INTO v_result;

  SELECT physical_qty INTO v_qty
  FROM public.stock_opname_lines
  WHERE session_id = v_session_id AND product_id = v_product_40;
  IF v_qty <> 2 THEN
    RAISE EXCEPTION 'Two scans produced physical_qty %, expected 2', v_qty;
  END IF;

  SELECT quantity INTO v_qty FROM public.products WHERE id = v_product_40;
  IF v_qty <> 3 THEN
    RAISE EXCEPTION 'Compare-only opname changed product stock to %', v_qty;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.stock_opname_sessions
  WHERE id = v_session_id AND status = 'counting';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'First scan did not move opname session to counting';
  END IF;
END;
$test$;

ROLLBACK;
