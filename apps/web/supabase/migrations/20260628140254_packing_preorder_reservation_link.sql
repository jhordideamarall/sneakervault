-- Link scanned packing items to Pre Order stock reservations.
--
-- A reservation is demand allocation, not stock decrement. Packing is the
-- moment physical stock leaves inventory, so each scan consumes one reserved
-- unit when the packing session matches the marketplace Pre Order.

ALTER TABLE public.packing_items
  ADD COLUMN IF NOT EXISTS stock_reservation_id uuid
    REFERENCES public.stock_reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_packing_items_stock_reservation
  ON public.packing_items(stock_reservation_id)
  WHERE stock_reservation_id IS NOT NULL;

COMMENT ON COLUMN public.packing_items.stock_reservation_id IS
  'Optional link to stock_reservations when a Pre Order allocation is consumed by packing.';

CREATE OR REPLACE FUNCTION public.refresh_pre_order_status_from_lines(p_pre_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next_status public.pre_order_status;
BEGIN
  SELECT CASE
    WHEN bool_or(status = 'review'::public.pre_order_status) THEN 'review'::public.pre_order_status
    WHEN bool_or(status = 'needs_purchase'::public.pre_order_status) THEN 'needs_purchase'::public.pre_order_status
    WHEN bool_or(status = 'purchase_created'::public.pre_order_status) THEN 'purchase_created'::public.pre_order_status
    WHEN bool_or(status = 'waiting_stock'::public.pre_order_status) THEN 'waiting_stock'::public.pre_order_status
    WHEN bool_and(status IN (
      'packed'::public.pre_order_status,
      'cancelled'::public.pre_order_status
    )) THEN 'packed'::public.pre_order_status
    WHEN bool_or(status = 'ready_to_pack'::public.pre_order_status) THEN 'ready_to_pack'::public.pre_order_status
    ELSE 'ready_from_stock'::public.pre_order_status
  END
  INTO v_next_status
  FROM public.pre_order_lines
  WHERE pre_order_id = p_pre_order_id;

  IF v_next_status IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.pre_orders
  SET status = v_next_status,
      updated_at = now()
  WHERE id = p_pre_order_id
    AND status IS DISTINCT FROM 'cancelled'::public.pre_order_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_pre_order_status_from_lines(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_pre_order_status_from_lines(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scan_packing_item_atomic(
  p_session_id uuid,
  p_barcode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.packing_sessions%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_item_id uuid;
  v_movement_id uuid;
  v_reservation_id uuid;
  v_reservation_qty integer;
  v_pre_order_line_id uuid;
  v_pre_order_id uuid;
  v_purchase_qty integer;
  v_active_remaining integer := 0;
BEGIN
  IF NOT public.has_any_role(ARRAY['owner','shopkeeper']::public.user_role[]) THEN
    RAISE EXCEPTION 'Tidak berhak scan packing';
  END IF;

  SELECT *
  INTO v_session
  FROM public.packing_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak ditemukan';
  END IF;
  IF v_session.status <> 'packing'::public.session_status THEN
    RAISE EXCEPTION 'Sesi sudah tidak aktif';
  END IF;

  SELECT *
  INTO v_product
  FROM public.products
  WHERE barcode = btrim(p_barcode)
    AND is_active = true;

  IF v_product.id IS NULL THEN
    RAISE EXCEPTION 'Produk tidak ditemukan';
  END IF;

  IF v_session.platform <> 'offline'
     AND NULLIF(btrim(COALESCE(v_session.platform_order_id, '')), '') IS NOT NULL THEN
    SELECT
      sr.id,
      sr.quantity,
      pol.id AS pre_order_line_id,
      pol.pre_order_id,
      pol.purchase_qty
    INTO
      v_reservation_id,
      v_reservation_qty,
      v_pre_order_line_id,
      v_pre_order_id,
      v_purchase_qty
    FROM public.stock_reservations sr
    JOIN public.pre_order_lines pol ON pol.id = sr.pre_order_line_id
    JOIN public.pre_orders po ON po.id = pol.pre_order_id
    WHERE sr.product_id = v_product.id
      AND sr.status = 'active'::public.stock_reservation_status
      AND po.channel = v_session.platform
      AND po.marketplace_order_id = v_session.platform_order_id
      AND po.status <> 'cancelled'::public.pre_order_status
    ORDER BY sr.created_at, sr.id
    LIMIT 1
    FOR UPDATE OF sr;
  END IF;

  IF NOT public.decrement_product_quantity(v_product.id, 1) THEN
    RAISE EXCEPTION 'Stok habis atau sudah diambil pengguna lain';
  END IF;

  INSERT INTO public.packing_items (
    packing_session_id,
    product_id,
    barcode_scanned,
    unit_hpp,
    sell_price,
    stock_reservation_id
  )
  VALUES (
    p_session_id,
    v_product.id,
    btrim(p_barcode),
    v_product.hpp,
    v_product.sell_price,
    v_reservation_id
  )
  RETURNING id INTO v_item_id;

  v_movement_id := public.create_stock_movement(
    v_product.id,
    'outbound'::public.stock_movement_type,
    1,
    v_product.hpp,
    'packing_item',
    v_item_id,
    CASE
      WHEN v_reservation_id IS NULL THEN 'Packing outbound'
      ELSE 'Packing outbound dari reservasi Pre Order'
    END
  );

  IF v_reservation_id IS NOT NULL THEN
    IF COALESCE(v_reservation_qty, 0) > 1 THEN
      UPDATE public.stock_reservations
      SET quantity = quantity - 1,
          updated_at = now()
      WHERE id = v_reservation_id;
    ELSE
      UPDATE public.stock_reservations
      SET status = 'consumed'::public.stock_reservation_status,
          released_at = now(),
          updated_at = now()
      WHERE id = v_reservation_id;
    END IF;

    SELECT COALESCE(sum(quantity), 0)::integer
    INTO v_active_remaining
    FROM public.stock_reservations
    WHERE pre_order_line_id = v_pre_order_line_id
      AND status = 'active'::public.stock_reservation_status;

    IF v_active_remaining = 0 AND COALESCE(v_purchase_qty, 0) = 0 THEN
      UPDATE public.pre_order_lines
      SET status = 'packed'::public.pre_order_status,
          updated_at = now()
      WHERE id = v_pre_order_line_id;

      PERFORM public.refresh_pre_order_status_from_lines(v_pre_order_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'product', jsonb_build_object(
      'id', v_product.id,
      'brand', v_product.brand,
      'model', v_product.model,
      'size', v_product.size,
      'size_label', v_product.size_label,
      'sku', v_product.sku,
      'barcode', v_product.barcode,
      'quantity', v_product.quantity - 1,
      'hpp', v_product.hpp,
      'sell_price', v_product.sell_price
    ),
    'item', jsonb_build_object(
      'id', v_item_id,
      'stock_reservation_id', v_reservation_id,
      'stock_movement_id', v_movement_id
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.scan_packing_item_atomic(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scan_packing_item_atomic(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_packing_item_atomic(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item record;
  v_reservation_id uuid;
  v_reservation_status public.stock_reservation_status;
  v_pre_order_line_id uuid;
  v_pre_order_id uuid;
  v_purchase_qty integer;
  v_next_line_status public.pre_order_status;
BEGIN
  IF NOT public.has_any_role(ARRAY['owner','shopkeeper']::public.user_role[]) THEN
    RAISE EXCEPTION 'Tidak berhak menghapus item packing';
  END IF;

  SELECT
    pi.id,
    pi.product_id,
    pi.packing_session_id,
    pi.stock_reservation_id,
    ps.status AS session_status
  INTO v_item
  FROM public.packing_items pi
  JOIN public.packing_sessions ps ON ps.id = pi.packing_session_id
  WHERE pi.id = p_item_id
  FOR UPDATE OF pi, ps;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Item tidak ditemukan';
  END IF;
  IF v_item.session_status <> 'packing'::public.session_status THEN
    RAISE EXCEPTION 'Tidak bisa menghapus item karena sesi sudah tidak aktif';
  END IF;

  IF v_item.stock_reservation_id IS NOT NULL THEN
    SELECT
      sr.id,
      sr.status,
      sr.pre_order_line_id,
      pol.pre_order_id,
      pol.purchase_qty
    INTO
      v_reservation_id,
      v_reservation_status,
      v_pre_order_line_id,
      v_pre_order_id,
      v_purchase_qty
    FROM public.stock_reservations sr
    JOIN public.pre_order_lines pol ON pol.id = sr.pre_order_line_id
    WHERE sr.id = v_item.stock_reservation_id
    FOR UPDATE OF sr, pol;
  END IF;

  DELETE FROM public.packing_items
  WHERE id = p_item_id;

  PERFORM public.increment_product_quantity(v_item.product_id, 1);

  DELETE FROM public.stock_movements
  WHERE reference_type = 'packing_item'
    AND reference_id = p_item_id;

  IF v_reservation_id IS NOT NULL THEN
    IF v_reservation_status = 'consumed'::public.stock_reservation_status THEN
      UPDATE public.stock_reservations
      SET status = 'active'::public.stock_reservation_status,
          released_at = NULL,
          updated_at = now()
      WHERE id = v_reservation_id;
    ELSIF v_reservation_status = 'active'::public.stock_reservation_status THEN
      UPDATE public.stock_reservations
      SET quantity = quantity + 1,
          updated_at = now()
      WHERE id = v_reservation_id;
    END IF;

    v_next_line_status := CASE
      WHEN COALESCE(v_purchase_qty, 0) > 0 THEN 'needs_purchase'::public.pre_order_status
      ELSE 'ready_from_stock'::public.pre_order_status
    END;

    UPDATE public.pre_order_lines
    SET status = v_next_line_status,
        updated_at = now()
    WHERE id = v_pre_order_line_id
      AND status = 'packed'::public.pre_order_status;

    PERFORM public.refresh_pre_order_status_from_lines(v_pre_order_id);
  END IF;

  RETURN jsonb_build_object(
    'item_id', p_item_id,
    'product_id', v_item.product_id,
    'packing_session_id', v_item.packing_session_id,
    'stock_reservation_id', v_item.stock_reservation_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_packing_item_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_packing_item_atomic(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_packing_session_atomic(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.packing_sessions%ROWTYPE;
  v_item record;
  v_count integer := 0;
BEGIN
  IF NOT public.has_any_role(ARRAY['owner','shopkeeper']::public.user_role[]) THEN
    RAISE EXCEPTION 'Tidak berhak membatalkan sesi packing';
  END IF;

  SELECT *
  INTO v_session
  FROM public.packing_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak ditemukan';
  END IF;
  IF v_session.status <> 'packing'::public.session_status THEN
    RAISE EXCEPTION 'Hanya bisa batalkan sesi yang masih packing';
  END IF;

  FOR v_item IN
    SELECT id
    FROM public.packing_items
    WHERE packing_session_id = p_session_id
    ORDER BY created_at DESC, id DESC
  LOOP
    PERFORM public.remove_packing_item_atomic(v_item.id);
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.packing_sessions
  SET status = 'cancelled'::public.session_status,
      status_updated_by = auth.uid(),
      updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('session_id', p_session_id, 'items_count', v_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_packing_session_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_packing_session_atomic(uuid) TO authenticated;

COMMENT ON FUNCTION public.scan_packing_item_atomic(uuid, text) IS
  'Atomically scans one packing item, decrements physical stock, records movement, and consumes matching Pre Order reservation.';
COMMENT ON FUNCTION public.remove_packing_item_atomic(uuid) IS
  'Atomically removes one packing item, restores physical stock, removes movement, and restores linked Pre Order reservation.';
COMMENT ON FUNCTION public.cancel_packing_session_atomic(uuid) IS
  'Atomically cancels a packing session and rolls back all scanned items plus linked Pre Order reservations.';
