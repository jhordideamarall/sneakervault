-- Post cash movements to the COA account linked to the selected bank account.
-- The bank subledger (bank_accounts/bank_transactions) and General Ledger must
-- therefore move together, including under concurrent POS and settlement
-- requests.

CREATE OR REPLACE FUNCTION public.app_post_journal(
  p_entry_date date,
  p_description text,
  p_source_type public.journal_source,
  p_source_id uuid,
  p_user_id uuid,
  p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_entry_id uuid;
  v_entry_number text;
  v_account_id uuid;
  v_line jsonb;
  v_idx integer := 0;
BEGIN
  SELECT COALESCE(sum((item.value->>'debit')::numeric), 0),
         COALESCE(sum((item.value->>'credit')::numeric), 0)
  INTO v_total_debit, v_total_credit
  FROM jsonb_array_elements(
    COALESCE(p_lines, '[]'::jsonb)
  ) AS item(value);

  IF abs(v_total_debit - v_total_credit) > 0.01
     OR v_total_debit <= 0 THEN
    RAISE EXCEPTION 'Journal not balanced: dr=% cr=%',
      v_total_debit,
      v_total_credit;
  END IF;

  v_entry_number := public.generate_journal_entry_number();

  INSERT INTO public.journal_entries(
    entry_number,
    entry_date,
    description,
    source_type,
    source_id,
    total_debit,
    total_credit,
    status,
    created_by
  )
  VALUES (
    v_entry_number,
    p_entry_date,
    p_description,
    p_source_type,
    p_source_id,
    v_total_debit,
    v_total_credit,
    'posted',
    p_user_id
  )
  RETURNING id INTO v_entry_id;

  FOR v_line IN
    SELECT value
    FROM jsonb_array_elements(p_lines)
  LOOP
    v_account_id := NULL;

    IF NULLIF(v_line->>'account_id', '') IS NOT NULL THEN
      SELECT coa.id
      INTO v_account_id
      FROM public.chart_of_accounts coa
      WHERE coa.id = (v_line->>'account_id')::uuid
        AND coa.is_active = true;
    ELSE
      SELECT coa.id
      INTO v_account_id
      FROM public.chart_of_accounts coa
      WHERE coa.code = COALESCE(
        NULLIF(v_line->>'code', ''),
        NULLIF(v_line->>'account_code', '')
      )
        AND coa.is_active = true
      LIMIT 1;
    END IF;

    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'CoA account % not found or inactive',
        COALESCE(
          v_line->>'account_id',
          v_line->>'code',
          v_line->>'account_code'
        );
    END IF;

    INSERT INTO public.journal_lines(
      entry_id,
      account_id,
      debit,
      credit,
      description,
      line_order
    )
    VALUES (
      v_entry_id,
      v_account_id,
      COALESCE((v_line->>'debit')::numeric, 0),
      COALESCE((v_line->>'credit')::numeric, 0),
      NULLIF(v_line->>'description', ''),
      v_idx
    );
    v_idx := v_idx + 1;
  END LOOP;

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.app_post_journal(
  date, text, public.journal_source, uuid, uuid, jsonb
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pos_checkout(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invoice_date date := (p_payload->>'invoice_date')::date;
  v_discount numeric := COALESCE((p_payload->>'discount')::numeric, 0);
  v_tax numeric := COALESCE((p_payload->>'tax')::numeric, 0);
  v_customer_id uuid := NULLIF(p_payload->>'customer_id', '')::uuid;
  v_customer_name text := COALESCE(
    NULLIF(btrim(p_payload->>'customer_name'), ''),
    'Walk-in Customer'
  );
  v_payment_method public.payment_method :=
    (p_payload->>'payment_method')::public.payment_method;
  v_bank_id uuid := (p_payload->>'bank_account_id')::uuid;
  v_reference_no text := NULLIF(p_payload->>'reference_no', '');
  v_notes text := COALESCE(
    NULLIF(p_payload->>'notes', ''),
    'POS Kasir Offline'
  );

  v_bank record;
  v_bank_account_id uuid;
  v_ar_account_id uuid;
  v_distinct_ids integer;
  v_found_ids integer;
  v_subtotal numeric := 0;
  v_cogs numeric := 0;
  v_total numeric;
  v_invoice_number text;
  v_invoice_id uuid;
  v_payment_number text;
  v_payment_id uuid;
  v_new_balance numeric;
  v_physical_quantity integer;
  v_reserved_quantity integer;
  r record;
  v_sales_lines jsonb;
  v_pay_lines jsonb;
BEGIN
  IF NOT public.has_any_role(
    ARRAY['owner','shopkeeper','finance']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak melakukan POS checkout';
  END IF;

  -- Fail fast on an invalid payment account. The row is locked again only
  -- after product locks have been acquired, matching the product -> bank lock
  -- order used by POS cancellation and avoiding an inverse-order deadlock.
  SELECT id,
         name,
         current_balance,
         type,
         is_active,
         coa_account_id
  INTO v_bank
  FROM public.bank_accounts
  WHERE id = v_bank_id;

  IF v_bank.id IS NULL OR v_bank.is_active = false THEN
    RAISE EXCEPTION 'Akun kas/bank tidak aktif';
  END IF;

  DROP TABLE IF EXISTS pg_temp._pos_cart;
  CREATE TEMP TABLE _pos_cart ON COMMIT DROP AS
  WITH raw AS (
    SELECT (line->>'product_id')::uuid AS pid,
           (line->>'qty')::integer AS qty,
           (line->>'unit_price')::numeric AS price,
           ord
    FROM jsonb_array_elements(p_payload->'lines')
      WITH ORDINALITY AS item(line, ord)
  ),
  agg AS (
    SELECT pid,
           sum(qty)::integer AS qty,
           (array_agg(price ORDER BY ord DESC))[1] AS price
    FROM raw
    GROUP BY pid
  )
  SELECT a.pid,
         a.qty,
         a.price,
         p.brand,
         p.model,
         p.color,
         p.size,
         p.sku,
         p.hpp,
         p.is_active
  FROM agg a
  JOIN public.products p ON p.id = a.pid;

  SELECT count(DISTINCT (line->>'product_id'))
  INTO v_distinct_ids
  FROM jsonb_array_elements(p_payload->'lines') line;

  SELECT count(*)
  INTO v_found_ids
  FROM pg_temp._pos_cart;

  IF v_found_ids <> v_distinct_ids THEN
    RAISE EXCEPTION 'Beberapa produk POS tidak ditemukan';
  END IF;

  SELECT COALESCE(sum(qty * price), 0),
         COALESCE(sum(hpp * qty), 0)
  INTO v_subtotal, v_cogs
  FROM pg_temp._pos_cart;

  v_total := greatest(0, v_subtotal - v_discount + v_tax);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Total POS harus lebih dari 0';
  END IF;

  v_invoice_number := public.generate_sales_invoice_number();
  INSERT INTO public.sales_invoices(
    invoice_number,
    customer_id,
    customer_name,
    channel,
    invoice_date,
    due_date,
    subtotal,
    discount,
    shipping,
    marketplace_fee,
    tax,
    total,
    paid_amount,
    status,
    marketplace_order_id,
    notes,
    created_by
  )
  VALUES (
    v_invoice_number,
    v_customer_id,
    v_customer_name,
    'offline',
    v_invoice_date,
    NULL,
    v_subtotal,
    v_discount,
    0,
    0,
    v_tax,
    v_total,
    0,
    'issued',
    NULL,
    v_notes,
    v_uid
  )
  RETURNING id INTO v_invoice_id;

  FOR r IN
    SELECT *
    FROM pg_temp._pos_cart
    ORDER BY pid
  LOOP
    IF r.is_active = false THEN
      RAISE EXCEPTION 'Produk % sudah tidak aktif', r.sku;
    END IF;

    INSERT INTO public.sales_invoice_lines(
      invoice_id,
      product_id,
      product_label,
      qty,
      unit_price,
      unit_cost,
      subtotal,
      notes
    )
    VALUES (
      v_invoice_id,
      r.pid,
      r.brand || ' ' || r.model || ' ' || COALESCE(r.color, '')
        || ' • Size ' || COALESCE(r.size::text, '')
        || ' • ' || r.sku,
      r.qty,
      r.price,
      r.hpp,
      r.qty * r.price,
      NULL
    );

    -- Reservation creation uses the same product-row lock. Read reservations
    -- only after acquiring it so POS cannot sell stock already promised to a
    -- Pre Order, including during concurrent reservation writes.
    SELECT p.quantity
    INTO v_physical_quantity
    FROM public.products p
    WHERE p.id = r.pid
    FOR UPDATE;

    SELECT COALESCE(sum(sr.quantity), 0)::integer
    INTO v_reserved_quantity
    FROM public.stock_reservations sr
    WHERE sr.product_id = r.pid
      AND sr.status = 'active'::public.stock_reservation_status;

    IF v_physical_quantity - v_reserved_quantity < r.qty THEN
      RAISE EXCEPTION 'Stok % % size % tidak cukup',
        r.brand,
        r.model,
        r.size;
    END IF;

    UPDATE public.products
    SET quantity = v_physical_quantity - r.qty,
        updated_at = now()
    WHERE id = r.pid;

    INSERT INTO public.stock_movements(
      product_id,
      type,
      quantity,
      unit_cost,
      reference_type,
      reference_id,
      notes,
      performed_by
    )
    VALUES (
      r.pid,
      'outbound',
      r.qty,
      r.hpp,
      'pos_invoice',
      v_invoice_id,
      'POS Kasir Offline',
      v_uid
    );
  END LOOP;

  v_sales_lines := jsonb_build_array(
    jsonb_build_object(
      'code', '1.1.04',
      'debit', v_total,
      'credit', 0,
      'description', 'Piutang penjualan'
    )
  );
  IF v_discount > 0 THEN
    v_sales_lines := v_sales_lines || jsonb_build_object(
      'code', '6.2',
      'debit', v_discount,
      'credit', 0,
      'description', 'Beban diskon & promosi'
    );
  END IF;
  v_sales_lines := v_sales_lines || jsonb_build_object(
    'code', '4.1.01',
    'debit', 0,
    'credit', v_subtotal,
    'description', 'Pendapatan penjualan'
  );
  IF v_tax > 0 THEN
    v_sales_lines := v_sales_lines || jsonb_build_object(
      'code', '2.1.02',
      'debit', 0,
      'credit', v_tax,
      'description', 'Hutang pajak (PPN)'
    );
  END IF;
  IF v_cogs > 0 THEN
    v_sales_lines := v_sales_lines
      || jsonb_build_object(
        'code', '5.1',
        'debit', v_cogs,
        'credit', 0,
        'description', 'HPP barang terjual'
      )
      || jsonb_build_object(
        'code', '1.1.05',
        'debit', 0,
        'credit', v_cogs,
        'description', 'Persediaan keluar'
      );
  END IF;

  PERFORM public.app_post_journal(
    v_invoice_date,
    'Invoice penjualan ' || v_invoice_number,
    'sales_invoice'::public.journal_source,
    v_invoice_id,
    v_uid,
    v_sales_lines
  );

  -- Serialize balance writes after all product locks. Re-read mutable bank
  -- configuration so deactivation or COA remapping cannot race the checkout.
  SELECT id,
         name,
         current_balance,
         type,
         is_active,
         coa_account_id
  INTO v_bank
  FROM public.bank_accounts
  WHERE id = v_bank_id;

  IF v_bank.id IS NULL OR v_bank.is_active = false THEN
    RAISE EXCEPTION 'Akun kas/bank tidak aktif';
  END IF;

  v_bank_account_id := v_bank.coa_account_id;
  IF v_bank_account_id IS NULL THEN
    SELECT coa.id
    INTO v_bank_account_id
    FROM public.chart_of_accounts coa
    WHERE coa.code = CASE v_bank.type::text
      WHEN 'cash' THEN '1.1.01'
      WHEN 'marketplace_balance' THEN '1.1.03'
      ELSE '1.1.02'
    END
      AND coa.is_active = true
    LIMIT 1;
  END IF;

  SELECT coa.id
  INTO v_ar_account_id
  FROM public.chart_of_accounts coa
  WHERE coa.code = '1.1.04'
    AND coa.is_active = true
  LIMIT 1;

  IF v_bank_account_id IS NULL OR v_ar_account_id IS NULL THEN
    RAISE EXCEPTION 'Mapping COA kas/bank atau piutang belum lengkap';
  END IF;

  v_payment_number := public.generate_customer_payment_number();
  INSERT INTO public.customer_payments(
    payment_number,
    customer_id,
    customer_name,
    payment_date,
    amount,
    payment_method,
    bank_account_id,
    reference_no,
    notes,
    attachment_url,
    created_by
  )
  VALUES (
    v_payment_number,
    v_customer_id,
    v_customer_name,
    v_invoice_date,
    v_total,
    v_payment_method,
    v_bank_id,
    COALESCE(v_reference_no, v_invoice_number),
    'Pembayaran POS',
    NULL,
    v_uid
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.customer_payment_allocations(
    payment_id,
    invoice_id,
    amount
  )
  VALUES (
    v_payment_id,
    v_invoice_id,
    v_total
  );

  UPDATE public.sales_invoices
  SET paid_amount = v_total,
      status = 'paid'
  WHERE id = v_invoice_id;

  v_new_balance := v_bank.current_balance + v_total;
  UPDATE public.bank_accounts
  SET current_balance = v_new_balance,
      updated_at = now()
  WHERE id = v_bank_id;

  INSERT INTO public.bank_transactions(
    bank_account_id,
    counterpart_account_id,
    transaction_date,
    type,
    amount,
    balance_after,
    reference_no,
    description,
    related_entity_type,
    related_entity_id,
    created_by
  )
  VALUES (
    v_bank_id,
    v_ar_account_id,
    v_invoice_date,
    'credit',
    v_total,
    v_new_balance,
    v_payment_number,
    'POS ' || v_invoice_number,
    'pos_checkout',
    v_invoice_id,
    v_uid
  );

  v_pay_lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', v_bank_account_id,
      'debit', v_total,
      'credit', 0,
      'description', 'Kas/Bank masuk'
    ),
    jsonb_build_object(
      'account_id', v_ar_account_id,
      'debit', 0,
      'credit', v_total,
      'description', 'Pelunasan piutang'
    )
  );

  PERFORM public.app_post_journal(
    v_invoice_date,
    'Penerimaan customer ' || v_payment_number,
    'customer_payment'::public.journal_source,
    v_payment_id,
    v_uid,
    v_pay_lines
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

REVOKE ALL ON FUNCTION public.pos_checkout(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_checkout(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.settle_marketplace_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_channel public.customer_channel :=
    (p_payload->>'channel')::public.customer_channel;
  v_channel_txt text := p_payload->>'channel';
  v_bank_id uuid := NULLIF(p_payload->>'bank_account_id', '')::uuid;
  v_date date := COALESCE(
    (p_payload->>'settled_date')::date,
    current_date
  );
  v_ref text := NULLIF(p_payload->>'settlement_ref', '');

  v_matched integer := 0;
  v_skipped integer := 0;
  v_unmatched jsonb := '[]'::jsonb;

  v_item jsonb;
  v_oid text;
  v_net numeric;
  v_fee numeric;
  v_inv record;

  v_bank record;
  v_bank_account_id uuid;
  v_ar_account_id uuid;
  v_new_balance numeric;
  v_payment_id uuid;
  v_payment_number text;
  v_total_net numeric := 0;
  v_total_ar numeric := 0;
  v_delta numeric := 0;
  v_lines jsonb;
BEGIN
  IF NOT public.has_any_role(
    ARRAY['owner','finance']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak rekonsiliasi settlement';
  END IF;

  SELECT id,
         name,
         current_balance,
         type,
         is_active,
         coa_account_id
  INTO v_bank
  FROM public.bank_accounts
  WHERE id = v_bank_id
  FOR UPDATE;

  IF v_bank.id IS NULL OR v_bank.is_active = false THEN
    RAISE EXCEPTION 'Akun bank tujuan pencairan tidak valid';
  END IF;
  IF v_bank.type::text = 'marketplace_balance' THEN
    RAISE EXCEPTION
      'Settlement cair harus masuk ke akun kas/bank, bukan Saldo Marketplace';
  END IF;

  DROP TABLE IF EXISTS pg_temp._settlement_apply;
  CREATE TEMP TABLE _settlement_apply(
    order_id text,
    invoice_id uuid UNIQUE,
    invoice_total numeric,
    net numeric,
    fee numeric
  ) ON COMMIT DROP;

  -- Lock invoices in a deterministic order so duplicate/concurrent settlement
  -- requests cannot both release the same receivable.
  FOR v_item IN
    SELECT item.value
    FROM jsonb_array_elements(
      COALESCE(p_payload->'items', '[]'::jsonb)
    ) AS item(value)
    ORDER BY item.value->>'order_id'
  LOOP
    v_oid := v_item->>'order_id';
    v_net := COALESCE((v_item->>'net')::numeric, 0);
    v_fee := COALESCE((v_item->>'fee')::numeric, 0);

    SELECT id,
           total,
           paid_amount,
           status,
           settlement_status
    INTO v_inv
    FROM public.sales_invoices
    WHERE marketplace_order_id = v_oid
      AND channel = v_channel
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;

    IF v_inv.id IS NULL THEN
      v_unmatched := v_unmatched || to_jsonb(v_oid);
      CONTINUE;
    END IF;

    IF v_inv.settlement_status IN ('released', 'pending') THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_inv.status <> 'issued'
       OR COALESCE(v_inv.paid_amount, 0) > 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_net <= 0 OR v_inv.total <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO pg_temp._settlement_apply(
      order_id,
      invoice_id,
      invoice_total,
      net,
      fee
    )
    VALUES (
      v_oid,
      v_inv.id,
      v_inv.total,
      v_net,
      v_fee
    );
  END LOOP;

  SELECT count(*),
         COALESCE(sum(net), 0),
         COALESCE(sum(invoice_total), 0)
  INTO v_matched, v_total_net, v_total_ar
  FROM pg_temp._settlement_apply;

  IF v_matched > 0 THEN
    -- Invoice rows are already locked in deterministic order. Lock the bank
    -- afterwards, matching payment-deletion lock order and serializing the
    -- balance_after calculation without creating a bank -> invoice cycle.
    SELECT id,
           name,
           current_balance,
           type,
           is_active,
           coa_account_id
    INTO v_bank
    FROM public.bank_accounts
    WHERE id = v_bank_id
    FOR UPDATE;

    IF v_bank.id IS NULL OR v_bank.is_active = false THEN
      RAISE EXCEPTION 'Akun bank tujuan pencairan tidak valid';
    END IF;
    IF v_bank.type::text = 'marketplace_balance' THEN
      RAISE EXCEPTION
        'Settlement cair harus masuk ke akun kas/bank, bukan Saldo Marketplace';
    END IF;

    v_bank_account_id := v_bank.coa_account_id;
    IF v_bank_account_id IS NULL THEN
      SELECT coa.id
      INTO v_bank_account_id
      FROM public.chart_of_accounts coa
      WHERE coa.code = CASE v_bank.type::text
        WHEN 'cash' THEN '1.1.01'
        ELSE '1.1.02'
      END
        AND coa.is_active = true
      LIMIT 1;
    END IF;

    SELECT coa.id
    INTO v_ar_account_id
    FROM public.chart_of_accounts coa
    WHERE coa.code = '1.1.04'
      AND coa.is_active = true
    LIMIT 1;

    IF v_bank_account_id IS NULL OR v_ar_account_id IS NULL THEN
      RAISE EXCEPTION 'Mapping COA kas/bank atau piutang belum lengkap';
    END IF;

    v_new_balance := v_bank.current_balance;
    v_payment_number := public.generate_customer_payment_number();

    INSERT INTO public.customer_payments(
      payment_number,
      customer_id,
      customer_name,
      payment_date,
      amount,
      payment_method,
      bank_account_id,
      reference_no,
      notes,
      attachment_url,
      created_by
    )
    VALUES (
      v_payment_number,
      NULL,
      'Marketplace Settlement ' || upper(v_channel_txt),
      v_date,
      v_total_net,
      'marketplace'::public.payment_method,
      v_bank_id,
      COALESCE(v_ref, v_payment_number),
      'Import settlement ' || upper(v_channel_txt),
      NULL,
      v_uid
    )
    RETURNING id INTO v_payment_id;

    INSERT INTO public.customer_payment_allocations(
      payment_id,
      invoice_id,
      amount
    )
    SELECT v_payment_id,
           invoice_id,
           invoice_total
    FROM pg_temp._settlement_apply;

    UPDATE public.sales_invoices si
    SET settlement_status = 'released',
        settled_at = now(),
        settlement_ref = v_ref,
        settlement_fee_actual = settlement.fee,
        settlement_net = settlement.net,
        status = 'paid',
        paid_amount = si.total
    FROM pg_temp._settlement_apply settlement
    WHERE si.id = settlement.invoice_id;

    v_new_balance := v_new_balance + v_total_net;
    UPDATE public.bank_accounts
    SET current_balance = v_new_balance,
        updated_at = now()
    WHERE id = v_bank_id;

    INSERT INTO public.bank_transactions(
      bank_account_id,
      counterpart_account_id,
      transaction_date,
      type,
      amount,
      balance_after,
      reference_no,
      description,
      related_entity_type,
      related_entity_id,
      created_by
    )
    VALUES (
      v_bank_id,
      v_ar_account_id,
      v_date,
      'credit',
      v_total_net,
      v_new_balance,
      COALESCE(v_ref, v_payment_number),
      'Pencairan settlement ' || upper(v_channel_txt),
      'customer_payment',
      v_payment_id,
      v_uid
    );

    v_delta := v_total_ar - v_total_net;
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_id', v_bank_account_id,
        'debit', v_total_net,
        'credit', 0,
        'description', 'Kas/Bank masuk settlement marketplace'
      )
    );
    IF v_delta > 0 THEN
      v_lines := v_lines || jsonb_build_object(
        'code', '6.1',
        'debit', v_delta,
        'credit', 0,
        'description', 'Biaya marketplace aktual'
      );
    ELSIF v_delta < 0 THEN
      v_lines := v_lines || jsonb_build_object(
        'code', '6.1',
        'debit', 0,
        'credit', -v_delta,
        'description', 'Koreksi biaya marketplace'
      );
    END IF;
    v_lines := v_lines || jsonb_build_object(
      'account_id', v_ar_account_id,
      'debit', 0,
      'credit', v_total_ar,
      'description', 'Pelunasan piutang marketplace'
    );

    PERFORM public.app_post_journal(
      v_date,
      'Penerimaan settlement ' || v_payment_number,
      'customer_payment'::public.journal_source,
      v_payment_id,
      v_uid,
      v_lines
    );
  END IF;

  RETURN jsonb_build_object(
    'matched', v_matched,
    'skipped', v_skipped,
    'unmatched', v_unmatched
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_marketplace_atomic(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_marketplace_atomic(jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.app_post_journal(
  date, text, public.journal_source, uuid, uuid, jsonb
) IS
  'Internal balanced-journal poster accepting a COA account ID or legacy account code per line.';
COMMENT ON FUNCTION public.pos_checkout(jsonb) IS
  'Atomic POS checkout that locks the selected bank and posts payment to its linked COA account.';
COMMENT ON FUNCTION public.settle_marketplace_atomic(jsonb) IS
  'Atomic marketplace settlement that locks invoices/bank and posts cash to the selected bank COA account.';
