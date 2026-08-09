-- Atomic payroll edit.
-- Reverses the latest posted payroll journal/bank effect, replaces payroll
-- lines, then posts the revised payroll in one DB transaction.

CREATE OR REPLACE FUNCTION public.update_payroll_run_atomic(
  p_run_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid                  uuid := auth.uid();
  v_period_month         text := NULLIF(btrim(p_payload->>'period_month'), '');
  v_payment_date         date := (p_payload->>'payment_date')::date;
  v_bank_id              uuid := NULLIF(p_payload->>'bank_account_id', '')::uuid;
  v_notes                text := NULLIF(p_payload->>'notes', '');
  v_existing             record;
  v_old_bank             record;
  v_new_bank             record;
  v_line_count           int := 0;
  v_gross                numeric := 0;
  v_deductions           numeric := 0;
  v_net                  numeric := 0;
  v_entry                record;
  v_reverse_id           uuid;
  v_reverse_number       text;
  v_entry_id             uuid;
  v_entry_number         text;
  v_salary_expense_id    uuid;
  v_salary_payable_id    uuid;
  v_payroll_liability_id uuid;
  v_bank_account_id      uuid;
  v_bank_code            text;
  v_new_balance          numeric;
  v_reversed_journals    int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan';
  END IF;

  IF NOT public.has_any_role(ARRAY['owner','finance']::user_role[]) THEN
    RAISE EXCEPTION 'Tidak berhak mengedit payroll';
  END IF;

  IF v_period_month IS NULL OR v_period_month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Periode payroll tidak valid';
  END IF;

  IF p_payload->'lines' IS NULL OR jsonb_typeof(p_payload->'lines') <> 'array' THEN
    RAISE EXCEPTION 'Line payroll wajib array';
  END IF;

  CREATE TEMP TABLE _payroll_edit_lines (
    employee_id uuid,
    base_salary numeric,
    allowances numeric,
    deductions numeric,
    net_salary numeric,
    notes text
  ) ON COMMIT DROP;

  INSERT INTO _payroll_edit_lines (
    employee_id, base_salary, allowances, deductions, net_salary, notes
  )
  SELECT
    (line->>'employee_id')::uuid,
    COALESCE((line->>'base_salary')::numeric, 0),
    COALESCE((line->>'allowances')::numeric, 0),
    COALESCE((line->>'deductions')::numeric, 0),
    COALESCE((line->>'base_salary')::numeric, 0)
      + COALESCE((line->>'allowances')::numeric, 0)
      - COALESCE((line->>'deductions')::numeric, 0),
    NULLIF(line->>'notes', '')
  FROM jsonb_array_elements(p_payload->'lines') AS t(line);

  SELECT count(*) INTO v_line_count FROM _payroll_edit_lines;
  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Minimal 1 line payroll diperlukan';
  END IF;

  IF EXISTS (
    SELECT 1 FROM _payroll_edit_lines
    WHERE base_salary < 0 OR allowances < 0 OR deductions < 0 OR net_salary < 0
  ) THEN
    RAISE EXCEPTION 'Nilai payroll tidak boleh negatif dan potongan tidak boleh melebihi gaji';
  END IF;

  IF (SELECT count(*) FROM _payroll_edit_lines)
     <> (SELECT count(DISTINCT employee_id) FROM _payroll_edit_lines) THEN
    RAISE EXCEPTION 'Karyawan duplikat pada payroll';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _payroll_edit_lines pl
    LEFT JOIN employees e ON e.id = pl.employee_id
    WHERE e.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Ada karyawan payroll yang tidak ditemukan';
  END IF;

  SELECT
    COALESCE(sum(base_salary + allowances), 0),
    COALESCE(sum(deductions), 0),
    COALESCE(sum(net_salary), 0)
  INTO v_gross, v_deductions, v_net
  FROM _payroll_edit_lines;

  IF v_gross <= 0 THEN
    RAISE EXCEPTION 'Total payroll harus lebih dari 0';
  END IF;

  SELECT *
  INTO v_existing
  FROM payroll_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Payroll tidak ditemukan';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM payroll_runs
    WHERE period_month = v_period_month
      AND id <> p_run_id
  ) THEN
    RAISE EXCEPTION 'Payroll periode ini sudah dibuat';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM bank_transactions
    WHERE related_entity_type = 'payroll_run'
      AND related_entity_id = p_run_id
      AND is_reconciled = true
  ) THEN
    RAISE EXCEPTION 'Payroll sudah punya mutasi bank yang direkonsiliasi';
  END IF;

  IF v_existing.bank_account_id IS NOT NULL AND v_existing.net_amount > 0 THEN
    SELECT *
    INTO v_old_bank
    FROM bank_accounts
    WHERE id = v_existing.bank_account_id
    FOR UPDATE;

    IF v_old_bank.id IS NOT NULL THEN
      UPDATE bank_accounts
      SET current_balance = v_old_bank.current_balance + v_existing.net_amount
      WHERE id = v_old_bank.id;
    END IF;

    DELETE FROM bank_transactions
    WHERE related_entity_type = 'payroll_run'
      AND related_entity_id = p_run_id;
  END IF;

  FOR v_entry IN
    SELECT id, entry_number, source_type, source_id, total_debit, total_credit
    FROM journal_entries
    WHERE source_type = 'other'::journal_source
      AND source_id = p_run_id
      AND status = 'posted'
      AND description NOT ILIKE 'Reverse %'
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
      'Reverse ' || v_entry.entry_number || ' — edit payroll',
      v_entry.source_type,
      v_entry.source_id,
      v_entry.total_credit,
      v_entry.total_debit,
      'posted',
      'Edit payroll',
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

    v_reversed_journals := v_reversed_journals + 1;
  END LOOP;

  SELECT id INTO v_salary_expense_id
  FROM chart_of_accounts
  WHERE code = '6.5';
  SELECT id INTO v_salary_payable_id
  FROM chart_of_accounts
  WHERE code = '2.1.03';
  SELECT id INTO v_payroll_liability_id
  FROM chart_of_accounts
  WHERE code = '2.1.04';

  IF v_salary_expense_id IS NULL OR v_salary_payable_id IS NULL THEN
    RAISE EXCEPTION 'COA payroll belum lengkap';
  END IF;

  IF v_bank_id IS NOT NULL AND v_net > 0 THEN
    SELECT *
    INTO v_new_bank
    FROM bank_accounts
    WHERE id = v_bank_id
    FOR UPDATE;

    IF v_new_bank.id IS NULL OR v_new_bank.is_active = false THEN
      RAISE EXCEPTION 'Akun bank/kas payroll tidak aktif';
    END IF;

    IF v_new_bank.current_balance < v_net THEN
      RAISE EXCEPTION 'Saldo akun bank/kas tidak cukup untuk payroll';
    END IF;

    v_bank_account_id := v_new_bank.coa_account_id;
    IF v_bank_account_id IS NULL THEN
      v_bank_code := CASE v_new_bank.type::text
        WHEN 'cash' THEN '1.1.01'
        WHEN 'marketplace_balance' THEN '1.1.03'
        ELSE '1.1.02'
      END;
      SELECT id INTO v_bank_account_id
      FROM chart_of_accounts
      WHERE code = v_bank_code;
    END IF;

    IF v_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'COA kas/bank payroll tidak ditemukan';
    END IF;

    v_new_balance := v_new_bank.current_balance - v_net;

    UPDATE bank_accounts
    SET current_balance = v_new_balance
    WHERE id = v_new_bank.id;

    INSERT INTO bank_transactions (
      bank_account_id, transaction_date, type, amount, balance_after,
      description, related_entity_type, related_entity_id, is_reconciled, created_by
    )
    VALUES (
      v_new_bank.id,
      v_payment_date,
      'debit',
      v_net,
      v_new_balance,
      'Pembayaran payroll ' || v_period_month,
      'payroll_run',
      p_run_id,
      false,
      v_uid
    );
  END IF;

  DELETE FROM payroll_lines
  WHERE payroll_run_id = p_run_id;

  INSERT INTO payroll_lines (
    payroll_run_id, employee_id, base_salary, allowances, deductions, net_salary, notes
  )
  SELECT p_run_id, employee_id, base_salary, allowances, deductions, net_salary, notes
  FROM _payroll_edit_lines;

  v_entry_number := public.generate_journal_entry_number();

  INSERT INTO journal_entries (
    entry_number, entry_date, description, source_type, source_id,
    total_debit, total_credit, status, notes, created_by
  )
  VALUES (
    v_entry_number,
    v_payment_date,
    'Payroll ' || v_period_month,
    'other',
    p_run_id,
    v_gross,
    v_gross,
    'posted',
    v_notes,
    v_uid
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO journal_lines (
    entry_id, account_id, debit, credit, description, line_order
  )
  VALUES (
    v_entry_id,
    v_salary_expense_id,
    v_gross,
    0,
    'Beban gaji gross',
    0
  );

  IF v_net > 0 THEN
    INSERT INTO journal_lines (
      entry_id, account_id, debit, credit, description, line_order
    )
    VALUES (
      v_entry_id,
      COALESCE(v_bank_account_id, v_salary_payable_id),
      0,
      v_net,
      CASE WHEN v_bank_id IS NULL THEN 'Hutang gaji' ELSE 'Pembayaran gaji' END,
      1
    );
  END IF;

  IF v_deductions > 0 THEN
    IF v_payroll_liability_id IS NULL THEN
      RAISE EXCEPTION 'COA hutang payroll deduction belum lengkap';
    END IF;

    INSERT INTO journal_lines (
      entry_id, account_id, debit, credit, description, line_order
    )
    VALUES (
      v_entry_id,
      v_payroll_liability_id,
      0,
      v_deductions,
      'Hutang BPJS / PPh / potongan payroll',
      2
    );
  END IF;

  UPDATE payroll_runs
  SET period_month = v_period_month,
      payment_date = v_payment_date,
      bank_account_id = v_bank_id,
      gross_amount = v_gross,
      deductions = v_deductions,
      net_amount = v_net,
      status = 'posted',
      notes = v_notes,
      journal_entry_id = v_entry_id
  WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'id', p_run_id,
    'journal_id', v_entry_id,
    'gross', v_gross,
    'deductions', v_deductions,
    'net', v_net,
    'reversed_journals', v_reversed_journals
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_payroll_run_atomic(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_payroll_run_atomic(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.update_payroll_run_atomic(uuid, jsonb) IS
  'Atomically edits a posted payroll run by reversing prior bank/journal effects, replacing payroll lines, and posting the revised payroll.';
