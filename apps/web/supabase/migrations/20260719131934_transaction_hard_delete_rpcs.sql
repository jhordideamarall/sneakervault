-- Dependency-aware hard delete for accounting purchase and sales flows.
-- Deletes business records and their effects without creating reversal records.

CREATE OR REPLACE FUNCTION private.assert_accounting_delete_role()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_uid
      AND is_active = true
      AND roles && ARRAY['owner','finance']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Hanya Owner atau Finance yang dapat menghapus transaksi';
  END IF;
  RETURN v_uid;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_accounting_delete_role()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.is_fiscal_period_closed(p_date date)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.fiscal_periods
    WHERE year = extract(year FROM p_date)::integer
      AND month = extract(month FROM p_date)::integer
      AND status = 'closed'
  );
$$;

REVOKE ALL ON FUNCTION private.is_fiscal_period_closed(date)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.delete_source_journals(
  p_source_type public.journal_source,
  p_source_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.journal_entries
  SET reversed_by = NULL
  WHERE reversed_by IN (
    SELECT id
    FROM public.journal_entries
    WHERE source_type = p_source_type
      AND source_id = p_source_id
  );

  DELETE FROM public.journal_entries
  WHERE source_type = p_source_type
    AND source_id = p_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION private.delete_source_journals(
  public.journal_source, uuid
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.recalculate_bank_balance(p_bank_account_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_balance numeric;
  v_tx record;
BEGIN
  SELECT opening_balance
  INTO v_balance
  FROM public.bank_accounts
  WHERE id = p_bank_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun kas/bank tidak ditemukan';
  END IF;

  FOR v_tx IN
    SELECT id, type, amount
    FROM public.bank_transactions
    WHERE bank_account_id = p_bank_account_id
    ORDER BY transaction_date, created_at, id
    FOR UPDATE
  LOOP
    v_balance := CASE v_tx.type
      WHEN 'credit' THEN v_balance + v_tx.amount
      ELSE v_balance - v_tx.amount
    END;

    UPDATE public.bank_transactions
    SET balance_after = v_balance
    WHERE id = v_tx.id;
  END LOOP;

  UPDATE public.bank_accounts
  SET current_balance = v_balance,
      updated_at = now()
  WHERE id = p_bank_account_id;

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION private.recalculate_bank_balance(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.write_minimal_delete_audit(
  p_actor uuid,
  p_stage text,
  p_reference_number text,
  p_entity_type text,
  p_entity_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  DELETE FROM public.activity_logs
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id;

  INSERT INTO public.activity_logs(
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  )
  VALUES (
    p_actor,
    'hard_delete',
    'transaction_deletion',
    NULL,
    NULL,
    jsonb_build_object(
      'stage', p_stage,
      'reference_number', p_reference_number
    )
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION private.write_minimal_delete_audit(
  uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.deleted_result(
  p_deleted boolean,
  p_reference_number text,
  p_blocker_stage text DEFAULT NULL,
  p_blocker_numbers text[] DEFAULT ARRAY[]::text[]
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'deleted', p_deleted,
    'reference_number', p_reference_number,
    'blocker_stage', p_blocker_stage,
    'blocker_numbers', to_jsonb(COALESCE(p_blocker_numbers, ARRAY[]::text[]))
  );
$$;

REVOKE ALL ON FUNCTION private.deleted_result(
  boolean, text, text, text[]
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_vendor_payment_atomic(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := private.assert_accounting_delete_role();
  v_payment record;
  v_invoice_id uuid;
  v_invoice_ids uuid[];
  v_bank_id uuid;
  v_bank_ids uuid[];
  v_blockers text[];
  v_paid numeric;
BEGIN
  SELECT *
  INTO v_payment
  FROM public.vendor_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pembayaran vendor tidak ditemukan';
  END IF;

  IF private.is_fiscal_period_closed(v_payment.payment_date) THEN
    RETURN private.deleted_result(
      false, v_payment.payment_number, 'closed_period',
      ARRAY[to_char(v_payment.payment_date, 'MM/YYYY')]
    );
  END IF;

  SELECT array_agg(COALESCE(reference_no, id::text) ORDER BY created_at)
  INTO v_blockers
  FROM public.bank_transactions
  WHERE related_entity_type = 'vendor_payment'
    AND related_entity_id = p_payment_id
    AND is_reconciled = true;

  IF cardinality(COALESCE(v_blockers, ARRAY[]::text[])) > 0 THEN
    RETURN private.deleted_result(
      false, v_payment.payment_number, 'bank_reconciliation', v_blockers
    );
  END IF;

  SELECT array_agg(DISTINCT invoice_id ORDER BY invoice_id)
  INTO v_invoice_ids
  FROM public.vendor_payment_allocations
  WHERE payment_id = p_payment_id;

  IF cardinality(COALESCE(v_invoice_ids, ARRAY[]::uuid[])) > 0 THEN
    PERFORM 1
    FROM public.purchase_invoices
    WHERE id = ANY(v_invoice_ids)
    ORDER BY id
    FOR UPDATE;
  END IF;

  SELECT array_agg(DISTINCT bank_account_id ORDER BY bank_account_id)
  INTO v_bank_ids
  FROM public.bank_transactions
  WHERE related_entity_type = 'vendor_payment'
    AND related_entity_id = p_payment_id;

  IF cardinality(COALESCE(v_bank_ids, ARRAY[]::uuid[])) > 0 THEN
    PERFORM 1
    FROM public.bank_accounts
    WHERE id = ANY(v_bank_ids)
    ORDER BY id
    FOR UPDATE;
  END IF;

  DELETE FROM public.vendor_payment_allocations
  WHERE payment_id = p_payment_id;

  FOREACH v_invoice_id IN ARRAY COALESCE(v_invoice_ids, ARRAY[]::uuid[])
  LOOP
    SELECT COALESCE(sum(amount), 0)
    INTO v_paid
    FROM public.vendor_payment_allocations
    WHERE invoice_id = v_invoice_id;

    UPDATE public.purchase_invoices
    SET paid_amount = v_paid,
        status = CASE
          WHEN status = 'cancelled' THEN status
          WHEN v_paid <= 0.001 THEN 'unpaid'::public.purchase_invoice_status
          WHEN v_paid >= total - 0.001 THEN 'paid'::public.purchase_invoice_status
          ELSE 'partial'::public.purchase_invoice_status
        END,
        updated_at = now()
    WHERE id = v_invoice_id;
  END LOOP;

  DELETE FROM public.bank_transactions
  WHERE related_entity_type = 'vendor_payment'
    AND related_entity_id = p_payment_id;

  PERFORM private.delete_source_journals(
    'vendor_payment', p_payment_id
  );
  PERFORM private.write_minimal_delete_audit(
    v_uid,
    'vendor_payment',
    v_payment.payment_number,
    'vendor_payment',
    p_payment_id
  );

  DELETE FROM public.vendor_payments
  WHERE id = p_payment_id;

  FOREACH v_bank_id IN ARRAY COALESCE(v_bank_ids, ARRAY[]::uuid[])
  LOOP
    PERFORM private.recalculate_bank_balance(v_bank_id);
  END LOOP;

  RETURN private.deleted_result(true, v_payment.payment_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_purchase_invoice_atomic(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := private.assert_accounting_delete_role();
  v_invoice record;
  v_blockers text[];
  v_stock record;
  v_product record;
  v_new_qty integer;
  v_new_hpp numeric;
BEGIN
  SELECT *
  INTO v_invoice
  FROM public.purchase_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Faktur pembelian tidak ditemukan';
  END IF;

  IF private.is_fiscal_period_closed(v_invoice.invoice_date) THEN
    RETURN private.deleted_result(
      false, v_invoice.invoice_number, 'closed_period',
      ARRAY[to_char(v_invoice.invoice_date, 'MM/YYYY')]
    );
  END IF;

  SELECT array_agg(DISTINCT vp.payment_number ORDER BY vp.payment_number)
  INTO v_blockers
  FROM public.vendor_payment_allocations vpa
  JOIN public.vendor_payments vp ON vp.id = vpa.payment_id
  WHERE vpa.invoice_id = p_invoice_id;

  IF cardinality(COALESCE(v_blockers, ARRAY[]::text[])) > 0 THEN
    RETURN private.deleted_result(
      false, v_invoice.invoice_number, 'vendor_payment', v_blockers
    );
  END IF;

  -- A manual invoice owns its inbound stock. PO-based invoice stock belongs to
  -- purchase receipts and is intentionally untouched here.
  IF v_invoice.po_id IS NULL AND v_invoice.status <> 'cancelled' THEN
    SELECT array_agg(product_label ORDER BY product_label)
    INTO v_blockers
    FROM (
      SELECT min(pil.product_label) AS product_label
      FROM public.purchase_invoice_lines pil
      JOIN public.products p ON p.id = pil.product_id
      WHERE pil.invoice_id = p_invoice_id
      GROUP BY pil.product_id, p.quantity
      HAVING p.quantity < sum(pil.qty)
    ) blocked_stock;

    IF cardinality(COALESCE(v_blockers, ARRAY[]::text[])) > 0 THEN
      RETURN private.deleted_result(
        false, v_invoice.invoice_number, 'stock_usage', v_blockers
      );
    END IF;

    FOR v_stock IN
      SELECT pil.product_id,
             sum(pil.qty)::integer AS quantity,
             sum(pil.qty * pil.unit_cost)::numeric AS cost_value
      FROM public.purchase_invoice_lines pil
      WHERE pil.invoice_id = p_invoice_id
        AND pil.product_id IS NOT NULL
      GROUP BY pil.product_id
      ORDER BY pil.product_id
    LOOP
      SELECT id, quantity, hpp
      INTO v_product
      FROM public.products
      WHERE id = v_stock.product_id
      FOR UPDATE;

      v_new_qty := v_product.quantity - v_stock.quantity;
      v_new_hpp := CASE
        WHEN v_new_qty <= 0 THEN 0
        ELSE greatest(
          ((v_product.quantity * v_product.hpp) - v_stock.cost_value)
          / v_new_qty,
          0
        )
      END;

      UPDATE public.products
      SET quantity = v_new_qty,
          hpp = v_new_hpp,
          updated_at = now()
      WHERE id = v_stock.product_id;
    END LOOP;
  END IF;

  DELETE FROM public.stock_movements
  WHERE (
    reference_type = 'purchase_invoice_line'
    AND reference_id IN (
      SELECT id
      FROM public.purchase_invoice_lines
      WHERE invoice_id = p_invoice_id
    )
  ) OR (
    reference_type = 'purchase_invoice_cancel'
    AND reference_id IN (
      SELECT id
      FROM public.purchase_invoice_lines
      WHERE invoice_id = p_invoice_id
    )
  );

  PERFORM private.delete_source_journals(
    'purchase_invoice', p_invoice_id
  );
  PERFORM private.write_minimal_delete_audit(
    v_uid,
    'purchase_invoice',
    v_invoice.invoice_number,
    'purchase_invoice',
    p_invoice_id
  );

  DELETE FROM public.purchase_invoices
  WHERE id = p_invoice_id;

  RETURN private.deleted_result(true, v_invoice.invoice_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_purchase_receipt_atomic(p_receipt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := private.assert_accounting_delete_role();
  v_receipt record;
  v_po record;
  v_blockers text[];
  v_stock record;
  v_product record;
  v_movement_ids uuid[];
  v_new_qty integer;
  v_new_hpp numeric;
  v_new_status public.po_status;
BEGIN
  SELECT *
  INTO v_receipt
  FROM public.purchase_receipts
  WHERE id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Penerimaan barang tidak ditemukan';
  END IF;

  SELECT *
  INTO v_po
  FROM public.purchase_orders
  WHERE id = v_receipt.po_id
  FOR UPDATE;

  IF private.is_fiscal_period_closed(v_receipt.receipt_date) THEN
    RETURN private.deleted_result(
      false, v_receipt.receipt_number, 'closed_period',
      ARRAY[to_char(v_receipt.receipt_date, 'MM/YYYY')]
    );
  END IF;

  SELECT array_agg(invoice_number ORDER BY invoice_number)
  INTO v_blockers
  FROM public.purchase_invoices
  WHERE po_id = v_receipt.po_id;

  IF cardinality(COALESCE(v_blockers, ARRAY[]::text[])) > 0 THEN
    RETURN private.deleted_result(
      false, v_receipt.receipt_number, 'purchase_invoice', v_blockers
    );
  END IF;

  SELECT array_agg(product_label ORDER BY product_label)
  INTO v_blockers
  FROM (
    SELECT min(
      p.brand || ' ' || p.model || ' - Size ' || p.size_label
    ) AS product_label
    FROM public.purchase_receipt_lines prl
    JOIN public.products p ON p.id = prl.product_id
    WHERE prl.receipt_id = p_receipt_id
    GROUP BY prl.product_id, p.quantity
    HAVING p.quantity < sum(prl.quantity)
  ) blocked_stock;

  IF cardinality(COALESCE(v_blockers, ARRAY[]::text[])) > 0 THEN
    RETURN private.deleted_result(
      false, v_receipt.receipt_number, 'stock_usage', v_blockers
    );
  END IF;

  SELECT array_agg(stock_movement_id ORDER BY stock_movement_id)
  INTO v_movement_ids
  FROM public.purchase_receipt_lines
  WHERE receipt_id = p_receipt_id;

  FOR v_stock IN
    SELECT product_id,
           sum(quantity)::integer AS quantity,
           sum(quantity * unit_cost)::numeric AS cost_value
    FROM public.purchase_receipt_lines
    WHERE receipt_id = p_receipt_id
    GROUP BY product_id
    ORDER BY product_id
  LOOP
    SELECT id, quantity, hpp
    INTO v_product
    FROM public.products
    WHERE id = v_stock.product_id
    FOR UPDATE;

    v_new_qty := v_product.quantity - v_stock.quantity;
    v_new_hpp := CASE
      WHEN v_new_qty <= 0 THEN 0
      ELSE greatest(
        ((v_product.quantity * v_product.hpp) - v_stock.cost_value)
        / v_new_qty,
        0
      )
    END;

    UPDATE public.products
    SET quantity = v_new_qty,
        hpp = v_new_hpp,
        updated_at = now()
    WHERE id = v_stock.product_id;
  END LOOP;

  UPDATE public.purchase_order_lines pol
  SET received_qty = pol.received_qty - receipt_totals.quantity
  FROM (
    SELECT po_line_id, sum(quantity)::integer AS quantity
    FROM public.purchase_receipt_lines
    WHERE receipt_id = p_receipt_id
    GROUP BY po_line_id
  ) receipt_totals
  WHERE pol.id = receipt_totals.po_line_id;

  IF v_receipt.source_activity_log_id IS NOT NULL THEN
    DELETE FROM public.activity_logs
    WHERE id = v_receipt.source_activity_log_id;
  END IF;

  DELETE FROM public.purchase_receipts
  WHERE id = p_receipt_id;

  DELETE FROM public.stock_movements
  WHERE id = ANY(COALESCE(v_movement_ids, ARRAY[]::uuid[]));

  SELECT CASE
    WHEN bool_and(received_qty >= ordered_qty)
      THEN 'completed'::public.po_status
    WHEN bool_or(received_qty > 0)
      THEN 'receiving'::public.po_status
    ELSE 'approved'::public.po_status
  END
  INTO v_new_status
  FROM public.purchase_order_lines
  WHERE po_id = v_receipt.po_id;

  UPDATE public.purchase_orders
  SET status = CASE
        WHEN status = 'cancelled' THEN status
        ELSE v_new_status
      END,
      updated_at = now()
  WHERE id = v_receipt.po_id;

  PERFORM private.write_minimal_delete_audit(
    v_uid,
    'purchase_receipt',
    v_receipt.receipt_number,
    'purchase_receipt',
    p_receipt_id
  );

  RETURN private.deleted_result(true, v_receipt.receipt_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_purchase_order_atomic(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := private.assert_accounting_delete_role();
  v_po record;
  v_blockers text[];
  v_pre_order_line_ids uuid[];
  v_pre_order_ids uuid[];
  v_pre_order_id uuid;
BEGIN
  SELECT *
  INTO v_po
  FROM public.purchase_orders
  WHERE id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO Pembelian tidak ditemukan';
  END IF;

  IF private.is_fiscal_period_closed(v_po.order_date) THEN
    RETURN private.deleted_result(
      false, v_po.po_number, 'closed_period',
      ARRAY[to_char(v_po.order_date, 'MM/YYYY')]
    );
  END IF;

  SELECT array_agg(DISTINCT vp.payment_number ORDER BY vp.payment_number)
  INTO v_blockers
  FROM public.purchase_invoices pi
  JOIN public.vendor_payment_allocations vpa ON vpa.invoice_id = pi.id
  JOIN public.vendor_payments vp ON vp.id = vpa.payment_id
  WHERE pi.po_id = p_po_id;

  IF cardinality(COALESCE(v_blockers, ARRAY[]::text[])) > 0 THEN
    RETURN private.deleted_result(
      false, v_po.po_number, 'vendor_payment', v_blockers
    );
  END IF;

  SELECT array_agg(invoice_number ORDER BY invoice_number)
  INTO v_blockers
  FROM public.purchase_invoices
  WHERE po_id = p_po_id;

  IF cardinality(COALESCE(v_blockers, ARRAY[]::text[])) > 0 THEN
    RETURN private.deleted_result(
      false, v_po.po_number, 'purchase_invoice', v_blockers
    );
  END IF;

  SELECT array_agg(receipt_number ORDER BY receipt_date, created_at)
  INTO v_blockers
  FROM public.purchase_receipts
  WHERE po_id = p_po_id;

  IF cardinality(COALESCE(v_blockers, ARRAY[]::text[])) > 0 THEN
    RETURN private.deleted_result(
      false, v_po.po_number, 'purchase_receipt', v_blockers
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_order_lines
    WHERE po_id = p_po_id
      AND received_qty <> 0
  ) THEN
    RAISE EXCEPTION
      'PO Pembelian memiliki received_qty tanpa riwayat penerimaan. Hubungi administrator.';
  END IF;

  SELECT array_agg(DISTINCT popl.pre_order_line_id),
         array_agg(DISTINCT pol.pre_order_id)
  INTO v_pre_order_line_ids, v_pre_order_ids
  FROM public.pre_order_procurement_links popl
  JOIN public.pre_order_lines pol ON pol.id = popl.pre_order_line_id
  WHERE popl.purchase_order_id = p_po_id;

  PERFORM private.write_minimal_delete_audit(
    v_uid,
    'purchase_order',
    v_po.po_number,
    'purchase_order',
    p_po_id
  );

  DELETE FROM public.purchase_orders
  WHERE id = p_po_id;

  -- Removing a supplier PO only removes the procurement link. The customer
  -- Pre Order remains intact and returns to the correct fulfillment state.
  IF cardinality(COALESCE(v_pre_order_line_ids, ARRAY[]::uuid[])) > 0 THEN
    UPDATE public.pre_order_lines pol
    SET status = CASE
          WHEN pol.status IN ('packed','cancelled') THEN pol.status
          WHEN pol.reserved_qty >= pol.requested_qty
            THEN 'ready_from_stock'::public.pre_order_status
          WHEN EXISTS (
            SELECT 1
            FROM public.pre_order_procurement_links remaining_link
            WHERE remaining_link.pre_order_line_id = pol.id
          ) THEN 'purchase_created'::public.pre_order_status
          WHEN pol.purchase_qty > 0
            THEN 'needs_purchase'::public.pre_order_status
          ELSE 'review'::public.pre_order_status
        END,
        updated_at = now()
    WHERE pol.id = ANY(v_pre_order_line_ids);

    FOREACH v_pre_order_id IN ARRAY COALESCE(v_pre_order_ids, ARRAY[]::uuid[])
    LOOP
      PERFORM public.refresh_pre_order_status_from_lines(v_pre_order_id);
    END LOOP;
  END IF;

  RETURN private.deleted_result(true, v_po.po_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_customer_payment_atomic(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := private.assert_accounting_delete_role();
  v_payment record;
  v_invoice_id uuid;
  v_invoice_ids uuid[];
  v_bank_id uuid;
  v_bank_ids uuid[];
  v_blockers text[];
  v_paid numeric;
BEGIN
  SELECT *
  INTO v_payment
  FROM public.customer_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Penerimaan customer tidak ditemukan';
  END IF;

  IF private.is_fiscal_period_closed(v_payment.payment_date) THEN
    RETURN private.deleted_result(
      false, v_payment.payment_number, 'closed_period',
      ARRAY[to_char(v_payment.payment_date, 'MM/YYYY')]
    );
  END IF;

  SELECT array_agg(DISTINCT si.invoice_number ORDER BY si.invoice_number)
  INTO v_blockers
  FROM public.customer_payment_allocations cpa
  JOIN public.sales_invoices si ON si.id = cpa.invoice_id
  WHERE cpa.payment_id = p_payment_id
    AND (
      si.marketplace_order_id IS NOT NULL
      OR si.channel IN ('shopee','tiktok','tokopedia')
      OR si.settlement_status <> 'none'
      OR EXISTS (
        SELECT 1
        FROM public.bank_transactions pos_tx
        WHERE pos_tx.related_entity_type = 'pos_checkout'
          AND pos_tx.related_entity_id = si.id
      )
    );

  IF cardinality(COALESCE(v_blockers, ARRAY[]::text[])) > 0 THEN
    RETURN private.deleted_result(
      false, v_payment.payment_number, 'unsupported_sales_flow', v_blockers
    );
  END IF;

  SELECT array_agg(COALESCE(reference_no, id::text) ORDER BY created_at)
  INTO v_blockers
  FROM public.bank_transactions
  WHERE related_entity_type = 'customer_payment'
    AND related_entity_id = p_payment_id
    AND is_reconciled = true;

  IF cardinality(COALESCE(v_blockers, ARRAY[]::text[])) > 0 THEN
    RETURN private.deleted_result(
      false, v_payment.payment_number, 'bank_reconciliation', v_blockers
    );
  END IF;

  SELECT array_agg(DISTINCT invoice_id ORDER BY invoice_id)
  INTO v_invoice_ids
  FROM public.customer_payment_allocations
  WHERE payment_id = p_payment_id;

  IF cardinality(COALESCE(v_invoice_ids, ARRAY[]::uuid[])) > 0 THEN
    PERFORM 1
    FROM public.sales_invoices
    WHERE id = ANY(v_invoice_ids)
    ORDER BY id
    FOR UPDATE;
  END IF;

  SELECT array_agg(DISTINCT bank_account_id ORDER BY bank_account_id)
  INTO v_bank_ids
  FROM public.bank_transactions
  WHERE related_entity_type = 'customer_payment'
    AND related_entity_id = p_payment_id;

  IF cardinality(COALESCE(v_bank_ids, ARRAY[]::uuid[])) > 0 THEN
    PERFORM 1
    FROM public.bank_accounts
    WHERE id = ANY(v_bank_ids)
    ORDER BY id
    FOR UPDATE;
  END IF;

  DELETE FROM public.customer_payment_allocations
  WHERE payment_id = p_payment_id;

  FOREACH v_invoice_id IN ARRAY COALESCE(v_invoice_ids, ARRAY[]::uuid[])
  LOOP
    SELECT COALESCE(sum(amount), 0)
    INTO v_paid
    FROM public.customer_payment_allocations
    WHERE invoice_id = v_invoice_id;

    UPDATE public.sales_invoices
    SET paid_amount = v_paid,
        status = CASE
          WHEN status = 'cancelled' THEN status
          WHEN v_paid <= 0.001 THEN 'issued'::public.sales_invoice_status
          WHEN v_paid >= total - 0.001 THEN 'paid'::public.sales_invoice_status
          ELSE 'partial'::public.sales_invoice_status
        END,
        updated_at = now()
    WHERE id = v_invoice_id;
  END LOOP;

  DELETE FROM public.bank_transactions
  WHERE related_entity_type = 'customer_payment'
    AND related_entity_id = p_payment_id;

  PERFORM private.delete_source_journals(
    'customer_payment', p_payment_id
  );
  PERFORM private.write_minimal_delete_audit(
    v_uid,
    'customer_payment',
    v_payment.payment_number,
    'customer_payment',
    p_payment_id
  );

  DELETE FROM public.customer_payments
  WHERE id = p_payment_id;

  FOREACH v_bank_id IN ARRAY COALESCE(v_bank_ids, ARRAY[]::uuid[])
  LOOP
    PERFORM private.recalculate_bank_balance(v_bank_id);
  END LOOP;

  RETURN private.deleted_result(true, v_payment.payment_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_sales_invoice_atomic(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := private.assert_accounting_delete_role();
  v_invoice record;
  v_blockers text[];
  v_stock record;
  v_product record;
  v_outbound integer;
  v_restored integer;
BEGIN
  SELECT *
  INTO v_invoice
  FROM public.sales_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice penjualan tidak ditemukan';
  END IF;

  IF private.is_fiscal_period_closed(v_invoice.invoice_date) THEN
    RETURN private.deleted_result(
      false, v_invoice.invoice_number, 'closed_period',
      ARRAY[to_char(v_invoice.invoice_date, 'MM/YYYY')]
    );
  END IF;

  SELECT array_agg(DISTINCT cp.payment_number ORDER BY cp.payment_number)
  INTO v_blockers
  FROM public.customer_payment_allocations cpa
  JOIN public.customer_payments cp ON cp.id = cpa.payment_id
  WHERE cpa.invoice_id = p_invoice_id;

  IF cardinality(COALESCE(v_blockers, ARRAY[]::text[])) > 0 THEN
    RETURN private.deleted_result(
      false, v_invoice.invoice_number, 'customer_payment', v_blockers
    );
  END IF;

  IF v_invoice.marketplace_order_id IS NOT NULL
     OR v_invoice.channel IN ('shopee','tiktok','tokopedia')
     OR v_invoice.settlement_status <> 'none'
     OR EXISTS (
       SELECT 1
       FROM public.bank_transactions
       WHERE related_entity_type = 'pos_checkout'
         AND related_entity_id = p_invoice_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.stock_movements
       WHERE reference_type = 'pos_invoice'
         AND reference_id = p_invoice_id
     ) THEN
    RETURN private.deleted_result(
      false,
      v_invoice.invoice_number,
      'unsupported_sales_flow',
      ARRAY[v_invoice.invoice_number]
    );
  END IF;

  FOR v_stock IN
    SELECT sil.product_id,
           sum(sil.qty)::integer AS line_qty
    FROM public.sales_invoice_lines sil
    WHERE sil.invoice_id = p_invoice_id
      AND sil.product_id IS NOT NULL
    GROUP BY sil.product_id
    ORDER BY sil.product_id
  LOOP
    SELECT COALESCE(sum(
      CASE
        WHEN reference_type = 'sales_invoice_line' THEN quantity
        ELSE 0
      END
    ), 0)::integer,
    COALESCE(sum(
      CASE
        WHEN reference_type = 'sales_invoice_cancel' THEN quantity
        ELSE 0
      END
    ), 0)::integer
    INTO v_outbound, v_restored
    FROM public.stock_movements
    WHERE product_id = v_stock.product_id
      AND reference_id = p_invoice_id
      AND reference_type IN (
        'sales_invoice_line',
        'sales_invoice_cancel'
      );

    IF v_invoice.status = 'draft' THEN
      v_outbound := 0;
    ELSIF v_outbound = 0
          AND v_restored = 0
          AND v_invoice.status <> 'cancelled' THEN
      -- Legacy issued invoice without movement metadata.
      v_outbound := v_stock.line_qty;
    END IF;

    v_outbound := greatest(v_outbound - v_restored, 0);

    IF v_outbound > 0 THEN
      SELECT id, quantity
      INTO v_product
      FROM public.products
      WHERE id = v_stock.product_id
      FOR UPDATE;

      UPDATE public.products
      SET quantity = v_product.quantity + v_outbound,
          updated_at = now()
      WHERE id = v_stock.product_id;
    END IF;
  END LOOP;

  DELETE FROM public.stock_movements
  WHERE reference_id = p_invoice_id
    AND reference_type IN (
      'sales_invoice_line',
      'sales_invoice_cancel'
    );

  PERFORM private.delete_source_journals(
    'sales_invoice', p_invoice_id
  );
  PERFORM private.write_minimal_delete_audit(
    v_uid,
    'sales_invoice',
    v_invoice.invoice_number,
    'sales_invoice',
    p_invoice_id
  );

  DELETE FROM public.sales_invoices
  WHERE id = p_invoice_id;

  RETURN private.deleted_result(true, v_invoice.invoice_number);
END;
$$;

-- Transaction number generators use monotonic counters. Deleted numbers are
-- intentionally never reused and visible gaps are valid audit behavior.
CREATE OR REPLACE FUNCTION public.generate_po_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    ARRAY['owner','finance']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak membuat nomor PO Pembelian';
  END IF;
  RETURN private.next_transaction_number('PO', current_date, 4);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_purchase_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    ARRAY['owner','finance','admin_gudang']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak membuat nomor faktur pembelian';
  END IF;
  RETURN private.next_transaction_number('FB', current_date, 4);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_vendor_payment_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    ARRAY['owner','finance']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak membuat nomor pembayaran vendor';
  END IF;
  RETURN private.next_transaction_number('BV', current_date, 4);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_sales_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND roles && ARRAY[
        'owner','finance','admin_online','shopkeeper'
      ]::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak membuat nomor invoice penjualan';
  END IF;
  RETURN private.next_transaction_number('INV', current_date, 4);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_customer_payment_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(
    ARRAY['owner','finance','shopkeeper']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak membuat nomor penerimaan customer';
  END IF;
  RETURN private.next_transaction_number('BM', current_date, 4);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_journal_entry_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Login diperlukan untuk membuat nomor jurnal';
  END IF;
  RETURN private.next_transaction_number('JRN', current_date, 5);
END;
$$;

-- The POS cancellation feature came from the earlier wording
-- misunderstanding. Keep POS history immutable and remove RPC access.
REVOKE ALL ON FUNCTION public.cancel_pos_checkout(uuid, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.delete_vendor_payment_atomic(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_purchase_invoice_atomic(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_purchase_receipt_atomic(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_purchase_order_atomic(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_customer_payment_atomic(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_sales_invoice_atomic(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.delete_vendor_payment_atomic(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_purchase_invoice_atomic(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_purchase_receipt_atomic(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_purchase_order_atomic(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_customer_payment_atomic(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sales_invoice_atomic(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.generate_po_number()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_purchase_invoice_number()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_vendor_payment_number()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_sales_invoice_number()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_customer_payment_number()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_journal_entry_number()
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.generate_po_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_purchase_invoice_number()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_vendor_payment_number()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_sales_invoice_number()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_customer_payment_number()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_journal_entry_number()
  TO authenticated;

COMMENT ON FUNCTION public.delete_vendor_payment_atomic(uuid) IS
  'Hard-deletes a vendor payment and its bank/journal effects, then recomputes allocations and balances.';
COMMENT ON FUNCTION public.delete_purchase_invoice_atomic(uuid) IS
  'Hard-deletes an unallocated purchase invoice; manual invoice stock/HPP is removed with it.';
COMMENT ON FUNCTION public.delete_purchase_receipt_atomic(uuid) IS
  'Hard-deletes a receipt only after its PO invoices are removed, restoring stock, HPP, received qty, and PO status.';
COMMENT ON FUNCTION public.delete_purchase_order_atomic(uuid) IS
  'Hard-deletes an empty supplier Purchase Order while preserving customer Pre Order records.';
COMMENT ON FUNCTION public.delete_customer_payment_atomic(uuid) IS
  'Hard-deletes a regular accounting customer receipt and recomputes bank and invoice balances.';
COMMENT ON FUNCTION public.delete_sales_invoice_atomic(uuid) IS
  'Hard-deletes a regular accounting sales invoice after customer receipts are removed; excludes POS and marketplace flows.';
