-- Marketplace order import is now a financial/order capture step only.
--
-- Direct marketplace order import:
-- - creates sales invoice + lines + AR/revenue/fee journal
-- - does not decrement product.quantity
-- - does not create outbound stock_movements
-- - does not post COGS/inventory-out journal
--
-- Physical stock and COGS move at Packing / Outbound. This avoids double stock
-- when finance imports marketplace orders and warehouse later packs the goods.

CREATE OR REPLACE FUNCTION public.import_marketplace_order_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid            uuid := auth.uid();
  v_channel        customer_channel := (p_payload->>'channel')::customer_channel;
  v_channel_txt    text := (p_payload->>'channel');
  v_invoice_date   date := (p_payload->>'invoice_date')::date;
  v_customer_name  text := COALESCE(NULLIF(btrim(p_payload->>'customer_name'), ''), 'Marketplace Customer');
  v_order_id       text := NULLIF(btrim(p_payload->>'marketplace_order_id'), '');
  v_discount       numeric := COALESCE((p_payload->>'discount')::numeric, 0);
  v_shipping       numeric := COALESCE((p_payload->>'shipping_fee')::numeric, 0);
  v_admin_fee      numeric := COALESCE((p_payload->>'admin_fee')::numeric, 0);
  v_notes          text := COALESCE(NULLIF(p_payload->>'notes',''), 'Import marketplace ' || upper(v_channel_txt));

  v_distinct_ids   int;
  v_found_ids      int;
  v_subtotal       numeric := 0;
  v_total          numeric;
  v_revenue_code   text;
  v_invoice_number text;
  v_invoice_id     uuid;
  r                record;
  v_lines          jsonb;
BEGIN
  IF NOT public.has_any_role(ARRAY['owner','finance']::user_role[]) THEN
    RAISE EXCEPTION 'Tidak berhak import marketplace';
  END IF;

  IF v_order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sales_invoices WHERE marketplace_order_id = v_order_id
  ) THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  IF p_payload->'lines' IS NULL OR jsonb_array_length(p_payload->'lines') = 0 THEN
    RAISE EXCEPTION 'Order marketplace tidak punya item';
  END IF;

  DROP TABLE IF EXISTS pg_temp._mp_cart;
  CREATE TEMP TABLE _mp_cart ON COMMIT DROP AS
  WITH raw AS (
    SELECT (l->>'product_id')::uuid AS pid,
           (l->>'qty')::int AS qty,
           (l->>'unit_price')::numeric AS price,
           ord
    FROM jsonb_array_elements(p_payload->'lines') WITH ORDINALITY AS t(l, ord)
  ),
  agg AS (
    SELECT pid, sum(qty)::int AS qty, (array_agg(price ORDER BY ord DESC))[1] AS price
    FROM raw GROUP BY pid
  )
  SELECT a.pid, a.qty, a.price,
         p.brand, p.model, p.color, p.size, p.size_label, p.sku, p.hpp, p.is_active
  FROM agg a
  JOIN public.products p ON p.id = a.pid;

  SELECT count(DISTINCT (l->>'product_id')) INTO v_distinct_ids
  FROM jsonb_array_elements(p_payload->'lines') l;
  SELECT count(*) INTO v_found_ids FROM _mp_cart;
  IF v_found_ids <> v_distinct_ids THEN
    RAISE EXCEPTION 'Beberapa produk tidak ditemukan saat import';
  END IF;

  SELECT COALESCE(sum(qty * price), 0)
  INTO v_subtotal
  FROM _mp_cart;

  v_total := v_subtotal - v_discount + v_shipping - v_admin_fee;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Total invoice marketplace harus lebih dari 0';
  END IF;

  v_revenue_code := CASE v_channel_txt
                      WHEN 'shopee'    THEN '4.1.02'
                      WHEN 'tiktok'    THEN '4.1.03'
                      WHEN 'tokopedia' THEN '4.1.04'
                      ELSE '4.1.01'
                    END;

  v_invoice_number := public.generate_sales_invoice_number();
  INSERT INTO public.sales_invoices (
    invoice_number, customer_name, channel, invoice_date, due_date,
    subtotal, discount, shipping, marketplace_fee, tax, total, paid_amount,
    status, marketplace_order_id, notes, created_by
  )
  VALUES (
    v_invoice_number, v_customer_name, v_channel, v_invoice_date, NULL,
    v_subtotal, v_discount, v_shipping, v_admin_fee, 0, v_total, 0,
    'issued', v_order_id, v_notes, v_uid
  )
  RETURNING id INTO v_invoice_id;

  FOR r IN SELECT * FROM _mp_cart LOOP
    IF r.is_active = false THEN
      RAISE EXCEPTION 'Produk % sudah tidak aktif', r.sku;
    END IF;

    INSERT INTO public.sales_invoice_lines (
      invoice_id, product_id, product_label, qty, unit_price, unit_cost, subtotal, notes
    )
    VALUES (
      v_invoice_id, r.pid,
      r.brand || ' ' || r.model || ' ' || COALESCE(r.color,'') || ' • Size ' || COALESCE(r.size_label, r.size::text, '') || ' • ' || r.sku,
      r.qty, r.price, r.hpp, r.qty * r.price,
      'Stok marketplace tidak dikurangi saat import; stok turun saat Packing / Outbound.'
    );
  END LOOP;

  v_lines := jsonb_build_array(
    jsonb_build_object('code','1.1.04','debit',v_total,'credit',0,'description','Piutang penjualan marketplace')
  );
  IF v_admin_fee > 0 THEN
    v_lines := v_lines || jsonb_build_object('code','6.1','debit',v_admin_fee,'credit',0,'description','Estimasi beban administrasi marketplace dari order');
  END IF;
  IF v_discount > 0 THEN
    v_lines := v_lines || jsonb_build_object('code','6.2','debit',v_discount,'credit',0,'description','Beban diskon & promosi');
  END IF;
  v_lines := v_lines || jsonb_build_object('code',v_revenue_code,'debit',0,'credit',v_subtotal + v_shipping,'description','Pendapatan penjualan marketplace');

  PERFORM public.app_post_journal(
    v_invoice_date, 'Invoice penjualan ' || v_invoice_number,
    'sales_invoice'::journal_source, v_invoice_id, v_uid, v_lines
  );

  RETURN jsonb_build_object(
    'skipped', false,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'total', v_total,
    'stock_deducted', false,
    'cogs_posted', false
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.import_marketplace_order_atomic(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_marketplace_order_atomic(jsonb) TO authenticated;

COMMENT ON FUNCTION public.import_marketplace_order_atomic(jsonb) IS
  'Atomic marketplace invoice import without physical stock decrement. Packing / Outbound owns stock movement and COGS.';

CREATE OR REPLACE FUNCTION public.cancel_marketplace_order_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_channel        customer_channel := (p_payload->>'channel')::customer_channel;
  v_channel_txt    text := p_payload->>'channel';
  v_order_id       text := NULLIF(btrim(p_payload->>'marketplace_order_id'), '');
  v_reason         text := COALESCE(NULLIF(btrim(p_payload->>'reason'), ''), 'Cancel/return marketplace');
  v_invoice        record;
  v_move           record;
  v_restored_qty   integer := 0;
  v_reversed       integer := 0;
  v_entry          record;
  v_reverse_id     uuid;
  v_reverse_number text;
BEGIN
  IF NOT public.has_any_role(ARRAY['owner','finance']::user_role[]) THEN
    RAISE EXCEPTION 'Tidak berhak membatalkan order marketplace';
  END IF;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Nomor order marketplace wajib diisi';
  END IF;

  SELECT id, invoice_number, status, paid_amount, settlement_status, notes
  INTO v_invoice
  FROM public.sales_invoices
  WHERE marketplace_order_id = v_order_id
    AND channel = v_channel
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'unmatched',
      'message', 'Order batal/return belum pernah diimport ke invoice sistem'
    );
  END IF;

  IF v_invoice.status::text = 'cancelled' THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'message', 'Invoice sudah dibatalkan sebelumnya'
    );
  END IF;

  IF v_invoice.status::text = 'paid'
     OR COALESCE(v_invoice.paid_amount, 0) > 0
     OR COALESCE(v_invoice.settlement_status, 'none') = 'released' THEN
    RETURN jsonb_build_object(
      'status', 'blocked',
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'invoice_status', v_invoice.status::text,
      'settlement_status', COALESCE(v_invoice.settlement_status, 'none'),
      'message', 'Order sudah paid/settlement. Perlu proses refund/return settlement sebelum status dan stok dikoreksi.'
    );
  END IF;

  IF v_invoice.status::text NOT IN ('issued', 'partial') THEN
    RETURN jsonb_build_object(
      'status', 'blocked',
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'invoice_status', v_invoice.status::text,
      'message', 'Invoice bukan outstanding marketplace yang aman untuk auto-cancel'
    );
  END IF;

  -- Compatibility for old imported invoices that already created stock outbound.
  -- New marketplace imports have no sales_invoice_line outbound movement, so no
  -- physical stock is restored here.
  FOR v_move IN
    SELECT product_id, COALESCE(sum(quantity), 0)::integer AS quantity, max(unit_cost) AS unit_cost
    FROM public.stock_movements
    WHERE reference_type = 'sales_invoice_line'
      AND reference_id = v_invoice.id
      AND type = 'outbound'::public.stock_movement_type
    GROUP BY product_id
  LOOP
    IF v_move.quantity <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.products
    SET quantity = quantity + v_move.quantity,
        updated_at = now()
    WHERE id = v_move.product_id;

    INSERT INTO public.stock_movements (
      product_id, type, quantity, unit_cost, reference_type, reference_id, notes, performed_by
    )
    VALUES (
      v_move.product_id, 'return_in', v_move.quantity, COALESCE(v_move.unit_cost, 0),
      'sales_invoice_cancel', v_invoice.id,
      'Auto-restock cancel marketplace lama ' || upper(v_channel_txt) || ' order ' || v_order_id,
      v_uid
    );

    v_restored_qty := v_restored_qty + v_move.quantity;
  END LOOP;

  FOR v_entry IN
    SELECT id, entry_number, entry_date, total_debit, total_credit
    FROM public.journal_entries
    WHERE source_type = 'sales_invoice'::journal_source
      AND source_id = v_invoice.id
      AND status = 'posted'::journal_status
    ORDER BY created_at
  LOOP
    v_reverse_number := public.generate_journal_entry_number();

    INSERT INTO public.journal_entries (
      entry_number, entry_date, description, source_type, source_id,
      total_debit, total_credit, status, notes, created_by
    )
    VALUES (
      v_reverse_number, current_date,
      'Reverse ' || v_entry.entry_number || ' - ' || v_reason,
      'sales_invoice'::journal_source, v_invoice.id,
      v_entry.total_credit, v_entry.total_debit,
      'posted'::journal_status, v_reason, v_uid
    )
    RETURNING id INTO v_reverse_id;

    INSERT INTO public.journal_lines (
      entry_id, account_id, debit, credit, description, line_order
    )
    SELECT
      v_reverse_id, account_id, credit, debit,
      'Reverse: ' || COALESCE(description, ''),
      line_order
    FROM public.journal_lines
    WHERE entry_id = v_entry.id
    ORDER BY line_order;

    UPDATE public.journal_entries
    SET status = 'reversed'::journal_status,
        reversed_by = v_reverse_id
    WHERE id = v_entry.id;

    v_reversed := v_reversed + 1;
  END LOOP;

  UPDATE public.sales_invoices
  SET status = 'cancelled',
      notes = btrim(COALESCE(v_invoice.notes, '') || E'\n[Dibatalkan marketplace]: ' || v_reason),
      updated_at = now()
  WHERE id = v_invoice.id;

  RETURN jsonb_build_object(
    'status', 'cancelled',
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'restored_qty', v_restored_qty,
    'reversed_journals', v_reversed,
    'message',
      CASE
        WHEN v_restored_qty > 0 THEN 'Invoice marketplace lama dibatalkan, stok outbound lama dikembalikan, dan jurnal direverse'
        ELSE 'Invoice marketplace dibatalkan dan jurnal direverse. Stok tidak dikembalikan karena import marketplace tidak mengurangi stok.'
      END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_marketplace_order_atomic(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_marketplace_order_atomic(jsonb) TO authenticated;

COMMENT ON FUNCTION public.cancel_marketplace_order_atomic(jsonb) IS
  'Safe cancel for imported marketplace orders. Restocks only legacy invoices that actually created outbound stock movements.';

CREATE OR REPLACE FUNCTION public.app_post_packing_cogs(
  p_item_id uuid,
  p_invoice_number text,
  p_hpp numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing uuid;
  v_entry_id uuid;
BEGIN
  IF NOT public.has_any_role(ARRAY['owner','shopkeeper']::public.user_role[]) THEN
    RAISE EXCEPTION 'Tidak berhak posting HPP packing';
  END IF;

  IF COALESCE(p_hpp, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT id
  INTO v_existing
  FROM public.journal_entries
  WHERE source_type = 'stock_adjustment'::public.journal_source
    AND source_id = p_item_id
    AND status = 'posted'::public.journal_status
  ORDER BY created_at
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_entry_id := public.app_post_journal(
    current_date,
    'HPP packing ' || COALESCE(NULLIF(p_invoice_number, ''), p_item_id::text),
    'stock_adjustment'::public.journal_source,
    p_item_id,
    auth.uid(),
    jsonb_build_array(
      jsonb_build_object('code','5.1','debit',p_hpp,'credit',0,'description','HPP barang keluar saat packing'),
      jsonb_build_object('code','1.1.05','debit',0,'credit',p_hpp,'description','Persediaan keluar saat packing')
    )
  );

  RETURN v_entry_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.app_post_packing_cogs(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_post_packing_cogs(uuid, text, numeric) TO authenticated;

COMMENT ON FUNCTION public.app_post_packing_cogs(uuid, text, numeric) IS
  'Internal helper for packing RPCs. Posts COGS/inventory-out for marketplace packing items.';

CREATE OR REPLACE FUNCTION public.app_reverse_packing_cogs(p_item_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry record;
  v_reverse_id uuid;
  v_reverse_number text;
  v_reversed integer := 0;
BEGIN
  IF NOT public.has_any_role(ARRAY['owner','shopkeeper']::public.user_role[]) THEN
    RAISE EXCEPTION 'Tidak berhak reverse HPP packing';
  END IF;

  FOR v_entry IN
    SELECT id, entry_number, entry_date, total_debit, total_credit
    FROM public.journal_entries
    WHERE source_type = 'stock_adjustment'::public.journal_source
      AND source_id = p_item_id
      AND status = 'posted'::public.journal_status
    ORDER BY created_at
  LOOP
    v_reverse_number := public.generate_journal_entry_number();

    INSERT INTO public.journal_entries (
      entry_number, entry_date, description, source_type, source_id,
      total_debit, total_credit, status, notes, created_by
    )
    VALUES (
      v_reverse_number, current_date,
      'Reverse ' || v_entry.entry_number || ' - hapus item packing',
      'stock_adjustment'::public.journal_source, p_item_id,
      v_entry.total_credit, v_entry.total_debit,
      'posted'::public.journal_status, 'Hapus item packing sebelum sesi selesai', auth.uid()
    )
    RETURNING id INTO v_reverse_id;

    INSERT INTO public.journal_lines (
      entry_id, account_id, debit, credit, description, line_order
    )
    SELECT
      v_reverse_id, account_id, credit, debit,
      'Reverse: ' || COALESCE(description, ''),
      line_order
    FROM public.journal_lines
    WHERE entry_id = v_entry.id
    ORDER BY line_order;

    UPDATE public.journal_entries
    SET status = 'reversed'::public.journal_status,
        reversed_by = v_reverse_id
    WHERE id = v_entry.id;

    v_reversed := v_reversed + 1;
  END LOOP;

  RETURN v_reversed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.app_reverse_packing_cogs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_reverse_packing_cogs(uuid) TO authenticated;

COMMENT ON FUNCTION public.app_reverse_packing_cogs(uuid) IS
  'Internal helper for packing RPCs. Reverses packing COGS journals when an item is removed before session completion.';

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
  v_invoice_id uuid;
  v_invoice_number text;
  v_invoice_status text;
  v_invoice_qty integer := 0;
  v_packed_qty integer := 0;
  v_invoice_has_cogs boolean := false;
  v_invoice_has_legacy_stock boolean := false;
  v_cogs_journal_id uuid;
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

  IF v_session.platform IN ('shopee', 'tiktok', 'tokopedia')
     AND NULLIF(btrim(COALESCE(v_session.platform_order_id, '')), '') IS NOT NULL THEN
    SELECT id, invoice_number, status::text
    INTO v_invoice_id, v_invoice_number, v_invoice_status
    FROM public.sales_invoices
    WHERE channel = v_session.platform::public.customer_channel
      AND marketplace_order_id = v_session.platform_order_id
      AND status <> 'cancelled'::public.sales_invoice_status
    ORDER BY created_at
    LIMIT 1;

    IF v_invoice_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.stock_movements
        WHERE reference_type = 'sales_invoice_line'
          AND reference_id = v_invoice_id
          AND type = 'outbound'::public.stock_movement_type
      )
      INTO v_invoice_has_legacy_stock;

      IF v_invoice_has_legacy_stock THEN
        RAISE EXCEPTION 'Invoice % berasal dari import lama yang sudah mengurangi stok. Jangan scan packing ulang agar stok tidak turun dua kali.', v_invoice_number;
      END IF;

      SELECT COALESCE(sum(qty), 0)::integer
      INTO v_invoice_qty
      FROM public.sales_invoice_lines
      WHERE invoice_id = v_invoice_id
        AND product_id = v_product.id;

      IF v_invoice_qty <= 0 THEN
        RAISE EXCEPTION 'Produk % size % tidak ada di invoice marketplace %. Cek nomor order atau pilih produk yang sesuai invoice.', v_product.sku, COALESCE(v_product.size_label, v_product.size::text), v_invoice_number;
      END IF;

      SELECT count(*)::integer
      INTO v_packed_qty
      FROM public.packing_items pi
      JOIN public.packing_sessions ps ON ps.id = pi.packing_session_id
      WHERE ps.platform = v_session.platform
        AND ps.platform_order_id = v_session.platform_order_id
        AND ps.status <> 'cancelled'::public.session_status
        AND pi.product_id = v_product.id;

      IF v_packed_qty >= v_invoice_qty THEN
        RAISE EXCEPTION 'Qty produk % size % untuk invoice % sudah terpenuhi (%/%).', v_product.sku, COALESCE(v_product.size_label, v_product.size::text), v_invoice_number, v_packed_qty, v_invoice_qty;
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entries je
        JOIN public.journal_lines jl ON jl.entry_id = je.id
        JOIN public.chart_of_accounts coa ON coa.id = jl.account_id
        WHERE je.source_type = 'sales_invoice'::public.journal_source
          AND je.source_id = v_invoice_id
          AND je.status = 'posted'::public.journal_status
          AND coa.code = '5.1'
      )
      INTO v_invoice_has_cogs;
    END IF;
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

  IF v_invoice_id IS NOT NULL AND v_invoice_has_cogs = false AND COALESCE(v_product.hpp, 0) > 0 THEN
    v_cogs_journal_id := public.app_post_packing_cogs(v_item_id, v_invoice_number, v_product.hpp);
  END IF;

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
      'stock_movement_id', v_movement_id,
      'cogs_journal_id', v_cogs_journal_id,
      'invoice_id', v_invoice_id
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.scan_packing_item_atomic(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scan_packing_item_atomic(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.scan_packing_item_atomic(uuid, text) IS
  'Atomic packing scan/manual add. Marketplace invoices created after no-stock import move stock and COGS here.';

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
$$;

REVOKE EXECUTE ON FUNCTION public.remove_packing_item_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_packing_item_atomic(uuid) TO authenticated;

COMMENT ON FUNCTION public.remove_packing_item_atomic(uuid) IS
  'Atomic removal of a packing item. Restores stock/reservation and reverses any packing COGS journal while session is still packing.';

-- Close UAT config/data gaps discovered during audit. Idempotent and additive:
-- keep existing configured periods/prices; only fill missing values.
INSERT INTO public.fiscal_periods (year, month, status)
SELECT 2026, gs.month, 'open'::public.fiscal_period_status
FROM generate_series(1, 12) AS gs(month)
ON CONFLICT (year, month) DO NOTHING;

UPDATE public.products
SET
  price_website = CASE
    WHEN COALESCE(price_website, 0) <= 0 THEN COALESCE(NULLIF(price_offline, 0), NULLIF(sell_price, 0), 0)
    ELSE price_website
  END,
  price_shopee = CASE
    WHEN COALESCE(price_shopee, 0) <= 0 THEN COALESCE(NULLIF(price_offline, 0), NULLIF(sell_price, 0), 0)
    ELSE price_shopee
  END,
  price_tiktok = CASE
    WHEN COALESCE(price_tiktok, 0) <= 0 THEN COALESCE(NULLIF(price_offline, 0), NULLIF(sell_price, 0), 0)
    ELSE price_tiktok
  END,
  price_tokopedia = CASE
    WHEN COALESCE(price_tokopedia, 0) <= 0 THEN COALESCE(NULLIF(price_offline, 0), NULLIF(sell_price, 0), 0)
    ELSE price_tokopedia
  END,
  updated_at = now()
WHERE is_active = true
  AND (
    COALESCE(price_website, 0) <= 0 OR
    COALESCE(price_shopee, 0) <= 0 OR
    COALESCE(price_tiktok, 0) <= 0 OR
    COALESCE(price_tokopedia, 0) <= 0
  );
