-- ============================================================================
-- SneakerVault — A1 Expenses Foundation
-- ============================================================================
-- Offline-first migration for the PDF scope gap:
-- - Expense categories + 14 baseline categories from the client brief
-- - Expenses workflow (draft -> approved/rejected -> paid/voided)
-- - Expense journal source, expense CoA additions, private receipt bucket
-- - RLS/grants following Phase 6 lockdown style
--
-- NOTE: Live Supabase schema must still be reviewed before applying because
-- Phase 3/4 schema in this repo was previously applied through MCP.
-- ============================================================================

-- ─── Enum foundations ───────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE TYPE public.expense_status AS ENUM (
    'draft',
    'approved',
    'paid',
    'rejected',
    'voided'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.payment_method AS ENUM (
    'cash',
    'bank_transfer',
    'marketplace',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'journal_source'
  ) THEN
    ALTER TYPE public.journal_source ADD VALUE IF NOT EXISTS 'expense';
  END IF;
END $$;

-- ─── Expense CoA additions ─────────────────────────────────────────────────
WITH seed(code, name, type, normal_balance, description) AS (
  VALUES
    ('6.8', 'Beban Sewa', 'expense', 'debit', 'Sewa toko, gudang, atau tempat operasional'),
    ('6.9', 'Beban Iklan/Pemasaran', 'expense', 'debit', 'Iklan marketplace dan promosi digital'),
    ('6.10', 'Beban Utilitas Listrik/Internet', 'expense', 'debit', 'Listrik, internet, dan utilitas operasional'),
    ('6.11', 'Beban Lain-lain', 'expense', 'debit', 'Beban operasional lain yang belum punya akun khusus')
)
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
  seed.code,
  seed.name,
  seed.type::public.coa_type,
  seed.normal_balance::public.coa_normal_balance,
  NULL,
  true,
  true,
  seed.description
FROM seed
WHERE NOT EXISTS (
  SELECT 1
  FROM public.chart_of_accounts coa
  WHERE coa.code = seed.code
);

WITH seed(code, name, type, normal_balance, description) AS (
  VALUES
    ('6.8', 'Beban Sewa', 'expense', 'debit', 'Sewa toko, gudang, atau tempat operasional'),
    ('6.9', 'Beban Iklan/Pemasaran', 'expense', 'debit', 'Iklan marketplace dan promosi digital'),
    ('6.10', 'Beban Utilitas Listrik/Internet', 'expense', 'debit', 'Listrik, internet, dan utilitas operasional'),
    ('6.11', 'Beban Lain-lain', 'expense', 'debit', 'Beban operasional lain yang belum punya akun khusus')
)
UPDATE public.chart_of_accounts coa
SET
  name = seed.name,
  type = seed.type::public.coa_type,
  normal_balance = seed.normal_balance::public.coa_normal_balance,
  is_active = true,
  is_system = true,
  description = seed.description
FROM seed
WHERE coa.code = seed.code;

-- ─── Expense categories ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  account_code text NOT NULL CHECK (length(trim(account_code)) > 0),
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_categories_name_lower
  ON public.expense_categories (lower(name));
CREATE INDEX IF NOT EXISTS idx_expense_categories_active_sort
  ON public.expense_categories (is_active, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_expense_categories_account_code
  ON public.expense_categories (account_code);

DROP TRIGGER IF EXISTS trg_expense_categories_updated_at ON public.expense_categories;
CREATE TRIGGER trg_expense_categories_updated_at
BEFORE UPDATE ON public.expense_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

WITH seed(name, account_code, sort_order) AS (
  VALUES
    ('Gaji karyawan', '6.5', 10),
    ('Sewa toko/gudang', '6.8', 20),
    ('Listrik & internet', '6.10', 30),
    ('Biaya packing', '6.4', 40),
    ('Kardus, plastik, bubble wrap', '6.4', 50),
    ('Biaya admin marketplace', '6.1', 60),
    ('Biaya iklan Shopee/TikTok/Instagram', '6.9', 70),
    ('Biaya ongkir/subsidi ongkir', '6.3', 80),
    ('Biaya transport', '6.4', 90),
    ('Biaya software/tools', '6.11', 100),
    ('Biaya refund/komplain', '6.11', 110),
    ('Biaya service/perbaikan', '6.11', 120),
    ('Biaya makan/operasional', '6.4', 130),
    ('Biaya lain-lain', '6.11', 140)
)
INSERT INTO public.expense_categories (name, account_code, is_active, is_system, sort_order)
SELECT seed.name, seed.account_code, true, true, seed.sort_order
FROM seed
WHERE NOT EXISTS (
  SELECT 1
  FROM public.expense_categories ec
  WHERE lower(ec.name) = lower(seed.name)
);

WITH seed(name, account_code, sort_order) AS (
  VALUES
    ('Gaji karyawan', '6.5', 10),
    ('Sewa toko/gudang', '6.8', 20),
    ('Listrik & internet', '6.10', 30),
    ('Biaya packing', '6.4', 40),
    ('Kardus, plastik, bubble wrap', '6.4', 50),
    ('Biaya admin marketplace', '6.1', 60),
    ('Biaya iklan Shopee/TikTok/Instagram', '6.9', 70),
    ('Biaya ongkir/subsidi ongkir', '6.3', 80),
    ('Biaya transport', '6.4', 90),
    ('Biaya software/tools', '6.11', 100),
    ('Biaya refund/komplain', '6.11', 110),
    ('Biaya service/perbaikan', '6.11', 120),
    ('Biaya makan/operasional', '6.4', 130),
    ('Biaya lain-lain', '6.11', 140)
)
UPDATE public.expense_categories ec
SET
  account_code = seed.account_code,
  is_active = true,
  is_system = true,
  sort_order = seed.sort_order
FROM seed
WHERE lower(ec.name) = lower(seed.name);

-- ─── Expenses ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  expense_number text NOT NULL UNIQUE,
  expense_date date NOT NULL,
  category_id uuid NOT NULL REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  description text NOT NULL CHECK (length(trim(description)) > 0),
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method public.payment_method NOT NULL,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  receipt_path text,
  status public.expense_status NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  paid_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_at timestamptz,
  rejected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  voided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  voided_at timestamptz,
  rejection_reason text,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_expenses_approval_state CHECK (
    (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
    AND (status <> 'paid' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND paid_by IS NOT NULL AND paid_at IS NOT NULL))
    AND (status <> 'rejected' OR (rejected_by IS NOT NULL AND rejected_at IS NOT NULL))
    AND (status <> 'voided' OR (voided_by IS NOT NULL AND voided_at IS NOT NULL))
  )
);

CREATE INDEX IF NOT EXISTS idx_expenses_date
  ON public.expenses (expense_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_status
  ON public.expenses (status, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category
  ON public.expenses (category_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_bank_account
  ON public.expenses (bank_account_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by
  ON public.expenses (created_by, created_at DESC);

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON public.expenses;
CREATE TRIGGER trg_expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Number generator ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_expense_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_next integer;
BEGIN
  v_prefix := 'EXP-' || to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYYMM') || '-';

  SELECT COALESCE(MAX(NULLIF(substring(expense_number FROM length(v_prefix) + 1), '')::integer), 0) + 1
    INTO v_next
  FROM public.expenses
  WHERE expense_number LIKE v_prefix || '%';

  RETURN v_prefix || lpad(v_next::text, 4, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_expense_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_expense_number() TO authenticated;

-- ─── Storage bucket for receipts ───────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', false)
ON CONFLICT (id) DO UPDATE
SET public = false;

DROP POLICY IF EXISTS "expense_receipts_insert_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_select_owner_finance_or_own" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_update_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_delete_owner_finance" ON storage.objects;

CREATE POLICY "expense_receipts_insert_own_folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'expense-receipts'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY "expense_receipts_select_owner_finance_or_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND (
    (storage.foldername(name))[1] = (select auth.uid())::text
    OR (select public.has_any_role(ARRAY['owner','finance']::public.user_role[]))
  )
);

CREATE POLICY "expense_receipts_update_own_folder"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
)
WITH CHECK (
  bucket_id = 'expense-receipts'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY "expense_receipts_delete_owner_finance"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND (select public.has_any_role(ARRAY['owner','finance']::public.user_role[]))
);

-- ─── RLS + grants ──────────────────────────────────────────────────────────
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.expense_categories FROM PUBLIC, anon;
REVOKE ALL ON public.expenses FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.expense_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.expenses TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
GRANT ALL ON public.expenses TO service_role;

DROP POLICY IF EXISTS "expense_categories_select_authenticated" ON public.expense_categories;
DROP POLICY IF EXISTS "expense_categories_insert_owner" ON public.expense_categories;
DROP POLICY IF EXISTS "expense_categories_update_owner" ON public.expense_categories;
DROP POLICY IF EXISTS "expenses_select_finance_or_own" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert_operational_roles" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update_finance_or_own_draft" ON public.expenses;

CREATE POLICY "expense_categories_select_authenticated"
ON public.expense_categories FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "expense_categories_insert_owner"
ON public.expense_categories FOR INSERT
TO authenticated
WITH CHECK ((select public.has_role('owner')));

CREATE POLICY "expense_categories_update_owner"
ON public.expense_categories FOR UPDATE
TO authenticated
USING ((select public.has_role('owner')))
WITH CHECK ((select public.has_role('owner')));

CREATE POLICY "expenses_select_finance_or_own"
ON public.expenses FOR SELECT
TO authenticated
USING (
  (select public.has_any_role(ARRAY['owner','finance']::public.user_role[]))
  OR created_by = (select auth.uid())
);

CREATE POLICY "expenses_insert_operational_roles"
ON public.expenses FOR INSERT
TO authenticated
WITH CHECK (
  created_by = (select auth.uid())
  AND (select public.has_any_role(ARRAY['owner','finance','admin_gudang','admin_online']::public.user_role[]))
);

CREATE POLICY "expenses_update_finance_or_own_draft"
ON public.expenses FOR UPDATE
TO authenticated
USING (
  (select public.has_any_role(ARRAY['owner','finance']::public.user_role[]))
  OR (created_by = (select auth.uid()) AND status = 'draft')
)
WITH CHECK (
  (select public.has_any_role(ARRAY['owner','finance']::public.user_role[]))
  OR (created_by = (select auth.uid()) AND status = 'draft')
);

COMMENT ON TABLE public.expenses IS
  'Operational expenses from PDF scope A1. Paid expenses reduce kas/bank and create expense journals.';
COMMENT ON TABLE public.expense_categories IS
  'CRUD-able expense category master, seeded with the 14 minimum categories from the PDF brief.';
