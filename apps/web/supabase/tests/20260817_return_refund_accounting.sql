-- Regression coverage for atomic refund accounting.
-- Run only against a disposable/test database after applying
-- 20260817103247_return_refund_accounting.sql. Every fixture is rolled back.

BEGIN;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

DO $test$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_product_id uuid;
  v_session_id uuid;
  v_item_id uuid;
  v_return_id uuid;
  v_bank_coa_id uuid;
  v_bank_id uuid;
  v_result jsonb;
  v_amount numeric;
  v_count integer;
  v_uuid uuid;
BEGIN
  INSERT INTO auth.users(id) VALUES (v_user_id);
  INSERT INTO public.profiles(id, full_name, email, roles, is_active)
  VALUES (
    v_user_id,
    'Return Refund Test Owner',
    'return-refund-test@example.invalid',
    ARRAY['owner']::public.user_role[],
    true
  );
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  INSERT INTO public.chart_of_accounts(
    code, name, type, normal_balance, is_active, is_system
  )
  VALUES
    ('1.1.05', 'Persediaan', 'asset', 'debit', true, true),
    ('4.1', 'Pendapatan Penjualan', 'revenue', 'credit', true, true),
    ('4.1.90', 'Retur Penjualan', 'revenue', 'debit', true, true),
    ('5.1', 'Harga Pokok Penjualan', 'cogs', 'debit', true, true)
  ON CONFLICT (code) DO UPDATE
  SET is_active = true;

  INSERT INTO public.chart_of_accounts(
    code, name, type, normal_balance, is_active, is_system
  )
  VALUES (
    '1.1.98-' || substr(v_user_id::text, 1, 8),
    'Rekening Refund Test',
    'asset',
    'debit',
    true,
    false
  )
  RETURNING id INTO v_bank_coa_id;

  INSERT INTO public.bank_accounts(
    name, type, opening_balance, current_balance, is_active, coa_account_id
  )
  VALUES ('Rekening Refund Test', 'bank', 1000, 1000, true, v_bank_coa_id)
  RETURNING id INTO v_bank_id;

  INSERT INTO public.products(
    brand, model, sku, size, size_label, barcode,
    quantity, hpp, sell_price, price_offline
  )
  VALUES (
    'Test',
    'Refund',
    'TEST-REFUND-' || substr(v_user_id::text, 1, 8),
    42,
    '42',
    'TEST-REFUND-' || substr(v_user_id::text, 1, 8) || '-42',
    0,
    50,
    300,
    300
  )
  RETURNING id INTO v_product_id;

  INSERT INTO public.packing_sessions(
    platform, platform_order_id, courier, status, packed_by, created_by
  )
  VALUES ('shopee', 'TEST-REFUND-ORDER', 'jne', 'completed', v_user_id, v_user_id)
  RETURNING id INTO v_session_id;

  INSERT INTO public.packing_items(
    packing_session_id, product_id, barcode_scanned, sell_price, unit_hpp
  )
  VALUES (v_session_id, v_product_id, 'TEST-REFUND-BARCODE', 300, 50)
  RETURNING id INTO v_item_id;

  INSERT INTO public.returns(
    packing_item_id,
    type,
    reason,
    original_product_id,
    original_size,
    status,
    verified_by,
    verified_at
  )
  VALUES (
    v_item_id,
    'refund',
    'Regression refund',
    v_product_id,
    42,
    'verified',
    v_user_id,
    now()
  )
  RETURNING id INTO v_return_id;

  SELECT public.process_return_atomic(
    v_return_id,
    NULL,
    v_bank_id,
    300,
    current_date,
    'TEST-REFUND-REF'
  )
  INTO v_result;

  IF COALESCE((v_result->>'already_processed')::boolean, true) THEN
    RAISE EXCEPTION 'First refund call was unexpectedly idempotent: %', v_result;
  END IF;

  SELECT quantity INTO v_count
  FROM public.products WHERE id = v_product_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Refund stock is %, expected 1', v_count;
  END IF;

  SELECT current_balance INTO v_amount
  FROM public.bank_accounts WHERE id = v_bank_id;
  IF v_amount <> 700 THEN
    RAISE EXCEPTION 'Refund bank balance is %, expected 700', v_amount;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.bank_transactions
  WHERE related_entity_type = 'return_refund'
    AND related_entity_id = v_return_id
    AND bank_account_id = v_bank_id
    AND type = 'debit'
    AND amount = 300
    AND counterpart_account_id = (
      SELECT id FROM public.chart_of_accounts WHERE code = '4.1.90'
    );
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected one refund bank transaction, got %', v_count;
  END IF;

  SELECT refund_journal_entry_id INTO v_uuid
  FROM public.returns
  WHERE id = v_return_id
    AND status = 'processed'
    AND refund_amount = 300
    AND refund_bank_account_id = v_bank_id
    AND refund_reference_no = 'TEST-REFUND-REF';
  IF v_uuid IS NULL THEN
    RAISE EXCEPTION 'Processed return is missing refund settlement fields';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.journal_lines line
  JOIN public.chart_of_accounts coa ON coa.id = line.account_id
  WHERE line.entry_id = v_uuid
    AND (
      (coa.code = '4.1.90' AND line.debit = 300 AND line.credit = 0)
      OR
      (coa.id = v_bank_coa_id AND line.debit = 0 AND line.credit = 300)
    );
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Refund financial journal does not contain both expected lines';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.stock_movements
  WHERE reference_type = 'return'
    AND reference_id = v_return_id
    AND product_id = v_product_id
    AND type = 'return_in'
    AND quantity = 1
    AND unit_cost = 50;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected one return_in stock movement, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.activity_logs
  WHERE entity_type = 'return'
    AND entity_id = v_return_id
    AND action = 'process';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected one atomic return audit log, got %', v_count;
  END IF;

  SELECT public.process_return_atomic(
    v_return_id,
    NULL,
    v_bank_id,
    300,
    current_date,
    'TEST-REFUND-REF'
  )
  INTO v_result;

  IF NOT COALESCE((v_result->>'already_processed')::boolean, false) THEN
    RAISE EXCEPTION 'Second refund call was not idempotent: %', v_result;
  END IF;

  SELECT current_balance INTO v_amount
  FROM public.bank_accounts WHERE id = v_bank_id;
  IF v_amount <> 700 THEN
    RAISE EXCEPTION 'Idempotent refund changed bank balance to %', v_amount;
  END IF;

  UPDATE public.profiles
  SET roles = ARRAY['admin_gudang']::public.user_role[]
  WHERE id = v_user_id;

  UPDATE public.returns
  SET status = 'verified',
      processed_by = NULL,
      processed_at = NULL,
      refund_amount = NULL,
      refund_bank_account_id = NULL,
      refund_bank_transaction_id = NULL,
      refund_journal_entry_id = NULL,
      refund_inventory_journal_entry_id = NULL,
      refund_date = NULL,
      refund_reference_no = NULL,
      refund_settled_at = NULL,
      refund_settled_by = NULL
  WHERE id = v_return_id;

  BEGIN
    PERFORM public.process_return_atomic(
      v_return_id,
      NULL,
      v_bank_id,
      100,
      current_date,
      NULL
    );
    RAISE EXCEPTION 'Admin Gudang unexpectedly settled a cash refund';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'Admin Gudang unexpectedly settled a cash refund' THEN
        RAISE;
      END IF;
      IF SQLERRM NOT LIKE '%Owner atau Finance%' THEN
        RAISE EXCEPTION 'Unexpected role-gate error: %', SQLERRM;
      END IF;
  END;

  SELECT current_balance INTO v_amount
  FROM public.bank_accounts WHERE id = v_bank_id;
  IF v_amount <> 700 THEN
    RAISE EXCEPTION 'Rejected refund changed bank balance to %', v_amount;
  END IF;
END;
$test$;

ROLLBACK;
