CREATE OR REPLACE FUNCTION public.app_post_journal(
  p_entry_date  date,
  p_description  text,
  p_source_type  journal_source,
  p_source_id   uuid,
  p_user_id     uuid,
  p_lines       jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_debit  numeric := 0;
  v_total_credit numeric := 0;
  v_entry_id     uuid;
  v_entry_number text;
  v_account_id   uuid;
  v_line         jsonb;
  v_idx          int := 0;
BEGIN
  FOR v_line IN SELECT jsonb_array_elements(p_lines) LOOP
    v_total_debit  := v_total_debit  + COALESCE((v_line->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + COALESCE((v_line->>'credit')::numeric, 0);
  END LOOP;

  IF abs(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION 'Journal not balanced: dr=% cr=%', v_total_debit, v_total_credit;
  END IF;

  v_entry_number := public.generate_journal_entry_number();

  INSERT INTO journal_entries (
    entry_number, entry_date, description, source_type, source_id,
    total_debit, total_credit, status, created_by
  )
  VALUES (
    v_entry_number, p_entry_date, p_description, p_source_type, p_source_id,
    v_total_debit, v_total_credit, 'posted', p_user_id
  )
  RETURNING id INTO v_entry_id;

  FOR v_line IN SELECT jsonb_array_elements(p_lines) LOOP
    SELECT id INTO v_account_id FROM chart_of_accounts WHERE code = (v_line->>'code');
    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'CoA code % not found', (v_line->>'code');
    END IF;

    INSERT INTO journal_lines (entry_id, account_id, debit, credit, description, line_order)
    VALUES (
      v_entry_id, v_account_id,
      COALESCE((v_line->>'debit')::numeric, 0),
      COALESCE((v_line->>'credit')::numeric, 0),
      v_line->>'description', v_idx
    );
    v_idx := v_idx + 1;
  END LOOP;

  RETURN v_entry_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.app_post_journal(date, text, journal_source, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.app_post_journal(date, text, journal_source, uuid, uuid, jsonb) IS
  'Internal balanced-journal poster. Called only by other SECURITY DEFINER transaction functions, never directly by clients.';

CREATE OR REPLACE FUNCTION public.pos_checkout(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_invoice_date   date := (p_payload->>'invoice_date')::date;
  v_discount       numeric := COALESCE((p_payload->>'discount')::numeric, 0);
  v_tax            numeric := COALESCE((p_payload->>'tax')::numeric, 0);
  v_customer_id    uuid := NULLIF(p_payload->>'customer_id', '')::uuid;
  v_customer_name  text := COALESCE(NULLIF(btrim(p_payload->>'customer_name'), ''), 'Walk-in Customer');
  v_payment_method payment_method := (p_payload->>'payment_method')::payment_method;
  v_bank_id        uuid := (p_payload->>'bank_account_id')::uuid;
  v_reference_no   text := NULLIF(p_payload->>'reference_no', '');
  v_notes          text := COALESCE(NULLIF(p_payload->>'notes', ''), 'POS Kasir Offline');

  v_bank           record;
  v_bank_code      text;
  v_distinct_ids   int;
  v_found_ids      int;
  v_subtotal       numeric := 0;
  v_cogs           numeric := 0;
  v_total          numeric;
  v_invoice_number text;
  v_invoice_id     uuid;
  v_payment_number text;
  v_payment_id     uuid;
  v_new_balance    numeric;
  v_updated        int;
  r                record;
  v_sales_lines    jsonb;
  v_pay_lines      jsonb;
BEGIN
  IF NOT public.has_any_role(ARRAY['owner','shopkeeper','finance']::user_role[]) THEN
    RAISE EXCEPTION 'Tidak berhak melakukan POS checkout';
  END IF;

  SELECT id, name, current_balance, type, is_active INTO v_bank
  FROM bank_accounts WHERE id = v_bank_id;
  IF v_bank.id IS NULL OR v_bank.is_active = false THEN
    RAISE EXCEPTION 'Akun kas/bank tidak aktif';
  END IF;
  v_bank_code := CASE v_bank.type::text
                   WHEN 'cash' THEN '1.1.01'
                   WHEN 'marketplace_balance' THEN '1.1.03'
                   ELSE '1.1.02'
                 END;

  CREATE TEMP TABLE _pos_cart ON COMMIT DROP AS
  WITH raw AS (
    SELECT (l->>'product_id')::uuid AS pid,
           (l->>'qty')::int          AS qty,
           (l->>'unit_price')::numeric AS price,
           ord
    FROM jsonb_array_elements(p_payload->'lines') WITH ORDINALITY AS t(l, ord)
  ),
  agg AS (
    SELECT pid, sum(qty)::int AS qty, (array_agg(price ORDER BY ord DESC))[1] AS price
    FROM raw GROUP BY pid
  )
  SELECT a.pid, a.qty, a.price,
         p.brand, p.model, p.color, p.size, p.sku, p.hpp, p.is_active
  FROM agg a JOIN products p ON p.id = a.pid;

  SELECT count(DISTINCT (l->>'product_id')) INTO v_distinct_ids
  FROM jsonb_array_elements(p_payload->'lines') l;
  SELECT count(*) INTO v_found_ids FROM _pos_cart;
  IF v_found_ids <> v_distinct_ids THEN
    RAISE EXCEPTION 'Beberapa produk POS tidak ditemukan';
  END IF;

  SELECT COALESCE(sum(qty * price), 0), COALESCE(sum(hpp * qty), 0)
  INTO v_subtotal, v_cogs FROM _pos_cart;
  v_total := GREATEST(0, v_subtotal - v_discount + v_tax);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Total POS harus lebih dari 0';
  END IF;

  v_invoice_number := public.generate_sales_invoice_number();
  INSERT INTO sales_invoices (
    invoice_number, customer_id, customer_name, channel, invoice_date, due_date,
    subtotal, discount, shipping, marketplace_fee, tax, total, paid_amount,
    status, marketplace_order_id, notes, created_by
  )
  VALUES (
    v_invoice_number, v_customer_id, v_customer_name, 'offline', v_invoice_date, NULL,
    v_subtotal, v_discount, 0, 0, v_tax, v_total, 0,
    'issued', NULL, v_notes, v_uid
  )
  RETURNING id INTO v_invoice_id;

  FOR r IN SELECT * FROM _pos_cart LOOP
    IF r.is_active = false THEN
      RAISE EXCEPTION 'Produk % sudah tidak aktif', r.sku;
    END IF;

    INSERT INTO sales_invoice_lines (
      invoice_id, product_id, product_label, qty, unit_price, unit_cost, subtotal, notes
    )
    VALUES (
      v_invoice_id, r.pid,
      r.brand || ' ' || r.model || ' ' || COALESCE(r.color, '') || ' • Size ' || COALESCE(r.size::text, '') || ' • ' || r.sku,
      r.qty, r.price, r.hpp, r.qty * r.price, NULL
    );

    UPDATE products SET quantity = quantity - r.qty, updated_at = now()
    WHERE id = r.pid AND quantity >= r.qty;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'Stok % % size % tidak cukup', r.brand, r.model, r.size;
    END IF;

    INSERT INTO stock_movements (
      product_id, type, quantity, unit_cost, reference_type, reference_id, notes, performed_by
    )
    VALUES (
      r.pid, 'outbound', r.qty, r.hpp, 'pos_invoice', v_invoice_id, 'POS Kasir Offline', v_uid
    );
  END LOOP;

  v_sales_lines := jsonb_build_array(
    jsonb_build_object('code', '1.1.04', 'debit', v_total, 'credit', 0, 'description', 'Piutang penjualan')
  );
  IF v_discount > 0 THEN
    v_sales_lines := v_sales_lines || jsonb_build_object('code', '6.2', 'debit', v_discount, 'credit', 0, 'description', 'Beban diskon & promosi');
  END IF;
  v_sales_lines := v_sales_lines || jsonb_build_object('code', '4.1.01', 'debit', 0, 'credit', v_subtotal, 'description', 'Pendapatan penjualan');
  IF v_tax > 0 THEN
    v_sales_lines := v_sales_lines || jsonb_build_object('code', '2.1.02', 'debit', 0, 'credit', v_tax, 'description', 'Hutang pajak (PPN)');
  END IF;
  IF v_cogs > 0 THEN
    v_sales_lines := v_sales_lines
      || jsonb_build_object('code', '5.1', 'debit', v_cogs, 'credit', 0, 'description', 'HPP barang terjual')
      || jsonb_build_object('code', '1.1.05', 'debit', 0, 'credit', v_cogs, 'description', 'Persediaan keluar');
  END IF;
  PERFORM public.app_post_journal(
    v_invoice_date, 'Invoice penjualan ' || v_invoice_number,
    'sales_invoice'::journal_source, v_invoice_id, v_uid, v_sales_lines
  );

  v_payment_number := public.generate_customer_payment_number();
  INSERT INTO customer_payments (
    payment_number, customer_id, customer_name, payment_date, amount,
    payment_method, bank_account_id, reference_no, notes, attachment_url, created_by
  )
  VALUES (
    v_payment_number, v_customer_id, v_customer_name, v_invoice_date, v_total,
    v_payment_method, v_bank_id, COALESCE(v_reference_no, v_invoice_number), 'Pembayaran POS', NULL, v_uid
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO customer_payment_allocations (payment_id, invoice_id, amount)
  VALUES (v_payment_id, v_invoice_id, v_total);

  UPDATE sales_invoices SET paid_amount = v_total, status = 'paid' WHERE id = v_invoice_id;

  v_new_balance := v_bank.current_balance + v_total;
  UPDATE bank_accounts SET current_balance = v_new_balance WHERE id = v_bank_id;

  INSERT INTO bank_transactions (
    bank_account_id, transaction_date, type, amount, balance_after,
    reference_no, description, related_entity_type, related_entity_id, created_by
  )
  VALUES (
    v_bank_id, v_invoice_date, 'credit', v_total, v_new_balance,
    v_payment_number, 'POS ' || v_invoice_number, 'pos_checkout', v_invoice_id, v_uid
  );

  v_pay_lines := jsonb_build_array(
    jsonb_build_object('code', v_bank_code, 'debit', v_total, 'credit', 0, 'description', 'Kas/Bank masuk'),
    jsonb_build_object('code', '1.1.04', 'debit', 0, 'credit', v_total, 'description', 'Pelunasan piutang')
  );
  PERFORM public.app_post_journal(
    v_invoice_date, 'Penerimaan customer ' || v_payment_number,
    'customer_payment'::journal_source, v_payment_id, v_uid, v_pay_lines
  );

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'payment_id', v_payment_id,
    'payment_number', v_payment_number,
    'total', v_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pos_checkout(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_checkout(jsonb) TO authenticated;

COMMENT ON FUNCTION public.pos_checkout(jsonb) IS
  'Atomic POS checkout: invoice + lines + stock + movements + sales journal + payment + allocation + bank + payment journal in one transaction.';
