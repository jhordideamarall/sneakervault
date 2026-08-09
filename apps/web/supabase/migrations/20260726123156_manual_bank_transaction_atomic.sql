-- Record a manual cash/bank movement, its GL journal, balance changes, linked
-- interbank subledger movement, and activity audit in one transaction.

CREATE OR REPLACE FUNCTION public.create_manual_bank_transaction_atomic(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bank_id uuid := NULLIF(p_payload->>'bank_account_id', '')::uuid;
  v_counterpart_account_id uuid :=
    NULLIF(p_payload->>'counterpart_account_id', '')::uuid;
  v_transaction_date date := (p_payload->>'transaction_date')::date;
  v_type public.bank_transaction_type :=
    (p_payload->>'type')::public.bank_transaction_type;
  v_amount numeric := COALESCE((p_payload->>'amount')::numeric, 0);
  v_reference_no text := NULLIF(
    btrim(COALESCE(p_payload->>'reference_no', '')),
    ''
  );
  v_description text := NULLIF(
    btrim(COALESCE(p_payload->>'description', '')),
    ''
  );
  v_bank record;
  v_counterpart_bank record;
  v_bank_account_id uuid;
  v_counterpart_bank_id uuid;
  v_linked_bank_count integer := 0;
  v_new_balance numeric;
  v_counterpart_new_balance numeric;
  v_transaction_id uuid;
  v_counterpart_transaction_id uuid;
  v_is_transfer boolean := false;
  v_journal_description text;
  v_journal_lines jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_any_role(
    ARRAY['owner','finance']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak membuat mutasi kas/bank';
  END IF;

  IF v_bank_id IS NULL OR v_counterpart_account_id IS NULL THEN
    RAISE EXCEPTION 'Akun kas/bank dan akun lawan wajib dipilih';
  END IF;
  IF v_transaction_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal transaksi wajib diisi';
  END IF;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Tipe mutasi wajib diisi';
  END IF;
  IF v_amount <= 0 OR v_amount = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Jumlah mutasi harus lebih dari 0';
  END IF;
  IF v_description IS NULL THEN
    RAISE EXCEPTION 'Deskripsi mutasi wajib diisi';
  END IF;

  IF private.is_fiscal_period_closed(v_transaction_date) THEN
    RAISE EXCEPTION 'Periode fiskal mutasi kas/bank sudah ditutup';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.chart_of_accounts coa
    WHERE coa.id = v_counterpart_account_id
      AND coa.is_active = true
  ) THEN
    RAISE EXCEPTION 'Akun lawan transaksi tidak ditemukan atau tidak aktif';
  END IF;

  -- A counterpart COA linked to another bank means an interbank transfer. The
  -- UI remains one form, but both bank subledgers are moved automatically.
  SELECT count(*)
  INTO v_linked_bank_count
  FROM public.bank_accounts bank
  WHERE bank.coa_account_id = v_counterpart_account_id;

  IF v_linked_bank_count > 1 THEN
    RAISE EXCEPTION
      'Akun lawan terhubung ke lebih dari satu rekening bank';
  ELSIF v_linked_bank_count = 1 THEN
    SELECT bank.id
    INTO v_counterpart_bank_id
    FROM public.bank_accounts bank
    WHERE bank.coa_account_id = v_counterpart_account_id;
  END IF;

  -- Acquire every involved bank row in UUID order. This makes two opposite
  -- transfer requests use the same lock order instead of deadlocking.
  PERFORM bank.id
  FROM public.bank_accounts bank
  WHERE bank.id = v_bank_id
     OR bank.id = v_counterpart_bank_id
  ORDER BY bank.id
  FOR UPDATE;

  SELECT *
  INTO v_bank
  FROM public.bank_accounts bank
  WHERE bank.id = v_bank_id;

  IF NOT FOUND OR NOT v_bank.is_active THEN
    RAISE EXCEPTION 'Akun kas/bank tidak aktif';
  END IF;

  IF v_bank.coa_account_id IS NOT NULL THEN
    SELECT coa.id
    INTO v_bank_account_id
    FROM public.chart_of_accounts coa
    WHERE coa.id = v_bank.coa_account_id
      AND coa.is_active = true;

    IF v_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'COA rekening kas/bank tidak aktif';
    END IF;
  ELSE
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

  IF v_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'Mapping COA rekening kas/bank belum tersedia';
  END IF;
  IF v_bank_account_id = v_counterpart_account_id THEN
    RAISE EXCEPTION 'Akun lawan tidak boleh sama dengan COA rekening';
  END IF;

  v_is_transfer := v_counterpart_bank_id IS NOT NULL;
  IF v_is_transfer THEN
    IF v_counterpart_bank_id = v_bank_id THEN
      RAISE EXCEPTION 'Rekening tujuan transfer harus berbeda';
    END IF;

    SELECT *
    INTO v_counterpart_bank
    FROM public.bank_accounts bank
    WHERE bank.id = v_counterpart_bank_id;

    IF NOT FOUND
       OR NOT v_counterpart_bank.is_active
       OR v_counterpart_bank.coa_account_id
          IS DISTINCT FROM v_counterpart_account_id THEN
      RAISE EXCEPTION 'Rekening lawan transfer tidak aktif atau berubah';
    END IF;
    IF v_counterpart_bank.currency <> v_bank.currency THEN
      RAISE EXCEPTION 'Transfer antar mata uang belum didukung';
    END IF;
  END IF;

  v_new_balance := CASE v_type
    WHEN 'debit'::public.bank_transaction_type
      THEN v_bank.current_balance - v_amount
    ELSE v_bank.current_balance + v_amount
  END;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION
      'Saldo % tidak cukup: saldo %, transaksi %',
      v_bank.name,
      v_bank.current_balance,
      v_amount;
  END IF;

  IF v_is_transfer THEN
    v_counterpart_new_balance := CASE v_type
      WHEN 'debit'::public.bank_transaction_type
        THEN v_counterpart_bank.current_balance + v_amount
      ELSE v_counterpart_bank.current_balance - v_amount
    END;

    IF v_counterpart_new_balance < 0 THEN
      RAISE EXCEPTION
        'Saldo % tidak cukup: saldo %, transaksi %',
        v_counterpart_bank.name,
        v_counterpart_bank.current_balance,
        v_amount;
    END IF;
  END IF;

  UPDATE public.bank_accounts
  SET current_balance = v_new_balance,
      updated_at = now()
  WHERE id = v_bank_id;

  IF v_is_transfer THEN
    UPDATE public.bank_accounts
    SET current_balance = v_counterpart_new_balance,
        updated_at = now()
    WHERE id = v_counterpart_bank_id;
  END IF;

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
    is_reconciled,
    created_by
  )
  VALUES (
    v_bank_id,
    v_counterpart_account_id,
    v_transaction_date,
    v_type,
    v_amount,
    v_new_balance,
    v_reference_no,
    v_description,
    CASE WHEN v_is_transfer THEN 'bank_transfer' ELSE 'manual' END,
    NULL,
    false,
    v_uid
  )
  RETURNING id INTO v_transaction_id;

  IF v_is_transfer THEN
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
      is_reconciled,
      created_by
    )
    VALUES (
      v_counterpart_bank_id,
      v_bank_account_id,
      v_transaction_date,
      CASE v_type
        WHEN 'debit'::public.bank_transaction_type
          THEN 'credit'::public.bank_transaction_type
        ELSE 'debit'::public.bank_transaction_type
      END,
      v_amount,
      v_counterpart_new_balance,
      v_reference_no,
      v_description,
      'bank_transfer',
      v_transaction_id,
      false,
      v_uid
    )
    RETURNING id INTO v_counterpart_transaction_id;

    UPDATE public.bank_transactions
    SET related_entity_id = v_counterpart_transaction_id
    WHERE id = v_transaction_id;
  END IF;

  v_journal_description :=
    CASE WHEN v_is_transfer
      THEN 'Transfer antarbank - '
      ELSE 'Mutasi kas/bank manual - '
    END
    || v_description
    || CASE
      WHEN v_reference_no IS NULL THEN ''
      ELSE ' (' || v_reference_no || ')'
    END;

  v_journal_lines := CASE v_type
    WHEN 'credit'::public.bank_transaction_type THEN
      jsonb_build_array(
        jsonb_build_object(
          'account_id', v_bank_account_id,
          'debit', v_amount,
          'credit', 0,
          'description', 'Kas/Bank masuk'
        ),
        jsonb_build_object(
          'account_id', v_counterpart_account_id,
          'debit', 0,
          'credit', v_amount,
          'description', CASE
            WHEN v_is_transfer THEN 'Rekening sumber transfer'
            ELSE 'Akun lawan penerimaan'
          END
        )
      )
    ELSE
      jsonb_build_array(
        jsonb_build_object(
          'account_id', v_counterpart_account_id,
          'debit', v_amount,
          'credit', 0,
          'description', CASE
            WHEN v_is_transfer THEN 'Rekening tujuan transfer'
            ELSE 'Akun lawan pengeluaran'
          END
        ),
        jsonb_build_object(
          'account_id', v_bank_account_id,
          'debit', 0,
          'credit', v_amount,
          'description', 'Kas/Bank keluar'
        )
      )
  END;

  PERFORM private.post_atomic_journal(
    v_transaction_date,
    v_journal_description,
    'other'::public.journal_source,
    v_transaction_id,
    v_uid,
    v_journal_lines
  );

  INSERT INTO public.activity_logs(
    user_id,
    action,
    entity_type,
    entity_id,
    new_data
  )
  VALUES (
    v_uid,
    CASE WHEN v_is_transfer THEN 'transfer' ELSE 'create' END,
    'bank_transaction',
    v_transaction_id,
    jsonb_build_object(
      'bank_account_id', v_bank_id,
      'bank_account', v_bank.name,
      'type', v_type,
      'amount', v_amount,
      'description', v_description,
      'counterpart_account_id', v_counterpart_account_id,
      'counterpart_bank_account_id', v_counterpart_bank_id,
      'counterpart_transaction_id', v_counterpart_transaction_id
    )
  );

  RETURN jsonb_build_object(
    'id', v_transaction_id,
    'bank_account_id', v_bank_id,
    'counterpart_account_id', v_counterpart_account_id,
    'transaction_date', v_transaction_date,
    'type', v_type,
    'amount', v_amount,
    'balance_after', v_new_balance,
    'reference_no', v_reference_no,
    'description', v_description,
    'is_transfer', v_is_transfer,
    'counterpart_bank_account_id', v_counterpart_bank_id,
    'counterpart_transaction_id', v_counterpart_transaction_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_bank_transaction_atomic(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_bank_transaction_atomic(jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.create_manual_bank_transaction_atomic(jsonb) IS
  'Atomically posts a manual cash/bank mutation or interbank transfer to both bank subledgers, the GL, and activity audit.';
