-- Safe POS cancellation / reversal.
-- This is intentionally a reversal flow, not a hard delete:
-- - POS invoice remains as cancelled for audit.
-- - Product stock is restored with stock movement rows.
-- - Original POS payment/allocation is removed after a bank reversal is posted.
-- - Original sales/payment journals are reversed and marked reversed.

CREATE OR REPLACE FUNCTION public.cancel_pos_checkout(
  p_invoice_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid              uuid := auth.uid();
  v_invoice          record;
  v_payment          record;
  v_payment_count    int := 0;
  v_bank_tx          record;
  v_bank             record;
  v_line             record;
  v_entry            record;
  v_reverse_id       uuid;
  v_reverse_number   text;
  v_new_balance      numeric;
  v_reason           text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_merged_notes     text;
  v_reversed_sales   int := 0;
  v_reversed_payment int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan';
  END IF;

  IF NOT public.has_any_role(ARRAY['owner','shopkeeper','finance']::user_role[]) THEN
    RAISE EXCEPTION 'Tidak berhak membatalkan transaksi POS';
  END IF;

  SELECT *
  INTO v_invoice
  FROM sales_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice POS tidak ditemukan';
  END IF;

  IF v_invoice.status = 'cancelled' THEN
    RAISE EXCEPTION 'Transaksi POS sudah dibatalkan';
  END IF;

  IF v_invoice.channel <> 'offline' OR v_invoice.status <> 'paid' THEN
    RAISE EXCEPTION 'Hanya invoice POS offline yang sudah lunas yang bisa dibatalkan lewat fitur ini';
  END IF;

  SELECT *
  INTO v_bank_tx
  FROM bank_transactions
  WHERE related_entity_type = 'pos_checkout'
    AND related_entity_id = p_invoice_id
    AND type = 'credit'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_bank_tx.id IS NULL THEN
    RAISE EXCEPTION 'Jejak bank POS tidak ditemukan. Gunakan pembatalan invoice/penerimaan reguler.';
  END IF;

  SELECT count(DISTINCT cp.id)
  INTO v_payment_count
  FROM customer_payments cp
  JOIN customer_payment_allocations cpa ON cpa.payment_id = cp.id
  WHERE cpa.invoice_id = p_invoice_id;

  IF v_payment_count <> 1 THEN
    RAISE EXCEPTION 'Transaksi POS harus memiliki tepat 1 penerimaan. Ditemukan %.', v_payment_count;
  END IF;

  SELECT cp.*
  INTO v_payment
  FROM customer_payments cp
  JOIN customer_payment_allocations cpa ON cpa.payment_id = cp.id
  WHERE cpa.invoice_id = p_invoice_id
  LIMIT 1
  FOR UPDATE OF cp;

  SELECT *
  INTO v_bank
  FROM bank_accounts
  WHERE id = v_bank_tx.bank_account_id
  FOR UPDATE;

  IF v_bank.id IS NULL THEN
    RAISE EXCEPTION 'Akun kas/bank transaksi POS tidak ditemukan';
  END IF;

  FOR v_line IN
    SELECT id, product_id, product_label, qty, unit_cost
    FROM sales_invoice_lines
    WHERE invoice_id = p_invoice_id
  LOOP
    IF v_line.product_id IS NOT NULL THEN
      UPDATE products
      SET quantity = quantity + v_line.qty,
          updated_at = now()
      WHERE id = v_line.product_id;

      INSERT INTO stock_movements (
        product_id, type, quantity, unit_cost,
        reference_type, reference_id, notes, performed_by
      )
      VALUES (
        v_line.product_id,
        'adjustment',
        v_line.qty,
        COALESCE(v_line.unit_cost, 0),
        'pos_cancel',
        p_invoice_id,
        'Pembatalan POS ' || v_invoice.invoice_number ||
          COALESCE(': ' || v_reason, ''),
        v_uid
      );
    END IF;
  END LOOP;

  FOR v_entry IN
    SELECT id, entry_number, source_type, source_id, total_debit, total_credit
    FROM journal_entries
    WHERE status = 'posted'
      AND (
        (source_type = 'sales_invoice'::journal_source AND source_id = p_invoice_id)
        OR
        (source_type = 'customer_payment'::journal_source AND source_id = v_payment.id)
      )
    FOR UPDATE
  LOOP
    v_reverse_number := public.generate_journal_entry_number();

    INSERT INTO journal_entries (
      entry_number, entry_date, description, source_type, source_id,
      total_debit, total_credit, status, notes, created_by
    )
    VALUES (
      v_reverse_number,
      current_date,
      'Reverse ' || v_entry.entry_number ||
        COALESCE(' — ' || v_reason, ''),
      v_entry.source_type,
      v_entry.source_id,
      v_entry.total_credit,
      v_entry.total_debit,
      'posted',
      v_reason,
      v_uid
    )
    RETURNING id INTO v_reverse_id;

    INSERT INTO journal_lines (
      entry_id, account_id, debit, credit, description, line_order
    )
    SELECT
      v_reverse_id,
      account_id,
      credit,
      debit,
      'Reverse: ' || COALESCE(description, ''),
      line_order
    FROM journal_lines
    WHERE entry_id = v_entry.id;

    UPDATE journal_entries
    SET status = 'reversed',
        reversed_by = v_reverse_id
    WHERE id = v_entry.id;

    IF v_entry.source_type = 'sales_invoice'::journal_source THEN
      v_reversed_sales := v_reversed_sales + 1;
    ELSIF v_entry.source_type = 'customer_payment'::journal_source THEN
      v_reversed_payment := v_reversed_payment + 1;
    END IF;
  END LOOP;

  v_new_balance := v_bank.current_balance - v_bank_tx.amount;

  UPDATE bank_accounts
  SET current_balance = v_new_balance
  WHERE id = v_bank.id;

  INSERT INTO bank_transactions (
    bank_account_id, transaction_date, type, amount, balance_after,
    reference_no, description, related_entity_type, related_entity_id, created_by
  )
  VALUES (
    v_bank.id,
    current_date,
    'debit',
    v_bank_tx.amount,
    v_new_balance,
    'CANCEL-' || v_invoice.invoice_number,
    'Pembatalan POS ' || v_invoice.invoice_number ||
      COALESCE(' — ' || v_reason, ''),
    'pos_cancel',
    p_invoice_id,
    v_uid
  );

  DELETE FROM customer_payment_allocations
  WHERE payment_id = v_payment.id;

  DELETE FROM customer_payments
  WHERE id = v_payment.id;

  v_merged_notes := concat_ws(
    E'\n',
    NULLIF(v_invoice.notes, ''),
    '[POS dibatalkan]' || COALESCE(' ' || v_reason, '')
  );

  UPDATE sales_invoices
  SET status = 'cancelled',
      paid_amount = 0,
      notes = v_merged_notes,
      updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'invoice_id', p_invoice_id,
    'invoice_number', v_invoice.invoice_number,
    'payment_id', v_payment.id,
    'payment_number', v_payment.payment_number,
    'bank_transaction_id', v_bank_tx.id,
    'amount', v_bank_tx.amount,
    'reversed_sales_journals', v_reversed_sales,
    'reversed_payment_journals', v_reversed_payment
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_pos_checkout(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_pos_checkout(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.cancel_pos_checkout(uuid, text) IS
  'Safely reverses one atomic POS checkout in a single transaction. Keeps the invoice cancelled for audit and restores stock, bank, payment, and journals.';
