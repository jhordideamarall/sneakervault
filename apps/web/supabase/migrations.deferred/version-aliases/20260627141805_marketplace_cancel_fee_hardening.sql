-- Marketplace cancel/return hardening.
--
-- Additive only. Import order rows with cancelled/return statuses need a safe
-- path that can restore stock for unpaid marketplace invoices without breaking
-- settlement accounting. Paid/released invoices are intentionally blocked and
-- must go through an explicit refund/return settlement flow.

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
  v_line           record;
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

  SELECT
    id, invoice_number, status, paid_amount, settlement_status, notes
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
      'message', 'Order sudah paid/settlement. Perlu proses refund/return settlement sebelum stok dikembalikan.'
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

  FOR v_line IN
    SELECT product_id, qty, unit_cost
    FROM public.sales_invoice_lines
    WHERE invoice_id = v_invoice.id
  LOOP
    UPDATE public.products
    SET quantity = quantity + v_line.qty,
        updated_at = now()
    WHERE id = v_line.product_id;

    INSERT INTO public.stock_movements (
      product_id, type, quantity, unit_cost, reference_type, reference_id, notes, performed_by
    )
    VALUES (
      v_line.product_id, 'return_in', v_line.qty, COALESCE(v_line.unit_cost, 0),
      'sales_invoice_cancel', v_invoice.id,
      'Auto-restock cancel marketplace ' || upper(v_channel_txt) || ' order ' || v_order_id,
      v_uid
    );

    v_restored_qty := v_restored_qty + v_line.qty;
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
    'message', 'Invoice marketplace dibatalkan, stok dikembalikan, dan jurnal direverse'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_marketplace_order_atomic(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_marketplace_order_atomic(jsonb) TO authenticated;

COMMENT ON FUNCTION public.cancel_marketplace_order_atomic(jsonb) IS
  'Atomic safe cancel for imported marketplace orders. Restocks only unpaid/unsettled invoices and blocks paid/released settlement cases.';
