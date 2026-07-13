-- Client accounting revision: COA-linked bank accounts, manual invoice lines,
-- fixed assets, employees, payroll, and compare-only stock opname support.

-- ─── COA seeds ─────────────────────────────────────────────
INSERT INTO public.chart_of_accounts (code, name, type, normal_balance, is_system)
VALUES
  ('1.2.01', 'Aset Tetap - Peralatan & Inventaris', 'asset'::coa_type, 'debit'::coa_normal_balance, true),
  ('1.2.98', 'Akumulasi Penyusutan Aset Tetap', 'asset'::coa_type, 'credit'::coa_normal_balance, true),
  ('2.1.03', 'Hutang Gaji', 'liability'::coa_type, 'credit'::coa_normal_balance, true),
  ('2.1.04', 'Hutang BPJS / PPh Karyawan', 'liability'::coa_type, 'credit'::coa_normal_balance, true),
  ('3.4', 'Prive', 'equity'::coa_type, 'debit'::coa_normal_balance, true)
ON CONFLICT (code) DO NOTHING;

UPDATE public.chart_of_accounts c
SET parent_id = p.id
FROM (VALUES
  ('1.2.01', '1.2'),
  ('1.2.98', '1.2'),
  ('2.1.03', '2.1'),
  ('2.1.04', '2.1'),
  ('3.4', '3')
) AS m(child_code, parent_code)
JOIN public.chart_of_accounts p ON p.code = m.parent_code
WHERE c.code = m.child_code
  AND c.parent_id IS DISTINCT FROM p.id;

-- ─── Bank account COA links & cash receipt counterpart ─────
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS coa_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS counterpart_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_coa_account_id
  ON public.bank_accounts(coa_account_id);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_counterpart_account_id
  ON public.bank_transactions(counterpart_account_id);

DO $$
DECLARE
  v_bank record;
  v_parent uuid;
  v_code text;
  v_seq integer := 90;
  v_account_id uuid;
BEGIN
  SELECT id INTO v_parent FROM public.chart_of_accounts WHERE code = '1.1';

  FOR v_bank IN
    SELECT id, name, coa_account_id
    FROM public.bank_accounts
    WHERE coa_account_id IS NULL
    ORDER BY created_at, name
  LOOP
    LOOP
      v_code := '1.1.' || lpad(v_seq::text, 2, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.chart_of_accounts WHERE code = v_code
      );
      v_seq := v_seq + 1;
    END LOOP;

    INSERT INTO public.chart_of_accounts (
      code, name, type, normal_balance, parent_id, is_system, is_active, description
    )
    VALUES (
      v_code,
      v_bank.name,
      'asset'::coa_type,
      'debit'::coa_normal_balance,
      v_parent,
      false,
      true,
      'Auto-created for bank/cash account mapping'
    )
    RETURNING id INTO v_account_id;

    UPDATE public.bank_accounts
    SET coa_account_id = v_account_id
    WHERE id = v_bank.id;

    v_seq := v_seq + 1;
  END LOOP;
END $$;

-- ─── Manual purchase invoice item lines ───────────────────
CREATE TABLE IF NOT EXISTS public.purchase_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  product_label text NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  unit_cost numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  subtotal numeric NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_invoice_id
  ON public.purchase_invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_product_id
  ON public.purchase_invoice_lines(product_id);

ALTER TABLE public.purchase_invoice_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoice_lines TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'purchase_invoice_lines'
      AND policyname = 'purchase_invoice_lines_read_finance'
  ) THEN
    CREATE POLICY purchase_invoice_lines_read_finance
      ON public.purchase_invoice_lines
      FOR SELECT TO authenticated
      USING (public.has_any_role(ARRAY['owner','finance','admin_gudang']::user_role[]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'purchase_invoice_lines'
      AND policyname = 'purchase_invoice_lines_write_finance'
  ) THEN
    CREATE POLICY purchase_invoice_lines_write_finance
      ON public.purchase_invoice_lines
      FOR ALL TO authenticated
      USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
      WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
  END IF;
END $$;

-- ─── Employees ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text UNIQUE,
  full_name text NOT NULL,
  job_title text,
  department text,
  base_salary numeric NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
  bank_account_name text,
  bank_account_number text,
  tax_id text,
  hire_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_active_name
  ON public.employees(is_active, full_name);
CREATE INDEX IF NOT EXISTS idx_employees_created_by
  ON public.employees(created_by);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employees'
      AND policyname = 'employees_finance_manage'
  ) THEN
    CREATE POLICY employees_finance_manage
      ON public.employees
      FOR ALL TO authenticated
      USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
      WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
  END IF;
END $$;

-- ─── Payroll ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month text NOT NULL UNIQUE CHECK (period_month ~ '^\d{4}-\d{2}$'),
  payment_date date NOT NULL,
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  gross_amount numeric NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  deductions numeric NOT NULL DEFAULT 0 CHECK (deductions >= 0),
  net_amount numeric NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','voided')),
  notes text,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  base_salary numeric NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
  allowances numeric NOT NULL DEFAULT 0 CHECK (allowances >= 0),
  deductions numeric NOT NULL DEFAULT 0 CHECK (deductions >= 0),
  net_salary numeric NOT NULL DEFAULT 0 CHECK (net_salary >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_lines_run_id
  ON public.payroll_lines(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_employee_id
  ON public.payroll_lines(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_bank_account_id
  ON public.payroll_runs(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_journal_entry_id
  ON public.payroll_runs(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_created_by
  ON public.payroll_runs(created_by);

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_lines TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payroll_runs'
      AND policyname = 'payroll_runs_finance_manage'
  ) THEN
    CREATE POLICY payroll_runs_finance_manage
      ON public.payroll_runs
      FOR ALL TO authenticated
      USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
      WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payroll_lines'
      AND policyname = 'payroll_lines_finance_manage'
  ) THEN
    CREATE POLICY payroll_lines_finance_manage
      ON public.payroll_lines
      FOR ALL TO authenticated
      USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
      WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
  END IF;
END $$;

-- ─── Fixed assets & depreciation ───────────────────────────
CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text UNIQUE,
  name text NOT NULL,
  acquisition_date date NOT NULL,
  acquisition_cost numeric NOT NULL CHECK (acquisition_cost > 0),
  salvage_value numeric NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  useful_life_months integer NOT NULL DEFAULT 48 CHECK (useful_life_months > 0),
  method text NOT NULL DEFAULT 'straight_line' CHECK (method IN ('straight_line','double_declining')),
  accumulated_depreciation numeric NOT NULL DEFAULT 0 CHECK (accumulated_depreciation >= 0),
  location text,
  department text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disposed')),
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fixed_asset_depreciation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month text NOT NULL UNIQUE CHECK (period_month ~ '^\d{4}-\d{2}$'),
  total_amount numeric NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fixed_asset_depreciation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.fixed_asset_depreciation_runs(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_status
  ON public.fixed_assets(status, acquisition_date);
CREATE INDEX IF NOT EXISTS idx_fixed_asset_depreciation_lines_run
  ON public.fixed_asset_depreciation_lines(run_id);
CREATE INDEX IF NOT EXISTS idx_fixed_asset_depreciation_lines_asset
  ON public.fixed_asset_depreciation_lines(asset_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_created_by
  ON public.fixed_assets(created_by);
CREATE INDEX IF NOT EXISTS idx_fixed_asset_depreciation_runs_journal_entry_id
  ON public.fixed_asset_depreciation_runs(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_fixed_asset_depreciation_runs_created_by
  ON public.fixed_asset_depreciation_runs(created_by);

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_asset_depreciation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_asset_depreciation_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_asset_depreciation_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_asset_depreciation_lines TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fixed_assets'
      AND policyname = 'fixed_assets_finance_manage'
  ) THEN
    CREATE POLICY fixed_assets_finance_manage
      ON public.fixed_assets
      FOR ALL TO authenticated
      USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
      WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fixed_asset_depreciation_runs'
      AND policyname = 'fixed_asset_depreciation_runs_finance_manage'
  ) THEN
    CREATE POLICY fixed_asset_depreciation_runs_finance_manage
      ON public.fixed_asset_depreciation_runs
      FOR ALL TO authenticated
      USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
      WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fixed_asset_depreciation_lines'
      AND policyname = 'fixed_asset_depreciation_lines_finance_manage'
  ) THEN
    CREATE POLICY fixed_asset_depreciation_lines_finance_manage
      ON public.fixed_asset_depreciation_lines
      FOR ALL TO authenticated
      USING (public.has_any_role(ARRAY['owner','finance']::user_role[]))
      WITH CHECK (public.has_any_role(ARRAY['owner','finance']::user_role[]));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.add_fixed_asset_depreciation(
  p_asset_id uuid,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_any_role(ARRAY['owner','finance']::user_role[]) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF p_amount < 0 THEN
    RAISE EXCEPTION 'p_amount must be nonnegative';
  END IF;

  UPDATE public.fixed_assets
  SET accumulated_depreciation = accumulated_depreciation + p_amount,
      updated_at = now()
  WHERE id = p_asset_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'asset % not found', p_asset_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.add_fixed_asset_depreciation(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_fixed_asset_depreciation(uuid, numeric) TO authenticated;
