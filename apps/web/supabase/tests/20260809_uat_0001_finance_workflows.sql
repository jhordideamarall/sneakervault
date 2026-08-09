-- Regression coverage for UAT-0001:
-- - cash PO approval deducts the selected bank exactly once;
-- - opt-in payroll retains named components;
-- - Hutang Gaji can be settled exactly once from cash/bank;
-- - manual invoice customer names resolve idempotently.
--
-- Run only against a disposable/test database after applying
-- 20260808233901_uat_0001_finance_workflows.sql.
-- Every fixture is rolled back.

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
  v_bank_coa_id uuid;
  v_bank_id uuid;
  v_supplier_id uuid;
  v_po_id uuid;
  v_po_line_id uuid;
  v_employee_id uuid;
  v_payroll_id uuid;
  v_customer_id uuid;
  v_same_customer_id uuid;
  v_result jsonb;
  v_amount numeric;
  v_count integer;
BEGIN
  INSERT INTO auth.users(id) VALUES (v_user_id);
  INSERT INTO public.profiles(id, full_name, email, roles, is_active)
  VALUES (
    v_user_id,
    'UAT Test Owner',
    'uat-0001@example.invalid',
    ARRAY['owner']::public.user_role[],
    true
  );
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  INSERT INTO public.chart_of_accounts(
    code,
    name,
    type,
    normal_balance,
    is_active,
    is_system
  )
  VALUES
    ('1.1.02', 'Bank', 'asset', 'debit', true, true),
    ('1.1.05', 'Persediaan', 'asset', 'debit', true, true),
    ('1.1.06', 'Uang Muka Pembelian', 'asset', 'debit', true, true),
    ('2.1.01', 'Hutang Usaha', 'liability', 'credit', true, true),
    ('2.1.02', 'Hutang Pajak', 'liability', 'credit', true, true),
    ('2.1.03', 'Hutang Gaji', 'liability', 'credit', true, true),
    ('2.1.04', 'Hutang Payroll', 'liability', 'credit', true, true),
    ('6.5', 'Beban Gaji', 'expense', 'debit', true, true);

  SELECT id INTO v_bank_coa_id
  FROM public.chart_of_accounts
  WHERE code = '1.1.02';

  INSERT INTO public.bank_accounts(
    name,
    type,
    opening_balance,
    current_balance,
    is_active,
    coa_account_id
  )
  VALUES ('BCA UAT', 'bank', 10000000, 10000000, true, v_bank_coa_id)
  RETURNING id INTO v_bank_id;

  INSERT INTO public.suppliers(name)
  VALUES ('Supplier UAT')
  RETURNING id INTO v_supplier_id;

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
    dp_amount,
    dp_bank_account_id,
    created_by
  )
  VALUES (
    'PO-UAT-0001',
    v_supplier_id,
    current_date,
    'draft',
    900000,
    0,
    100000,
    1000000,
    'cash',
    1000000,
    v_bank_id,
    v_user_id
  )
  RETURNING id INTO v_po_id;

  INSERT INTO public.purchase_order_lines(
    po_id,
    ordered_qty,
    unit_cost,
    subtotal,
    new_brand,
    new_model,
    new_size,
    new_size_label,
    new_color,
    new_sku
  )
  VALUES (
    v_po_id,
    1,
    900000,
    900000,
    'UAT',
    'Cash Approval',
    42,
    '42',
    'Black',
    'UAT-CASH-APPROVAL'
  )
  RETURNING id INTO v_po_line_id;

  SELECT public.approve_purchase_order_atomic(v_po_id) INTO v_result;
  IF v_result->>'status' <> 'approved'
     OR (v_result->>'payment_amount')::numeric <> 1000000 THEN
    RAISE EXCEPTION 'Cash PO approval result invalid: %', v_result;
  END IF;

  SELECT current_balance INTO v_amount
  FROM public.bank_accounts
  WHERE id = v_bank_id;
  IF v_amount <> 9000000 THEN
    RAISE EXCEPTION 'Cash PO approval bank balance invalid: %', v_amount;
  END IF;
  SELECT count(*) INTO v_count
  FROM public.purchase_invoices
  WHERE po_id = v_po_id
    AND status = 'paid';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Cash PO approval must create one paid invoice';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.journal_entries
    WHERE source_id IN (
      SELECT approval_invoice_id FROM public.purchase_orders WHERE id = v_po_id
      UNION ALL
      SELECT approval_payment_id FROM public.purchase_orders WHERE id = v_po_id
    )
      AND total_debit <> total_credit
  ) THEN
    RAISE EXCEPTION 'Cash PO approval created an unbalanced journal';
  END IF;

  SELECT public.receive_purchase_order_with_advance_atomic(
    jsonb_build_object(
      'po_id', v_po_id,
      'notes', 'UAT full receipt',
      'lines', jsonb_build_array(
        jsonb_build_object(
          'line_id', v_po_line_id,
          'receive_qty', 1
        )
      )
    )
  ) INTO v_result;
  IF v_result->>'new_status' <> 'completed' THEN
    RAISE EXCEPTION 'Cash PO receipt result invalid: %', v_result;
  END IF;
  SELECT current_balance INTO v_amount
  FROM public.bank_accounts
  WHERE id = v_bank_id;
  IF v_amount <> 9000000 THEN
    RAISE EXCEPTION 'Cash PO receipt deducted bank a second time: %', v_amount;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_orders
    WHERE id = v_po_id
      AND advance_recognition_journal_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cash PO receipt did not reclassify advance to inventory';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.bank_transactions
  WHERE related_entity_type = 'vendor_payment'
    AND related_entity_id = (
      SELECT approval_payment_id FROM public.purchase_orders WHERE id = v_po_id
    );
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Cash PO must have exactly one bank transaction: %', v_count;
  END IF;

  INSERT INTO public.employees(full_name, base_salary, is_active, created_by)
  VALUES ('Karyawan UAT', 1000000, true, v_user_id)
  RETURNING id INTO v_employee_id;

  SELECT public.create_payroll_run_atomic(
    jsonb_build_object(
      'period_month', '2099-01',
      'payment_date', current_date,
      'bank_account_id', NULL,
      'notes', 'UAT payroll payable',
      'lines', jsonb_build_array(
        jsonb_build_object(
          'employee_id', v_employee_id,
          'base_salary', 1000000,
          'allowances', 200000,
          'deductions', 100000,
          'components', jsonb_build_array(
            jsonb_build_object('name', 'Gaji Pokok', 'kind', 'earning', 'amount', 1000000),
            jsonb_build_object('name', 'Bonus', 'kind', 'earning', 'amount', 200000),
            jsonb_build_object('name', 'BPJS', 'kind', 'deduction', 'amount', 100000)
          )
        )
      )
    )
  ) INTO v_result;
  v_payroll_id := (v_result->>'id')::uuid;

  IF v_result->>'payment_status' <> 'payable'
     OR (v_result->>'net')::numeric <> 1100000 THEN
    RAISE EXCEPTION 'Payroll payable result invalid: %', v_result;
  END IF;
  SELECT count(*) INTO v_count
  FROM public.payroll_line_components component
  JOIN public.payroll_lines line ON line.id = component.payroll_line_id
  WHERE line.payroll_run_id = v_payroll_id;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Named payroll components were not retained: %', v_count;
  END IF;

  SELECT public.update_payroll_run_with_components_atomic(
    v_payroll_id,
    jsonb_build_object(
      'period_month', '2099-01',
      'payment_date', current_date,
      'bank_account_id', NULL,
      'notes', 'UAT payroll revised',
      'lines', jsonb_build_array(
        jsonb_build_object(
          'employee_id', v_employee_id,
          'base_salary', 1000000,
          'allowances', 300000,
          'deductions', 50000,
          'components', jsonb_build_array(
            jsonb_build_object('name', 'Gaji Pokok', 'kind', 'earning', 'amount', 1000000),
            jsonb_build_object('name', 'THR', 'kind', 'earning', 'amount', 300000),
            jsonb_build_object('name', 'PPh 21', 'kind', 'deduction', 'amount', 50000)
          )
        )
      )
    )
  ) INTO v_result;
  IF (v_result->>'net')::numeric <> 1250000 THEN
    RAISE EXCEPTION 'Atomic payroll revision result invalid: %', v_result;
  END IF;
  SELECT count(*) INTO v_count
  FROM public.payroll_line_components component
  JOIN public.payroll_lines line ON line.id = component.payroll_line_id
  WHERE line.payroll_run_id = v_payroll_id
    AND component.name IN ('Gaji Pokok', 'THR', 'PPh 21');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Atomic payroll revision did not replace components: %', v_count;
  END IF;

  SELECT public.settle_payroll_liability_atomic(
    v_payroll_id,
    v_bank_id,
    current_date
  ) INTO v_result;
  IF v_result->>'payment_status' <> 'paid' THEN
    RAISE EXCEPTION 'Payroll settlement result invalid: %', v_result;
  END IF;
  SELECT current_balance INTO v_amount
  FROM public.bank_accounts
  WHERE id = v_bank_id;
  IF v_amount <> 7750000 THEN
    RAISE EXCEPTION 'Payroll settlement bank balance invalid: %', v_amount;
  END IF;

  BEGIN
    PERFORM public.settle_payroll_liability_atomic(
      v_payroll_id,
      v_bank_id,
      current_date
    );
    RAISE EXCEPTION 'Duplicate payroll settlement unexpectedly succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'Duplicate payroll settlement unexpectedly succeeded' THEN
        RAISE;
      END IF;
  END;

  SELECT public.resolve_customer_for_invoice('  Client Manual UAT  ', 'offline')
  INTO v_customer_id;
  SELECT public.resolve_customer_for_invoice('client manual uat', 'offline')
  INTO v_same_customer_id;
  IF v_customer_id <> v_same_customer_id THEN
    RAISE EXCEPTION 'Manual customer resolution created different IDs';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.customers
  WHERE lower(btrim(name)) = 'client manual uat';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Manual customer resolution is not idempotent: %', v_count;
  END IF;
END;
$test$;

ROLLBACK;
