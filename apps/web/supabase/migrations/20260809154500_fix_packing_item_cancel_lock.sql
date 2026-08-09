-- Fix cancellation/removal of packing items for authenticated owner/shopkeeper.
-- SELECT ... FOR UPDATE OF packing_items requires UPDATE permission, while the
-- table intentionally grants only SELECT/INSERT/DELETE. The item itself is
-- locked by DELETE, so only the parent session needs an explicit row lock.

CREATE OR REPLACE FUNCTION public.remove_packing_item_atomic(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item record;
  v_reservation_id uuid;
  v_reservation_status public.stock_reservation_status;
  v_pre_order_line_id uuid;
  v_pre_order_id uuid;
  v_purchase_qty integer;
  v_next_line_status public.pre_order_status;
  v_reversed_journals integer := 0;
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
  FOR UPDATE OF ps;

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

  v_reversed_journals := public.app_reverse_packing_cogs(p_item_id);

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
    'stock_reservation_id', v_item.stock_reservation_id,
    'reversed_journals', v_reversed_journals
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_packing_item_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_packing_item_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_packing_item_atomic(uuid) TO service_role;
