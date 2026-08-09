-- Pre Order creation/cancellation used several independent REST mutations.
-- Make header, lines, reservations, and status changes one transaction so a
-- network/RLS failure cannot leave partial demand or orphan reservations.

CREATE OR REPLACE FUNCTION public.create_pre_order_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_source public.pre_order_source :=
    coalesce(nullif(btrim(p_payload->>'source'), ''), 'manual')::public.pre_order_source;
  v_channel text := coalesce(nullif(btrim(p_payload->>'channel'), ''), 'manual');
  v_reference text := nullif(btrim(p_payload->>'marketplace_order_id'), '');
  v_customer_id uuid := nullif(p_payload->>'customer_id', '')::uuid;
  v_customer_name text := nullif(btrim(p_payload->>'customer_name'), '');
  v_order_date date := (p_payload->>'order_date')::date;
  v_deadline_date date := nullif(p_payload->>'deadline_date', '')::date;
  v_order_id uuid;
  v_line_id uuid;
  v_line jsonb;
  v_product public.products%ROWTYPE;
  v_product_id uuid;
  v_requested integer;
  v_active_reserved integer;
  v_reserved integer;
  v_purchase integer;
  v_available integer;
  v_line_status public.pre_order_status;
  v_header_status public.pre_order_status := 'ready_from_stock';
  v_unit_price numeric;
  v_estimated_cost numeric;
  v_size_value numeric;
  v_line_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan';
  END IF;
  IF NOT public.has_any_role(
    ARRAY['owner','finance','admin_online']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak membuat Pre Order';
  END IF;
  IF v_customer_name IS NULL OR v_order_date IS NULL THEN
    RAISE EXCEPTION 'Customer dan tanggal order wajib diisi';
  END IF;
  IF v_channel NOT IN (
    'manual','wa','shopee','tiktok','tokopedia','offline','website','other'
  ) THEN
    RAISE EXCEPTION 'Channel Pre Order tidak valid';
  END IF;
  IF v_source = 'marketplace'::public.pre_order_source AND v_channel = 'manual' THEN
    RAISE EXCEPTION 'Channel marketplace tidak boleh Manual';
  END IF;
  IF (v_source = 'marketplace'::public.pre_order_source
      OR v_channel NOT IN ('manual', 'offline'))
     AND v_reference IS NULL THEN
    RAISE EXCEPTION 'Nomor order atau referensi wajib diisi agar preorder bisa dicocokkan saat packing';
  END IF;
  IF v_deadline_date IS NOT NULL AND v_deadline_date < v_order_date THEN
    RAISE EXCEPTION 'Deadline tidak boleh sebelum tanggal order';
  END IF;
  IF jsonb_typeof(p_payload->'lines') <> 'array'
     OR jsonb_array_length(p_payload->'lines') = 0 THEN
    RAISE EXCEPTION 'Minimal 1 item Pre Order';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.fiscal_periods fp
    WHERE fp.year = extract(year FROM v_order_date)::integer
      AND fp.month = extract(month FROM v_order_date)::integer
      AND fp.status = 'closed'::public.fiscal_period_status
  ) THEN
    RAISE EXCEPTION 'Periode akuntansi sudah ditutup';
  END IF;

  INSERT INTO public.pre_orders (
    source,
    channel,
    marketplace_order_id,
    customer_id,
    customer_name,
    order_date,
    deadline_date,
    status,
    marketplace_status,
    notes,
    created_by
  )
  VALUES (
    v_source,
    v_channel,
    v_reference,
    v_customer_id,
    v_customer_name,
    v_order_date,
    v_deadline_date,
    'review'::public.pre_order_status,
    nullif(btrim(p_payload->>'marketplace_status'), ''),
    nullif(btrim(p_payload->>'notes'), ''),
    v_uid
  )
  RETURNING id INTO v_order_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lines')
  LOOP
    v_line_count := v_line_count + 1;
    v_product := NULL;
    v_product_id := nullif(v_line->>'product_id', '')::uuid;
    v_requested := coalesce(nullif(v_line->>'requested_qty', '')::integer, 0);
    v_unit_price := coalesce(nullif(v_line->>'unit_price', '')::numeric, 0);
    v_estimated_cost := coalesce(nullif(v_line->>'estimated_cost', '')::numeric, 0);
    v_size_value := nullif(v_line->>'size_value', '')::numeric;

    IF v_requested <= 0 THEN
      RAISE EXCEPTION 'Qty item ke-% harus lebih dari 0', v_line_count;
    END IF;
    IF v_unit_price < 0 OR v_estimated_cost < 0 THEN
      RAISE EXCEPTION 'Harga dan estimasi HPP tidak boleh negatif';
    END IF;

    IF v_product_id IS NOT NULL THEN
      SELECT * INTO v_product
      FROM public.products
      WHERE id = v_product_id
        AND is_active = true
      FOR UPDATE;

      IF v_product.id IS NULL THEN
        RAISE EXCEPTION 'Produk item ke-% tidak ditemukan atau nonaktif', v_line_count;
      END IF;

      SELECT coalesce(sum(sr.quantity), 0)::integer
      INTO v_active_reserved
      FROM public.stock_reservations sr
      WHERE sr.product_id = v_product_id
        AND sr.status = 'active'::public.stock_reservation_status;

      v_available := greatest(0, v_product.quantity - v_active_reserved);
      v_reserved := least(v_requested, v_available);
      v_purchase := greatest(0, v_requested - v_reserved);
      v_line_status := CASE
        WHEN v_purchase > 0 THEN 'needs_purchase'::public.pre_order_status
        ELSE 'ready_from_stock'::public.pre_order_status
      END;
      v_unit_price := CASE
        WHEN v_unit_price > 0 THEN v_unit_price
        ELSE coalesce(v_product.sell_price, 0)
      END;
      v_estimated_cost := CASE
        WHEN v_estimated_cost > 0 THEN v_estimated_cost
        ELSE coalesce(v_product.hpp, 0)
      END;
    ELSE
      v_reserved := 0;
      v_purchase := v_requested;
      v_line_status := 'review'::public.pre_order_status;
      IF nullif(btrim(v_line->>'sku'), '') IS NULL
         OR nullif(btrim(v_line->>'product_name'), '') IS NULL
         OR nullif(btrim(v_line->>'size_label'), '') IS NULL THEN
        RAISE EXCEPTION 'Produk manual wajib mengisi SKU, nama produk, dan size';
      END IF;
    END IF;

    INSERT INTO public.pre_order_lines (
      pre_order_id,
      product_id,
      sku,
      product_name,
      brand,
      model,
      color,
      size_label,
      size_value,
      requested_qty,
      reserved_qty,
      purchase_qty,
      unit_price,
      estimated_cost,
      status,
      notes
    )
    VALUES (
      v_order_id,
      v_product_id,
      coalesce(nullif(btrim(v_line->>'sku'), ''), v_product.sku, '-'),
      coalesce(
        nullif(btrim(v_line->>'product_name'), ''),
        nullif(btrim(concat_ws(' ', v_product.brand, v_product.model, v_product.color)), ''),
        'Produk manual'
      ),
      coalesce(nullif(btrim(v_line->>'brand'), ''), v_product.brand),
      coalesce(nullif(btrim(v_line->>'model'), ''), v_product.model),
      coalesce(nullif(btrim(v_line->>'color'), ''), v_product.color),
      coalesce(
        nullif(btrim(v_line->>'size_label'), ''),
        v_product.size_label,
        v_product.size::text,
        '-'
      ),
      coalesce(v_size_value, v_product.size),
      v_requested,
      v_reserved,
      v_purchase,
      v_unit_price,
      v_estimated_cost,
      v_line_status,
      nullif(btrim(v_line->>'notes'), '')
    )
    RETURNING id INTO v_line_id;

    IF v_product_id IS NOT NULL AND v_reserved > 0 THEN
      INSERT INTO public.stock_reservations (
        pre_order_line_id,
        product_id,
        quantity,
        status,
        created_by
      )
      VALUES (
        v_line_id,
        v_product_id,
        v_reserved,
        'active'::public.stock_reservation_status,
        v_uid
      );
    END IF;

    IF v_line_status = 'review'::public.pre_order_status THEN
      v_header_status := 'review'::public.pre_order_status;
    ELSIF v_line_status = 'needs_purchase'::public.pre_order_status
          AND v_header_status <> 'review'::public.pre_order_status THEN
      v_header_status := 'needs_purchase'::public.pre_order_status;
    END IF;
  END LOOP;

  UPDATE public.pre_orders
  SET status = v_header_status,
      updated_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'status', v_header_status::text,
    'line_count', v_line_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_pre_order_atomic(
  p_pre_order_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.pre_orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan';
  END IF;
  IF NOT public.has_any_role(
    ARRAY['owner','finance','admin_online']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak membatalkan Pre Order';
  END IF;

  SELECT * INTO v_order
  FROM public.pre_orders
  WHERE id = p_pre_order_id
  FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Pre Order tidak ditemukan';
  END IF;
  IF v_order.status = 'packed'::public.pre_order_status THEN
    RAISE EXCEPTION 'Pre Order sudah masuk packing. Batalkan dari jalur packing/retur supaya stok dan audit tetap konsisten.';
  END IF;
  IF v_order.status = 'cancelled'::public.pre_order_status THEN
    RETURN jsonb_build_object('id', v_order.id, 'status', 'cancelled', 'skipped', true);
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.packing_items pi
    JOIN public.stock_reservations sr ON sr.id = pi.stock_reservation_id
    JOIN public.pre_order_lines pol ON pol.id = sr.pre_order_line_id
    WHERE pol.pre_order_id = p_pre_order_id
  ) THEN
    RAISE EXCEPTION 'Pre Order sudah punya item di packing. Batalkan/retur dari jalur packing supaya stok dan audit tetap konsisten.';
  END IF;

  UPDATE public.stock_reservations sr
  SET status = 'cancelled'::public.stock_reservation_status,
      released_at = now(),
      updated_at = now()
  FROM public.pre_order_lines pol
  WHERE pol.id = sr.pre_order_line_id
    AND pol.pre_order_id = p_pre_order_id
    AND sr.status = 'active'::public.stock_reservation_status;

  UPDATE public.pre_order_lines
  SET status = 'cancelled'::public.pre_order_status,
      reserved_qty = 0,
      updated_at = now()
  WHERE pre_order_id = p_pre_order_id;

  UPDATE public.pre_orders
  SET status = 'cancelled'::public.pre_order_status,
      notes = CASE
        WHEN nullif(btrim(p_reason), '') IS NULL THEN notes
        ELSE btrim(coalesce(notes, '') || E'\n[Dibatalkan]: ' || btrim(p_reason))
      END,
      updated_at = now()
  WHERE id = p_pre_order_id;

  RETURN jsonb_build_object(
    'id', p_pre_order_id,
    'status', 'cancelled',
    'skipped', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_pre_order_atomic(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_pre_order_atomic(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_pre_order_atomic(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_pre_order_atomic(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_pre_order_atomic(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_pre_order_atomic(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.create_pre_order_atomic(jsonb) IS
  'Atomically creates Pre Order header, lines, and concurrency-safe stock reservations.';
COMMENT ON FUNCTION public.cancel_pre_order_atomic(uuid, text) IS
  'Atomically cancels a Pre Order and releases all active reservations unless packing already consumed one.';
