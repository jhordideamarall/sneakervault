-- Regression coverage for:
-- - active reservations blocking inbound-stock deletion;
-- - over-reservation rejection;
-- - free-text PO size matching;
-- - POS reservation protection;
-- - bank-specific COA posting for POS and marketplace settlement.
--
-- Run only against a disposable/test database after applying:
--   20260726120234_logistics_reservation_size_integrity.sql
--   20260726120800_bank_coa_posting_integrity.sql
--   20260726123156_manual_bank_transaction_atomic.sql
--
-- Every fixture is rolled back.

BEGIN;

DO $test$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_supplier_id uuid;
  v_pre_order_id uuid;
  v_pre_order_line_id uuid;
  v_product_id uuid;
  v_invoice_id uuid;
  v_po_id uuid;
  v_po_line_id uuid;
  v_receipt_id uuid;
  v_stock_movement_id uuid;
  v_existing_free_text_product_id uuid;
  v_custom_bank_coa_id uuid;
  v_second_bank_coa_id uuid;
  v_ar_coa_id uuid;
  v_bank_id uuid;
  v_second_bank_id uuid;
  v_pos_product_id uuid;
  v_marketplace_invoice_id uuid;
  v_result jsonb;
  v_count integer;
  v_amount numeric;
  v_uuid uuid;
BEGIN
  INSERT INTO auth.users(
    id,
    email,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    'integrity-test@example.invalid',
    jsonb_build_object('full_name', 'Integrity Test Owner'),
    now(),
    now()
  );

  INSERT INTO public.profiles(id, full_name, email, roles, is_active)
  VALUES (
    v_user_id,
    'Integrity Test Owner',
    'integrity-test@example.invalid',
    ARRAY['owner']::public.user_role[],
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET roles = EXCLUDED.roles,
      is_active = EXCLUDED.is_active;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  INSERT INTO public.suppliers(name)
  VALUES ('Integrity Test Supplier')
  RETURNING id INTO v_supplier_id;

  INSERT INTO public.pre_orders(
    source,
    channel,
    customer_name,
    status,
    created_by
  )
  VALUES (
    'manual',
    'manual',
    'Integrity Test Customer',
    'review',
    v_user_id
  )
  RETURNING id INTO v_pre_order_id;

  -- Manual purchase invoice: physical 5, reserved 3, inbound reversal 3.
  -- Physical-only validation would allow deletion; unreserved validation must
  -- block it because only 2 units are actually available.
  INSERT INTO public.products(
    brand,
    model,
    sku,
    size,
    size_label,
    barcode,
    quantity,
    hpp,
    sell_price,
    price_offline
  )
  VALUES (
    'Test',
    'Manual Invoice',
    'TEST-RES-INV',
    42,
    '42',
    'TEST-RES-INV-42',
    5,
    100,
    150,
    150
  )
  RETURNING id INTO v_product_id;

  INSERT INTO public.pre_order_lines(
    pre_order_id,
    product_id,
    sku,
    product_name,
    size_label,
    size_value,
    requested_qty,
    reserved_qty,
    purchase_qty,
    status
  )
  VALUES (
    v_pre_order_id,
    v_product_id,
    'TEST-RES-INV',
    'Test Manual Invoice',
    '42',
    42,
    5,
    3,
    2,
    'needs_purchase'
  )
  RETURNING id INTO v_pre_order_line_id;

  INSERT INTO public.stock_reservations(
    pre_order_line_id,
    product_id,
    quantity,
    status,
    created_by
  )
  VALUES (
    v_pre_order_line_id,
    v_product_id,
    3,
    'active',
    v_user_id
  );

  INSERT INTO public.purchase_invoices(
    invoice_number,
    supplier_id,
    invoice_date,
    subtotal,
    tax,
    total,
    status,
    created_by
  )
  VALUES (
    'TEST-PI-RESERVED',
    v_supplier_id,
    current_date,
    300,
    0,
    300,
    'unpaid',
    v_user_id
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.purchase_invoice_lines(
    invoice_id,
    product_id,
    product_label,
    qty,
    unit_cost,
    subtotal
  )
  VALUES (
    v_invoice_id,
    v_product_id,
    'Test Manual Invoice - Size 42',
    3,
    100,
    300
  );

  SELECT public.delete_purchase_invoice_atomic(v_invoice_id)
  INTO v_result;

  IF COALESCE((v_result->>'deleted')::boolean, true)
     OR v_result->>'blocker_stage' <> 'stock_usage' THEN
    RAISE EXCEPTION
      'Manual invoice reservation blocker failed: %',
      v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_invoices
    WHERE id = v_invoice_id
  ) THEN
    RAISE EXCEPTION 'Blocked manual invoice was unexpectedly deleted';
  END IF;

  -- A second active allocation would make reserved quantity 6 over physical 5.
  BEGIN
    INSERT INTO public.stock_reservations(
      pre_order_line_id,
      product_id,
      quantity,
      status,
      created_by
    )
    VALUES (
      v_pre_order_line_id,
      v_product_id,
      3,
      'active',
      v_user_id
    );

    RAISE EXCEPTION 'Expected active over-reservation to fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Stok tersedia tidak cukup untuk reservasi:%' THEN
        RAISE;
      END IF;
  END;

  -- Purchase receipt uses the same unreserved-stock rule.
  INSERT INTO public.products(
    brand,
    model,
    sku,
    size,
    size_label,
    barcode,
    quantity,
    hpp,
    sell_price,
    price_offline
  )
  VALUES (
    'Test',
    'Receipt',
    'TEST-RES-RCV',
    43,
    '43',
    'TEST-RES-RCV-43',
    5,
    100,
    150,
    150
  )
  RETURNING id INTO v_product_id;

  INSERT INTO public.pre_order_lines(
    pre_order_id,
    product_id,
    sku,
    product_name,
    size_label,
    size_value,
    requested_qty,
    reserved_qty,
    purchase_qty,
    status
  )
  VALUES (
    v_pre_order_id,
    v_product_id,
    'TEST-RES-RCV',
    'Test Receipt',
    '43',
    43,
    5,
    3,
    2,
    'needs_purchase'
  )
  RETURNING id INTO v_pre_order_line_id;

  INSERT INTO public.stock_reservations(
    pre_order_line_id,
    product_id,
    quantity,
    status,
    created_by
  )
  VALUES (
    v_pre_order_line_id,
    v_product_id,
    3,
    'active',
    v_user_id
  );

  INSERT INTO public.purchase_orders(
    po_number,
    supplier_id,
    order_date,
    status,
    subtotal,
    tax,
    shipping,
    total,
    payment_type,
    created_by
  )
  VALUES (
    'TEST-PO-RESERVED',
    v_supplier_id,
    current_date,
    'receiving',
    300,
    0,
    0,
    300,
    'credit',
    v_user_id
  )
  RETURNING id INTO v_po_id;

  INSERT INTO public.purchase_order_lines(
    po_id,
    product_id,
    ordered_qty,
    received_qty,
    unit_cost,
    subtotal
  )
  VALUES (
    v_po_id,
    v_product_id,
    3,
    3,
    100,
    300
  )
  RETURNING id INTO v_po_line_id;

  INSERT INTO public.stock_movements(
    product_id,
    type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    performed_by
  )
  VALUES (
    v_product_id,
    'inbound',
    3,
    100,
    'purchase_order_line',
    v_po_line_id,
    v_user_id
  )
  RETURNING id INTO v_stock_movement_id;

  INSERT INTO public.purchase_receipts(
    receipt_number,
    po_id,
    receipt_date,
    created_by
  )
  VALUES (
    'TEST-RCV-RESERVED',
    v_po_id,
    current_date,
    v_user_id
  )
  RETURNING id INTO v_receipt_id;

  INSERT INTO public.purchase_receipt_lines(
    receipt_id,
    po_line_id,
    product_id,
    stock_movement_id,
    quantity,
    unit_cost
  )
  VALUES (
    v_receipt_id,
    v_po_line_id,
    v_product_id,
    v_stock_movement_id,
    3,
    100
  );

  SELECT public.delete_purchase_receipt_atomic(v_receipt_id)
  INTO v_result;

  IF COALESCE((v_result->>'deleted')::boolean, true)
     OR v_result->>'blocker_stage' <> 'stock_usage' THEN
    RAISE EXCEPTION
      'Purchase receipt reservation blocker failed: %',
      v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_receipts
    WHERE id = v_receipt_id
  ) THEN
    RAISE EXCEPTION 'Blocked purchase receipt was unexpectedly deleted';
  END IF;

  -- A PO line with new_size NULL must still match an existing SKU + free-text
  -- label before brand/model/numeric-size creation requirements are checked.
  INSERT INTO public.products(
    brand,
    model,
    sku,
    size,
    size_label,
    barcode,
    quantity,
    hpp,
    sell_price,
    price_offline
  )
  VALUES (
    'Adidas',
    'Test Free Text',
    'TEST-FREE-TEXT',
    42.67,
    '42 2/3',
    'TEST-FREE-TEXT-42-2-3',
    0,
    0,
    200,
    200
  )
  RETURNING id INTO v_existing_free_text_product_id;

  INSERT INTO public.purchase_orders(
    po_number,
    supplier_id,
    order_date,
    status,
    subtotal,
    tax,
    shipping,
    total,
    payment_type,
    created_by
  )
  VALUES (
    'TEST-PO-FREE-TEXT',
    v_supplier_id,
    current_date,
    'approved',
    200,
    0,
    0,
    200,
    'credit',
    v_user_id
  )
  RETURNING id INTO v_po_id;

  INSERT INTO public.purchase_order_lines(
    po_id,
    product_id,
    ordered_qty,
    received_qty,
    unit_cost,
    subtotal,
    new_sku,
    new_size,
    new_size_label
  )
  VALUES (
    v_po_id,
    NULL,
    2,
    0,
    100,
    200,
    'TEST-FREE-TEXT',
    NULL,
    '42 2/3'
  )
  RETURNING id INTO v_po_line_id;

  SELECT public.receive_purchase_order_atomic(
    jsonb_build_object(
      'po_id', v_po_id,
      'lines', jsonb_build_array(
        jsonb_build_object(
          'line_id', v_po_line_id,
          'receive_qty', 1
        )
      )
    )
  )
  INTO v_result;

  IF v_result->>'new_status' <> 'receiving' THEN
    RAISE EXCEPTION 'Unexpected free-text receive result: %', v_result;
  END IF;

  SELECT product_id
  INTO v_uuid
  FROM public.purchase_order_lines
  WHERE id = v_po_line_id;

  IF v_uuid IS DISTINCT FROM v_existing_free_text_product_id THEN
    RAISE EXCEPTION
      'Free-text receive created/matched the wrong product: expected %, got %',
      v_existing_free_text_product_id,
      v_uuid;
  END IF;

  SELECT quantity
  INTO v_count
  FROM public.products
  WHERE id = v_existing_free_text_product_id;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Free-text matched product quantity is %, expected 1',
      v_count;
  END IF;

  SELECT new_size
  INTO v_amount
  FROM public.purchase_order_lines
  WHERE id = v_po_line_id;

  IF round(v_amount, 2) <> 42.67 THEN
    RAISE EXCEPTION 'Free-text numeric normalization is %, expected 42.67',
      v_amount;
  END IF;

  -- Seed only the accounts needed by POS/settlement. Omitting generic bank
  -- code 1.1.02 makes the test fail if the RPC regresses to generic posting.
  INSERT INTO public.chart_of_accounts(
    code,
    name,
    type,
    normal_balance,
    is_active
  )
  VALUES
    ('1.1.04', 'Test Piutang', 'asset', 'debit', true),
    ('1.1.05', 'Test Persediaan', 'asset', 'debit', true),
    ('4.1.01', 'Test Pendapatan Offline', 'revenue', 'credit', true),
    ('5.1', 'Test HPP', 'cogs', 'debit', true),
    ('6.1', 'Test Biaya Marketplace', 'expense', 'debit', true);

  SELECT id
  INTO v_ar_coa_id
  FROM public.chart_of_accounts
  WHERE code = '1.1.04';

  INSERT INTO public.chart_of_accounts(
    code,
    name,
    type,
    normal_balance,
    is_active
  )
  VALUES (
    '1.1.90',
    'Test Bank BCA Operasional',
    'asset',
    'debit',
    true
  )
  RETURNING id INTO v_custom_bank_coa_id;

  INSERT INTO public.bank_accounts(
    name,
    type,
    opening_balance,
    current_balance,
    coa_account_id
  )
  VALUES (
    'Test Bank BCA Operasional',
    'bank',
    100,
    100,
    v_custom_bank_coa_id
  )
  RETURNING id INTO v_bank_id;

  INSERT INTO public.products(
    brand,
    model,
    sku,
    size,
    size_label,
    barcode,
    quantity,
    hpp,
    sell_price,
    price_offline
  )
  VALUES (
    'Test',
    'POS',
    'TEST-POS-BANK',
    44,
    '44',
    'TEST-POS-BANK-44',
    2,
    20,
    100,
    100
  )
  RETURNING id INTO v_pos_product_id;

  SELECT public.pos_checkout(
    jsonb_build_object(
      'invoice_date', current_date,
      'discount', 0,
      'tax', 0,
      'customer_name', 'POS Test Customer',
      'payment_method', 'bank_transfer',
      'bank_account_id', v_bank_id,
      'lines', jsonb_build_array(
        jsonb_build_object(
          'product_id', v_pos_product_id,
          'qty', 1,
          'unit_price', 100
        )
      )
    )
  )
  INTO v_result;

  SELECT count(*)
  INTO v_count
  FROM public.journal_entries entry
  JOIN public.journal_lines line ON line.entry_id = entry.id
  WHERE entry.source_type = 'customer_payment'
    AND entry.source_id = (v_result->>'payment_id')::uuid
    AND line.account_id = v_custom_bank_coa_id
    AND line.debit = 100
    AND line.credit = 0;

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'POS payment was not posted to the selected bank COA';
  END IF;

  SELECT counterpart_account_id
  INTO v_uuid
  FROM public.bank_transactions
  WHERE related_entity_type = 'pos_checkout'
    AND related_entity_id = (v_result->>'invoice_id')::uuid;

  IF v_uuid IS DISTINCT FROM v_ar_coa_id THEN
    RAISE EXCEPTION 'POS bank transaction counterpart is %, expected %',
      v_uuid,
      v_ar_coa_id;
  END IF;

  -- Reserve the remaining physical unit, then verify POS cannot consume it.
  INSERT INTO public.pre_order_lines(
    pre_order_id,
    product_id,
    sku,
    product_name,
    size_label,
    size_value,
    requested_qty,
    reserved_qty,
    purchase_qty,
    status
  )
  VALUES (
    v_pre_order_id,
    v_pos_product_id,
    'TEST-POS-BANK',
    'Test POS',
    '44',
    44,
    1,
    1,
    0,
    'ready_from_stock'
  )
  RETURNING id INTO v_pre_order_line_id;

  INSERT INTO public.stock_reservations(
    pre_order_line_id,
    product_id,
    quantity,
    status,
    created_by
  )
  VALUES (
    v_pre_order_line_id,
    v_pos_product_id,
    1,
    'active',
    v_user_id
  );

  BEGIN
    PERFORM public.pos_checkout(
      jsonb_build_object(
        'invoice_date', current_date,
        'discount', 0,
        'tax', 0,
        'customer_name', 'Reserved POS Test Customer',
        'payment_method', 'bank_transfer',
        'bank_account_id', v_bank_id,
        'lines', jsonb_build_array(
          jsonb_build_object(
            'product_id', v_pos_product_id,
            'qty', 1,
            'unit_price', 100
          )
        )
      )
    );

    RAISE EXCEPTION 'Expected POS sale of reserved stock to fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Stok % tidak cukup' THEN
        RAISE;
      END IF;
  END;

  SELECT current_balance
  INTO v_amount
  FROM public.bank_accounts
  WHERE id = v_bank_id;

  IF v_amount <> 200 THEN
    RAISE EXCEPTION
      'Failed reserved-stock POS changed bank balance to %, expected 200',
      v_amount;
  END IF;

  INSERT INTO public.sales_invoices(
    invoice_number,
    customer_name,
    channel,
    invoice_date,
    subtotal,
    discount,
    shipping,
    marketplace_fee,
    tax,
    total,
    paid_amount,
    status,
    marketplace_order_id,
    settlement_status,
    created_by
  )
  VALUES (
    'TEST-SHOPEE-SETTLEMENT',
    'Shopee Test Customer',
    'shopee',
    current_date,
    100,
    0,
    0,
    0,
    0,
    100,
    0,
    'issued',
    'TEST-SHOPEE-ORDER-1',
    'none',
    v_user_id
  )
  RETURNING id INTO v_marketplace_invoice_id;

  SELECT public.settle_marketplace_atomic(
    jsonb_build_object(
      'channel', 'shopee',
      'bank_account_id', v_bank_id,
      'settled_date', current_date,
      'settlement_ref', 'TEST-SETTLEMENT-1',
      'items', jsonb_build_array(
        jsonb_build_object(
          'order_id', 'TEST-SHOPEE-ORDER-1',
          'net', 90,
          'fee', 10
        )
      )
    )
  )
  INTO v_result;

  IF (v_result->>'matched')::integer <> 1 THEN
    RAISE EXCEPTION 'Marketplace settlement did not match invoice: %',
      v_result;
  END IF;

  SELECT count(*)
  INTO v_count
  FROM public.journal_entries entry
  JOIN public.journal_lines line ON line.entry_id = entry.id
  WHERE entry.source_type = 'customer_payment'
    AND entry.source_id = (
      SELECT payment_id
      FROM public.customer_payment_allocations
      WHERE invoice_id = v_marketplace_invoice_id
      LIMIT 1
    )
    AND line.account_id = v_custom_bank_coa_id
    AND line.debit = 90
    AND line.credit = 0;

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'Marketplace settlement was not posted to the selected bank COA';
  END IF;

  SELECT counterpart_account_id
  INTO v_uuid
  FROM public.bank_transactions
  WHERE reference_no = 'TEST-SETTLEMENT-1';

  IF v_uuid IS DISTINCT FROM v_ar_coa_id THEN
    RAISE EXCEPTION
      'Settlement bank transaction counterpart is %, expected %',
      v_uuid,
      v_ar_coa_id;
  END IF;

  SELECT current_balance
  INTO v_amount
  FROM public.bank_accounts
  WHERE id = v_bank_id;

  IF v_amount <> 290 THEN
    RAISE EXCEPTION 'Final test bank balance is %, expected 290', v_amount;
  END IF;

  -- A regular manual receipt must update the bank subledger, GL, and audit in
  -- one RPC transaction.
  SELECT public.create_manual_bank_transaction_atomic(
    jsonb_build_object(
      'bank_account_id', v_bank_id,
      'counterpart_account_id', (
        SELECT id
        FROM public.chart_of_accounts
        WHERE code = '4.1.01'
      ),
      'transaction_date', current_date,
      'type', 'credit',
      'amount', 25,
      'reference_no', 'TEST-MANUAL-IN-1',
      'description', 'Penerimaan manual test'
    )
  )
  INTO v_result;

  IF COALESCE((v_result->>'is_transfer')::boolean, true) THEN
    RAISE EXCEPTION 'Regular manual receipt was marked as transfer: %',
      v_result;
  END IF;

  SELECT current_balance
  INTO v_amount
  FROM public.bank_accounts
  WHERE id = v_bank_id;

  IF v_amount <> 315 THEN
    RAISE EXCEPTION 'Manual receipt bank balance is %, expected 315',
      v_amount;
  END IF;

  SELECT count(*)
  INTO v_count
  FROM public.journal_entries entry
  JOIN public.journal_lines line ON line.entry_id = entry.id
  WHERE entry.source_type = 'other'
    AND entry.source_id = (v_result->>'id')::uuid
    AND line.account_id = v_custom_bank_coa_id
    AND line.debit = 25
    AND line.credit = 0;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Manual receipt bank journal is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.activity_logs
    WHERE entity_type = 'bank_transaction'
      AND entity_id = (v_result->>'id')::uuid
      AND action = 'create'
  ) THEN
    RAISE EXCEPTION 'Manual receipt activity audit is missing';
  END IF;

  -- A failed withdrawal must leave no balance, transaction, journal, or audit
  -- mutation because the whole RPC is one database transaction.
  BEGIN
    PERFORM public.create_manual_bank_transaction_atomic(
      jsonb_build_object(
        'bank_account_id', v_bank_id,
        'counterpart_account_id', (
          SELECT id
          FROM public.chart_of_accounts
          WHERE code = '6.1'
        ),
        'transaction_date', current_date,
        'type', 'debit',
        'amount', 400,
        'reference_no', 'TEST-MANUAL-FAIL-1',
        'description', 'Pengeluaran melebihi saldo'
      )
    );

    RAISE EXCEPTION 'Expected insufficient manual withdrawal to fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Saldo % tidak cukup:%' THEN
        RAISE;
      END IF;
  END;

  SELECT current_balance
  INTO v_amount
  FROM public.bank_accounts
  WHERE id = v_bank_id;

  IF v_amount <> 315 OR EXISTS (
    SELECT 1
    FROM public.bank_transactions
    WHERE reference_no = 'TEST-MANUAL-FAIL-1'
  ) THEN
    RAISE EXCEPTION
      'Failed manual withdrawal left a partial mutation';
  END IF;

  -- Selecting another bank's COA is an interbank transfer: both subledgers
  -- move, while the GL records only bank-to-bank debit/credit.
  INSERT INTO public.chart_of_accounts(
    code,
    name,
    type,
    normal_balance,
    is_active
  )
  VALUES (
    '1.1.91',
    'Test Bank Mandiri Payroll',
    'asset',
    'debit',
    true
  )
  RETURNING id INTO v_second_bank_coa_id;

  INSERT INTO public.bank_accounts(
    name,
    type,
    opening_balance,
    current_balance,
    coa_account_id
  )
  VALUES (
    'Test Bank Mandiri Payroll',
    'bank',
    50,
    50,
    v_second_bank_coa_id
  )
  RETURNING id INTO v_second_bank_id;

  SELECT public.create_manual_bank_transaction_atomic(
    jsonb_build_object(
      'bank_account_id', v_bank_id,
      'counterpart_account_id', v_second_bank_coa_id,
      'transaction_date', current_date,
      'type', 'debit',
      'amount', 40,
      'reference_no', 'TEST-BANK-TRANSFER-1',
      'description', 'Transfer BCA ke Mandiri'
    )
  )
  INTO v_result;

  IF NOT COALESCE((v_result->>'is_transfer')::boolean, false)
     OR (v_result->>'counterpart_bank_account_id')::uuid
        IS DISTINCT FROM v_second_bank_id
     OR NULLIF(v_result->>'counterpart_transaction_id', '') IS NULL THEN
    RAISE EXCEPTION 'Interbank transfer result is incomplete: %', v_result;
  END IF;

  SELECT current_balance
  INTO v_amount
  FROM public.bank_accounts
  WHERE id = v_bank_id;

  IF v_amount <> 275 THEN
    RAISE EXCEPTION 'Transfer source balance is %, expected 275', v_amount;
  END IF;

  SELECT current_balance
  INTO v_amount
  FROM public.bank_accounts
  WHERE id = v_second_bank_id;

  IF v_amount <> 90 THEN
    RAISE EXCEPTION 'Transfer destination balance is %, expected 90', v_amount;
  END IF;

  SELECT count(*)
  INTO v_count
  FROM public.bank_transactions
  WHERE reference_no = 'TEST-BANK-TRANSFER-1'
    AND related_entity_type = 'bank_transfer';

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Interbank transfer produced % subledger rows, expected 2',
      v_count;
  END IF;

  SELECT count(*)
  INTO v_count
  FROM public.journal_entries entry
  JOIN public.journal_lines line ON line.entry_id = entry.id
  WHERE entry.source_type = 'other'
    AND entry.source_id = (v_result->>'id')::uuid
    AND line.account_id IN (
      v_custom_bank_coa_id,
      v_second_bank_coa_id
    );

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Interbank transfer journal has % bank lines, expected 2',
      v_count;
  END IF;

  -- The RPC independently enforces fiscal-period closure, even if a caller
  -- bypasses the server action's friendly pre-check.
  INSERT INTO public.fiscal_periods(
    year,
    month,
    status,
    closed_by,
    closed_at,
    notes
  )
  VALUES (
    extract(year FROM current_date)::integer,
    extract(month FROM current_date)::integer,
    'closed',
    v_user_id,
    now(),
    'Integrity regression test'
  );

  BEGIN
    PERFORM public.create_manual_bank_transaction_atomic(
      jsonb_build_object(
        'bank_account_id', v_bank_id,
        'counterpart_account_id', (
          SELECT id
          FROM public.chart_of_accounts
          WHERE code = '4.1.01'
        ),
        'transaction_date', current_date,
        'type', 'credit',
        'amount', 1,
        'reference_no', 'TEST-CLOSED-PERIOD-1',
        'description', 'Closed period test'
      )
    );

    RAISE EXCEPTION 'Expected closed-period bank mutation to fail';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'Periode fiskal mutasi kas/bank sudah ditutup' THEN
        RAISE;
      END IF;
  END;

  IF EXISTS (
    SELECT 1
    FROM public.bank_transactions
    WHERE reference_no = 'TEST-CLOSED-PERIOD-1'
  ) THEN
    RAISE EXCEPTION 'Closed-period mutation left a bank transaction';
  END IF;

  RAISE NOTICE
    'accounting/logistics regression scenarios passed';
END;
$test$;

ROLLBACK;
