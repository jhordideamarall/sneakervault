-- UAT-0001: client finance and operational workflow corrections.
-- Additive/idempotent. This migration is intentionally not applied to
-- production until the divergent migration history has been reconciled.

-- ---------------------------------------------------------------------------
-- 1. Purchase cash/DP is recognized when the Purchase Order is approved.
-- ---------------------------------------------------------------------------

INSERT INTO public.chart_of_accounts (
  code,
  name,
  type,
  normal_balance,
  parent_id,
  is_active,
  is_system,
  description
)
SELECT
  '1.1.06',
  'Uang Muka Pembelian',
  'asset'::public.coa_type,
  'debit'::public.coa_normal_balance,
  parent.id,
  true,
  true,
  'Pembayaran supplier sebelum barang diterima; direklasifikasi ke persediaan saat PO selesai diterima.'
FROM public.chart_of_accounts parent
WHERE parent.code = '1.1'
  AND NOT EXISTS (
    SELECT 1
    FROM public.chart_of_accounts existing
    WHERE existing.code = '1.1.06'
  );

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS approval_invoice_id uuid
    REFERENCES public.purchase_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_payment_id uuid
    REFERENCES public.vendor_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_payment_type text
    CHECK (approved_payment_type IS NULL OR approved_payment_type IN ('credit', 'cash', 'dp')),
  ADD COLUMN IF NOT EXISTS approved_payment_amount numeric NOT NULL DEFAULT 0
    CHECK (approved_payment_amount >= 0),
  ADD COLUMN IF NOT EXISTS payment_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS advance_recognition_journal_id uuid
    REFERENCES public.journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_approval_invoice_id
  ON public.purchase_orders(approval_invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_approval_payment_id
  ON public.purchase_orders(approval_payment_id);

CREATE OR REPLACE FUNCTION public.approve_purchase_order_atomic(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_po record;
  v_bank record;
  v_invoice_id uuid;
  v_invoice_number text;
  v_payment_id uuid;
  v_payment_number text;
  v_payment_amount numeric := 0;
  v_payment_method public.payment_method;
  v_invoice_status public.purchase_invoice_status;
  v_bank_coa_id uuid;
  v_invoice_journal_id uuid;
  v_payment_journal_id uuid;
  v_invoice_lines jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_any_role(
    ARRAY['owner', 'finance']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak menyetujui Pembelian Barang';
  END IF;

  SELECT *
  INTO v_po
  FROM public.purchase_orders
  WHERE id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pembelian Barang tidak ditemukan';
  END IF;
  IF v_po.status <> 'draft' THEN
    RAISE EXCEPTION 'Hanya Pembelian Barang status Draft yang bisa disetujui';
  END IF;
  IF v_po.total <= 0 THEN
    RAISE EXCEPTION 'Total Pembelian Barang harus lebih dari 0';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fiscal_periods
    WHERE year = extract(year FROM current_date)::integer
      AND month = extract(month FROM current_date)::integer
      AND status = 'closed'
  ) THEN
    RAISE EXCEPTION 'Periode fiskal persetujuan Pembelian Barang sudah ditutup';
  END IF;

  v_payment_amount := CASE v_po.payment_type
    WHEN 'cash' THEN v_po.total
    WHEN 'dp' THEN least(v_po.dp_amount, v_po.total)
    ELSE 0
  END;

  IF v_po.payment_type IN ('cash', 'dp') THEN
    IF v_payment_amount <= 0 THEN
      RAISE EXCEPTION 'Nominal pembayaran awal harus lebih dari 0';
    END IF;
    IF v_po.dp_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'Akun kas/bank wajib dipilih untuk pembayaran awal';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.purchase_invoices WHERE po_id = v_po.id
    ) THEN
      RAISE EXCEPTION 'Pembelian Barang sudah memiliki Faktur Pembelian';
    END IF;

    SELECT *
    INTO v_bank
    FROM public.bank_accounts
    WHERE id = v_po.dp_bank_account_id
    FOR UPDATE;

    IF NOT FOUND OR NOT v_bank.is_active THEN
      RAISE EXCEPTION 'Akun kas/bank pembayaran tidak aktif';
    END IF;
    IF v_bank.current_balance < v_payment_amount THEN
      RAISE EXCEPTION 'Saldo kas/bank tidak cukup untuk pembayaran awal';
    END IF;

    v_invoice_number := private.next_transaction_number('FB', current_date, 4);
    v_invoice_status := CASE
      WHEN v_payment_amount >= v_po.total
        THEN 'paid'::public.purchase_invoice_status
      ELSE 'partial'::public.purchase_invoice_status
    END;

    INSERT INTO public.purchase_invoices (
      invoice_number,
      supplier_id,
      po_id,
      invoice_date,
      due_date,
      subtotal,
      tax,
      total,
      paid_amount,
      status,
      notes,
      created_by
    )
    VALUES (
      v_invoice_number,
      v_po.supplier_id,
      v_po.id,
      current_date,
      NULL,
      v_po.subtotal + v_po.shipping,
      v_po.tax,
      v_po.total,
      v_payment_amount,
      v_invoice_status,
      'Dibuat otomatis saat ' || v_po.po_number || ' disetujui; nilai barang dicatat sebagai uang muka sampai penerimaan selesai.',
      v_uid
    )
    RETURNING id INTO v_invoice_id;

    v_invoice_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code', '1.1.06',
        'debit', v_po.subtotal + v_po.shipping,
        'credit', 0,
        'description', 'Uang muka pembelian sebelum barang diterima'
      )
    );
    IF v_po.tax > 0 THEN
      v_invoice_lines := v_invoice_lines || jsonb_build_array(
        jsonb_build_object(
          'account_code', '2.1.02',
          'debit', v_po.tax,
          'credit', 0,
          'description', 'PPN masukan'
        )
      );
    END IF;
    v_invoice_lines := v_invoice_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', '2.1.01',
        'debit', 0,
        'credit', v_po.total,
        'description', 'Hutang vendor'
      )
    );

    v_invoice_journal_id := private.post_atomic_journal(
      current_date,
      'Faktur uang muka pembelian ' || v_invoice_number,
      'purchase_invoice',
      v_invoice_id,
      v_uid,
      v_invoice_lines
    );

    v_payment_number := private.next_transaction_number('BV', current_date, 4);
    v_payment_method := CASE
      WHEN v_bank.type::text = 'cash' THEN 'cash'::public.payment_method
      ELSE 'bank_transfer'::public.payment_method
    END;

    INSERT INTO public.vendor_payments (
      payment_number,
      supplier_id,
      payment_date,
      amount,
      payment_method,
      bank_account_id,
      notes,
      created_by
    )
    VALUES (
      v_payment_number,
      v_po.supplier_id,
      current_date,
      v_payment_amount,
      v_payment_method,
      v_po.dp_bank_account_id,
      CASE v_po.payment_type
        WHEN 'cash' THEN 'Bayar lunas saat ' || v_po.po_number || ' disetujui'
        ELSE 'DP saat ' || v_po.po_number || ' disetujui'
      END,
      v_uid
    )
    RETURNING id INTO v_payment_id;

    INSERT INTO public.vendor_payment_allocations(payment_id, invoice_id, amount)
    VALUES (v_payment_id, v_invoice_id, v_payment_amount);

    UPDATE public.bank_accounts
    SET current_balance = current_balance - v_payment_amount,
        updated_at = now()
    WHERE id = v_po.dp_bank_account_id;

    INSERT INTO public.bank_transactions (
      bank_account_id,
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
      v_po.dp_bank_account_id,
      current_date,
      'debit',
      v_payment_amount,
      v_bank.current_balance - v_payment_amount,
      v_payment_number,
      'Pembayaran vendor ' || v_payment_number || ' saat PO disetujui',
      'vendor_payment',
      v_payment_id,
      false,
      v_uid
    );

    v_bank_coa_id := v_bank.coa_account_id;
    IF v_bank_coa_id IS NULL THEN
      SELECT id
      INTO v_bank_coa_id
      FROM public.chart_of_accounts
      WHERE code = CASE
        WHEN v_bank.type::text = 'cash' THEN '1.1.01'
        WHEN v_bank.type::text = 'marketplace_balance' THEN '1.1.03'
        ELSE '1.1.02'
      END
        AND is_active = true
      LIMIT 1;
    END IF;
    IF v_bank_coa_id IS NULL THEN
      RAISE EXCEPTION 'COA kas/bank pembayaran tidak ditemukan';
    END IF;

    v_payment_journal_id := private.post_atomic_journal(
      current_date,
      'Pembayaran vendor ' || v_payment_number,
      'vendor_payment',
      v_payment_id,
      v_uid,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', '2.1.01',
          'debit', v_payment_amount,
          'credit', 0,
          'description', 'Pelunasan hutang vendor'
        ),
        jsonb_build_object(
          'account_id', v_bank_coa_id,
          'debit', 0,
          'credit', v_payment_amount,
          'description', 'Kas/Bank keluar'
        )
      )
    );
  END IF;

  UPDATE public.purchase_orders
  SET status = 'approved',
      approved_by = v_uid,
      approved_at = now(),
      approved_payment_type = v_po.payment_type,
      approved_payment_amount = v_payment_amount,
      payment_processed_at = CASE
        WHEN v_payment_amount > 0 THEN now()
        ELSE NULL
      END,
      approval_invoice_id = v_invoice_id,
      approval_payment_id = v_payment_id,
      updated_at = now()
  WHERE id = v_po.id;

  INSERT INTO public.activity_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    new_data
  )
  VALUES (
    v_uid,
    'approve',
    'purchase_order',
    v_po.id,
    jsonb_build_object(
      'po_number', v_po.po_number,
      'payment_type', v_po.payment_type,
      'payment_amount', v_payment_amount,
      'invoice_id', v_invoice_id,
      'payment_id', v_payment_id
    )
  );

  RETURN jsonb_build_object(
    'id', v_po.id,
    'status', 'approved',
    'payment_type', v_po.payment_type,
    'payment_amount', v_payment_amount,
    'invoice_id', v_invoice_id,
    'payment_id', v_payment_id,
    'invoice_journal_id', v_invoice_journal_id,
    'payment_journal_id', v_payment_journal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_purchase_order_atomic(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_order_atomic(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_purchase_order_with_advance_atomic(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_po record;
  v_journal_id uuid;
  v_inventory_amount numeric;
BEGIN
  v_result := public.receive_purchase_order_atomic(p_payload);

  IF v_result->>'new_status' = 'completed' THEN
    SELECT *
    INTO v_po
    FROM public.purchase_orders
    WHERE id = (p_payload->>'po_id')::uuid
    FOR UPDATE;

    IF v_po.approval_invoice_id IS NOT NULL
       AND v_po.advance_recognition_journal_id IS NULL THEN
      v_inventory_amount := v_po.subtotal + v_po.shipping;
      IF v_inventory_amount > 0 THEN
        v_journal_id := private.post_atomic_journal(
          current_date,
          'Penerimaan persediaan ' || v_po.po_number,
          'purchase_invoice',
          v_po.approval_invoice_id,
          v_uid,
          jsonb_build_array(
            jsonb_build_object(
              'account_code', '1.1.05',
              'debit', v_inventory_amount,
              'credit', 0,
              'description', 'Persediaan diterima'
            ),
            jsonb_build_object(
              'account_code', '1.1.06',
              'debit', 0,
              'credit', v_inventory_amount,
              'description', 'Reklasifikasi uang muka pembelian'
            )
          )
        );

        UPDATE public.purchase_orders
        SET advance_recognition_journal_id = v_journal_id,
            updated_at = now()
        WHERE id = v_po.id;

        INSERT INTO public.activity_logs (
          user_id,
          action,
          entity_type,
          entity_id,
          new_data
        )
        VALUES (
          v_uid,
          'recognize_inventory',
          'purchase_order',
          v_po.id,
          jsonb_build_object(
            'po_number', v_po.po_number,
            'amount', v_inventory_amount,
            'journal_id', v_journal_id
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN v_result || jsonb_build_object(
    'advance_recognition_journal_id', v_journal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_order_with_advance_atomic(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_with_advance_atomic(jsonb)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Finance can create a manual product, but inventory operations remain
--    restricted to owner/admin gudang.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "products_insert_gudang_owner" ON public.products;
DROP POLICY IF EXISTS products_insert_gudang_owner_finance ON public.products;
CREATE POLICY products_insert_gudang_owner_finance
  ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(
      ARRAY['owner', 'admin_gudang', 'finance']::public.user_role[]
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Manual invoice names resolve to a customer master row.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_customer_for_invoice(
  p_name text,
  p_channel public.customer_channel
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_name text := NULLIF(btrim(p_name), '');
  v_customer_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Nama customer wajib diisi';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(lower(v_name), 0));

  SELECT id
  INTO v_customer_id
  FROM public.customers
  WHERE lower(btrim(name)) = lower(v_name)
  ORDER BY is_active DESC, created_at
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers(name, channel, is_active)
    VALUES (v_name, p_channel, true)
    RETURNING id INTO v_customer_id;
  ELSE
    UPDATE public.customers
    SET is_active = true,
        updated_at = now()
    WHERE id = v_customer_id
      AND is_active = false;
  END IF;

  RETURN v_customer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_customer_for_invoice(
  text,
  public.customer_channel
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_customer_for_invoice(
  text,
  public.customer_channel
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Payroll is entered employee-by-employee with named earnings/deductions,
--    and payroll posted to Hutang Gaji has an explicit settlement workflow.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payroll_line_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_line_id uuid NOT NULL
    REFERENCES public.payroll_lines(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  kind text NOT NULL CHECK (kind IN ('earning', 'deduction')),
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_line_components_line
  ON public.payroll_line_components(payroll_line_id, sort_order);

ALTER TABLE public.payroll_line_components ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.payroll_line_components TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payroll_line_components'
      AND policyname = 'payroll_line_components_finance_manage'
  ) THEN
    CREATE POLICY payroll_line_components_finance_manage
      ON public.payroll_line_components
      FOR ALL TO authenticated
      USING (
        public.has_any_role(
          ARRAY['owner', 'finance']::public.user_role[]
        )
      )
      WITH CHECK (
        public.has_any_role(
          ARRAY['owner', 'finance']::public.user_role[]
        )
      );
  END IF;
END;
$$;

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('paid', 'payable')),
  ADD COLUMN IF NOT EXISTS liability_settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS settlement_bank_transaction_id uuid
    REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settlement_journal_entry_id uuid
    REFERENCES public.journal_entries(id) ON DELETE SET NULL;

UPDATE public.payroll_runs
SET payment_status = CASE
      WHEN bank_account_id IS NULL THEN 'payable'
      ELSE 'paid'
    END
WHERE liability_settled_at IS NULL;

CREATE OR REPLACE FUNCTION public.create_payroll_run_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_period_month text := NULLIF(btrim(p_payload->>'period_month'), '');
  v_payment_date date := (p_payload->>'payment_date')::date;
  v_bank_id uuid := NULLIF(p_payload->>'bank_account_id', '')::uuid;
  v_notes text := NULLIF(p_payload->>'notes', '');
  v_gross numeric;
  v_deductions numeric;
  v_net numeric;
  v_bank record;
  v_bank_coa_id uuid;
  v_new_balance numeric;
  v_run_id uuid;
  v_payroll_line_id uuid;
  v_journal_id uuid;
  v_line jsonb;
  v_component jsonb;
  v_component_count integer;
  v_index integer;
BEGIN
  IF v_uid IS NULL OR NOT public.has_any_role(
    ARRAY['owner', 'finance']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak memproses payroll';
  END IF;
  IF v_period_month IS NULL OR v_period_month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Periode payroll tidak valid';
  END IF;
  IF p_payload->'lines' IS NULL
     OR jsonb_typeof(p_payload->'lines') <> 'array'
     OR jsonb_array_length(p_payload->'lines') = 0 THEN
    RAISE EXCEPTION 'Minimal 1 karyawan harus dipilih';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.payroll_runs
    WHERE period_month = v_period_month
  ) THEN
    RAISE EXCEPTION 'Payroll periode ini sudah dibuat';
  END IF;
  IF (
    SELECT count(*)
    FROM jsonb_array_elements(p_payload->'lines') item
  ) <> (
    SELECT count(DISTINCT item->>'employee_id')
    FROM jsonb_array_elements(p_payload->'lines') item
  ) THEN
    RAISE EXCEPTION 'Karyawan duplikat pada payroll';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payload->'lines') item
    LEFT JOIN public.employees employee
      ON employee.id = (item->>'employee_id')::uuid
    WHERE employee.id IS NULL OR employee.is_active = false
  ) THEN
    RAISE EXCEPTION 'Karyawan payroll tidak ditemukan atau sudah nonaktif';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payload->'lines') item
    WHERE COALESCE((item->>'base_salary')::numeric, 0) < 0
       OR COALESCE((item->>'allowances')::numeric, 0) < 0
       OR COALESCE((item->>'deductions')::numeric, 0) < 0
       OR COALESCE((item->>'base_salary')::numeric, 0)
          + COALESCE((item->>'allowances')::numeric, 0)
          - COALESCE((item->>'deductions')::numeric, 0) < 0
  ) THEN
    RAISE EXCEPTION 'Nilai payroll tidak valid';
  END IF;

  SELECT
    COALESCE(sum(
      COALESCE((item->>'base_salary')::numeric, 0)
      + COALESCE((item->>'allowances')::numeric, 0)
    ), 0),
    COALESCE(sum(COALESCE((item->>'deductions')::numeric, 0)), 0)
  INTO v_gross, v_deductions
  FROM jsonb_array_elements(p_payload->'lines') item;
  v_net := v_gross - v_deductions;
  IF v_gross <= 0 OR v_net < 0 THEN
    RAISE EXCEPTION 'Total payroll harus lebih dari 0 dan tidak boleh negatif';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fiscal_periods
    WHERE year = extract(year FROM v_payment_date)::integer
      AND month = extract(month FROM v_payment_date)::integer
      AND status = 'closed'
  ) THEN
    RAISE EXCEPTION 'Periode payroll sudah ditutup';
  END IF;

  IF v_bank_id IS NOT NULL THEN
    SELECT *
    INTO v_bank
    FROM public.bank_accounts
    WHERE id = v_bank_id
    FOR UPDATE;
    IF NOT FOUND OR NOT v_bank.is_active THEN
      RAISE EXCEPTION 'Akun kas/bank payroll tidak aktif';
    END IF;
    IF v_bank.current_balance < v_net THEN
      RAISE EXCEPTION 'Saldo kas/bank tidak cukup untuk payroll';
    END IF;
    v_bank_coa_id := v_bank.coa_account_id;
    IF v_bank_coa_id IS NULL THEN
      SELECT id
      INTO v_bank_coa_id
      FROM public.chart_of_accounts
      WHERE code = CASE
        WHEN v_bank.type::text = 'cash' THEN '1.1.01'
        WHEN v_bank.type::text = 'marketplace_balance' THEN '1.1.03'
        ELSE '1.1.02'
      END
        AND is_active = true
      LIMIT 1;
    END IF;
    IF v_bank_coa_id IS NULL THEN
      RAISE EXCEPTION 'COA kas/bank payroll tidak ditemukan';
    END IF;
  END IF;

  INSERT INTO public.payroll_runs(
    period_month,
    payment_date,
    bank_account_id,
    gross_amount,
    deductions,
    net_amount,
    status,
    payment_status,
    notes,
    created_by
  )
  VALUES (
    v_period_month,
    v_payment_date,
    v_bank_id,
    v_gross,
    v_deductions,
    v_net,
    'posted',
    CASE WHEN v_bank_id IS NULL THEN 'payable' ELSE 'paid' END,
    v_notes,
    v_uid
  )
  RETURNING id INTO v_run_id;

  FOR v_line IN
    SELECT value
    FROM jsonb_array_elements(p_payload->'lines') item(value)
  LOOP
    INSERT INTO public.payroll_lines(
      payroll_run_id,
      employee_id,
      base_salary,
      allowances,
      deductions,
      net_salary,
      notes
    )
    VALUES (
      v_run_id,
      (v_line->>'employee_id')::uuid,
      COALESCE((v_line->>'base_salary')::numeric, 0),
      COALESCE((v_line->>'allowances')::numeric, 0),
      COALESCE((v_line->>'deductions')::numeric, 0),
      COALESCE((v_line->>'base_salary')::numeric, 0)
        + COALESCE((v_line->>'allowances')::numeric, 0)
        - COALESCE((v_line->>'deductions')::numeric, 0),
      NULLIF(v_line->>'notes', '')
    )
    RETURNING id INTO v_payroll_line_id;

    v_component_count := CASE
      WHEN jsonb_typeof(v_line->'components') = 'array'
        THEN jsonb_array_length(v_line->'components')
      ELSE 0
    END;
    IF v_component_count > 0 THEN
      v_index := 0;
      FOR v_component IN
        SELECT value
        FROM jsonb_array_elements(v_line->'components') component(value)
      LOOP
        IF NULLIF(btrim(v_component->>'name'), '') IS NULL
           OR (v_component->>'kind') NOT IN ('earning', 'deduction')
           OR COALESCE((v_component->>'amount')::numeric, 0) < 0 THEN
          RAISE EXCEPTION 'Komponen payroll tidak valid';
        END IF;
        INSERT INTO public.payroll_line_components(
          payroll_line_id,
          name,
          kind,
          amount,
          sort_order
        )
        VALUES (
          v_payroll_line_id,
          btrim(v_component->>'name'),
          v_component->>'kind',
          COALESCE((v_component->>'amount')::numeric, 0),
          v_index
        );
        v_index := v_index + 1;
      END LOOP;
    ELSE
      INSERT INTO public.payroll_line_components(
        payroll_line_id,
        name,
        kind,
        amount,
        sort_order
      )
      SELECT v_payroll_line_id, name, kind, amount, sort_order
      FROM (VALUES
        ('Gaji Pokok', 'earning', COALESCE((v_line->>'base_salary')::numeric, 0), 0),
        ('Tunjangan', 'earning', COALESCE((v_line->>'allowances')::numeric, 0), 1),
        ('Potongan', 'deduction', COALESCE((v_line->>'deductions')::numeric, 0), 2)
      ) component(name, kind, amount, sort_order)
      WHERE amount > 0;
    END IF;
  END LOOP;

  IF v_bank_id IS NOT NULL AND v_net > 0 THEN
    v_new_balance := v_bank.current_balance - v_net;
    UPDATE public.bank_accounts
    SET current_balance = v_new_balance,
        updated_at = now()
    WHERE id = v_bank_id;
    INSERT INTO public.bank_transactions(
      bank_account_id,
      transaction_date,
      type,
      amount,
      balance_after,
      description,
      related_entity_type,
      related_entity_id,
      is_reconciled,
      created_by
    )
    VALUES (
      v_bank_id,
      v_payment_date,
      'debit',
      v_net,
      v_new_balance,
      'Pembayaran payroll ' || v_period_month,
      'payroll_run',
      v_run_id,
      false,
      v_uid
    );
  END IF;

  v_journal_id := private.post_atomic_journal(
    v_payment_date,
    'Payroll ' || v_period_month,
    'other',
    v_run_id,
    v_uid,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', '6.5',
        'debit', v_gross,
        'credit', 0,
        'description', 'Beban gaji gross'
      ),
      jsonb_build_object(
        'account_code', CASE WHEN v_bank_id IS NULL THEN '2.1.03' ELSE NULL END,
        'account_id', v_bank_coa_id,
        'debit', 0,
        'credit', v_net,
        'description', CASE WHEN v_bank_id IS NULL THEN 'Hutang Gaji' ELSE 'Pembayaran gaji' END
      )
    ) || CASE
      WHEN v_deductions > 0 THEN jsonb_build_array(
        jsonb_build_object(
          'account_code', '2.1.04',
          'debit', 0,
          'credit', v_deductions,
          'description', 'Hutang BPJS / PPh / potongan payroll'
        )
      )
      ELSE '[]'::jsonb
    END
  );

  UPDATE public.payroll_runs
  SET journal_entry_id = v_journal_id
  WHERE id = v_run_id;

  INSERT INTO public.activity_logs(
    user_id,
    action,
    entity_type,
    entity_id,
    new_data
  )
  VALUES (
    v_uid,
    'create',
    'payroll_run',
    v_run_id,
    jsonb_build_object(
      'period_month', v_period_month,
      'gross', v_gross,
      'deductions', v_deductions,
      'net', v_net,
      'employee_count', jsonb_array_length(p_payload->'lines')
    )
  );

  RETURN jsonb_build_object(
    'id', v_run_id,
    'journal_id', v_journal_id,
    'gross', v_gross,
    'deductions', v_deductions,
    'net', v_net,
    'payment_status', CASE WHEN v_bank_id IS NULL THEN 'payable' ELSE 'paid' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_payroll_run_atomic(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_payroll_run_atomic(jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.update_payroll_run_with_components_atomic(
  p_run_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_line jsonb;
  v_component jsonb;
  v_payroll_line_id uuid;
  v_component_count integer;
  v_index integer;
BEGIN
  IF v_uid IS NULL OR NOT public.has_any_role(
    ARRAY['owner', 'finance']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak mengedit payroll';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.payroll_runs
    WHERE id = p_run_id
      AND liability_settled_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Payroll yang Hutang Gajinya sudah dilunasi tidak dapat diedit';
  END IF;

  v_result := public.update_payroll_run_atomic(p_run_id, p_payload);

  UPDATE public.payroll_runs
  SET payment_status = CASE
        WHEN NULLIF(p_payload->>'bank_account_id', '') IS NULL
          THEN 'payable'
        ELSE 'paid'
      END
  WHERE id = p_run_id;

  FOR v_line IN
    SELECT value
    FROM jsonb_array_elements(p_payload->'lines') item(value)
  LOOP
    SELECT id
    INTO v_payroll_line_id
    FROM public.payroll_lines
    WHERE payroll_run_id = p_run_id
      AND employee_id = (v_line->>'employee_id')::uuid;
    IF v_payroll_line_id IS NULL THEN
      RAISE EXCEPTION 'Baris payroll hasil revisi tidak lengkap';
    END IF;

    v_component_count := CASE
      WHEN jsonb_typeof(v_line->'components') = 'array'
        THEN jsonb_array_length(v_line->'components')
      ELSE 0
    END;
    IF v_component_count > 0 THEN
      v_index := 0;
      FOR v_component IN
        SELECT value
        FROM jsonb_array_elements(v_line->'components') component(value)
      LOOP
        IF NULLIF(btrim(v_component->>'name'), '') IS NULL
           OR (v_component->>'kind') NOT IN ('earning', 'deduction')
           OR COALESCE((v_component->>'amount')::numeric, 0) < 0 THEN
          RAISE EXCEPTION 'Komponen payroll tidak valid';
        END IF;
        INSERT INTO public.payroll_line_components(
          payroll_line_id,
          name,
          kind,
          amount,
          sort_order
        )
        VALUES (
          v_payroll_line_id,
          btrim(v_component->>'name'),
          v_component->>'kind',
          COALESCE((v_component->>'amount')::numeric, 0),
          v_index
        );
        v_index := v_index + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_result || jsonb_build_object(
    'payment_status', CASE
      WHEN NULLIF(p_payload->>'bank_account_id', '') IS NULL
        THEN 'payable'
      ELSE 'paid'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_payroll_run_with_components_atomic(
  uuid,
  jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_payroll_run_with_components_atomic(
  uuid,
  jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.settle_payroll_liability_atomic(
  p_run_id uuid,
  p_bank_account_id uuid,
  p_payment_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run record;
  v_bank record;
  v_bank_coa_id uuid;
  v_new_balance numeric;
  v_bank_transaction_id uuid;
  v_journal_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.has_any_role(
    ARRAY['owner', 'finance']::public.user_role[]
  ) THEN
    RAISE EXCEPTION 'Tidak berhak melunasi Hutang Gaji';
  END IF;

  SELECT *
  INTO v_run
  FROM public.payroll_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll tidak ditemukan';
  END IF;
  IF v_run.status <> 'posted' OR v_run.payment_status <> 'payable' THEN
    RAISE EXCEPTION 'Payroll ini bukan Hutang Gaji yang belum dibayar';
  END IF;
  IF v_run.net_amount <= 0 THEN
    RAISE EXCEPTION 'Nilai Hutang Gaji harus lebih dari 0';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fiscal_periods
    WHERE year = extract(year FROM p_payment_date)::integer
      AND month = extract(month FROM p_payment_date)::integer
      AND status = 'closed'
  ) THEN
    RAISE EXCEPTION 'Periode pembayaran Hutang Gaji sudah ditutup';
  END IF;

  SELECT *
  INTO v_bank
  FROM public.bank_accounts
  WHERE id = p_bank_account_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_bank.is_active THEN
    RAISE EXCEPTION 'Akun kas/bank pembayaran tidak aktif';
  END IF;
  IF v_bank.current_balance < v_run.net_amount THEN
    RAISE EXCEPTION 'Saldo kas/bank tidak cukup untuk melunasi Hutang Gaji';
  END IF;

  v_bank_coa_id := v_bank.coa_account_id;
  IF v_bank_coa_id IS NULL THEN
    SELECT id
    INTO v_bank_coa_id
    FROM public.chart_of_accounts
    WHERE code = CASE
      WHEN v_bank.type::text = 'cash' THEN '1.1.01'
      WHEN v_bank.type::text = 'marketplace_balance' THEN '1.1.03'
      ELSE '1.1.02'
    END
      AND is_active = true
    LIMIT 1;
  END IF;
  IF v_bank_coa_id IS NULL THEN
    RAISE EXCEPTION 'COA kas/bank pembayaran tidak ditemukan';
  END IF;

  v_new_balance := v_bank.current_balance - v_run.net_amount;
  UPDATE public.bank_accounts
  SET current_balance = v_new_balance,
      updated_at = now()
  WHERE id = p_bank_account_id;

  INSERT INTO public.bank_transactions (
    bank_account_id,
    transaction_date,
    type,
    amount,
    balance_after,
    description,
    related_entity_type,
    related_entity_id,
    is_reconciled,
    created_by
  )
  VALUES (
    p_bank_account_id,
    p_payment_date,
    'debit',
    v_run.net_amount,
    v_new_balance,
    'Pelunasan Hutang Gaji ' || v_run.period_month,
    'payroll_settlement',
    v_run.id,
    false,
    v_uid
  )
  RETURNING id INTO v_bank_transaction_id;

  v_journal_id := private.post_atomic_journal(
    p_payment_date,
    'Pelunasan Hutang Gaji ' || v_run.period_month,
    'other',
    v_run.id,
    v_uid,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', '2.1.03',
        'debit', v_run.net_amount,
        'credit', 0,
        'description', 'Hutang Gaji dilunasi'
      ),
      jsonb_build_object(
        'account_id', v_bank_coa_id,
        'debit', 0,
        'credit', v_run.net_amount,
        'description', 'Kas/Bank keluar'
      )
    )
  );

  UPDATE public.payroll_runs
  SET payment_status = 'paid',
      bank_account_id = p_bank_account_id,
      liability_settled_at = now(),
      settlement_bank_transaction_id = v_bank_transaction_id,
      settlement_journal_entry_id = v_journal_id
  WHERE id = v_run.id;

  INSERT INTO public.activity_logs(
    user_id,
    action,
    entity_type,
    entity_id,
    new_data
  )
  VALUES (
    v_uid,
    'settle_liability',
    'payroll_run',
    v_run.id,
    jsonb_build_object(
      'period_month', v_run.period_month,
      'amount', v_run.net_amount,
      'bank_account_id', p_bank_account_id,
      'journal_id', v_journal_id
    )
  );

  RETURN jsonb_build_object(
    'id', v_run.id,
    'payment_status', 'paid',
    'bank_transaction_id', v_bank_transaction_id,
    'journal_id', v_journal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_payroll_liability_atomic(
  uuid,
  uuid,
  date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_payroll_liability_atomic(
  uuid,
  uuid,
  date
) TO authenticated;

COMMENT ON FUNCTION public.approve_purchase_order_atomic(uuid) IS
  'Approves a Purchase Order and atomically records cash/DP as a supplier advance, bank mutation, invoice, allocation, and balanced journals.';
COMMENT ON FUNCTION public.receive_purchase_order_with_advance_atomic(jsonb) IS
  'Wraps atomic PO receipt and reclassifies a previously posted supplier advance to inventory without deducting bank twice.';
COMMENT ON FUNCTION public.resolve_customer_for_invoice(text, public.customer_channel) IS
  'Returns an existing normalized-name customer or creates one for a manual sales invoice using invoker RLS.';
COMMENT ON FUNCTION public.settle_payroll_liability_atomic(uuid, uuid, date) IS
  'Atomically pays an outstanding payroll liability from a selected cash/bank account and posts the settlement journal.';
COMMENT ON FUNCTION public.create_payroll_run_atomic(jsonb) IS
  'Atomically creates employee-selected payroll, named components, optional bank mutation, and balanced journals.';
COMMENT ON FUNCTION public.update_payroll_run_with_components_atomic(uuid, jsonb) IS
  'Atomically updates payroll accounting and replaces the named components used by individual payslips.';
