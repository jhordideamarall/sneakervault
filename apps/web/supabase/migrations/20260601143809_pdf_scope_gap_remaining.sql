-- ============================================================================
-- SneakerVault — PDF Scope Gap Remaining Foundation
-- ============================================================================
-- Covers:
-- - A3 Stock Opname schema + number generator
-- - A4 period lock support is implemented in app actions using fiscal_periods
--
-- This migration is additive only.
-- ============================================================================

-- ─── Stock opname status enum ───────────────────────────────────────────────
DO $$
BEGIN
  CREATE TYPE public.stock_opname_status AS ENUM (
    'open',
    'counting',
    'review',
    'approved',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Stock opname sessions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_opname_sessions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  opname_number text NOT NULL UNIQUE,
  opname_date date NOT NULL DEFAULT CURRENT_DATE,
  status public.stock_opname_status NOT NULL DEFAULT 'open',
  scope text NOT NULL DEFAULT 'all',
  notes text,
  started_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_stock_opname_approval_state CHECK (
    (status <> 'review' OR reviewed_by IS NOT NULL)
    AND (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
    AND (status <> 'cancelled' OR (cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL))
  )
);

CREATE INDEX IF NOT EXISTS idx_stock_opname_sessions_date
  ON public.stock_opname_sessions (opname_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_opname_sessions_status
  ON public.stock_opname_sessions (status, opname_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_opname_sessions_started_by
  ON public.stock_opname_sessions (started_by, created_at DESC);

DROP TRIGGER IF EXISTS trg_stock_opname_sessions_updated_at ON public.stock_opname_sessions;
CREATE TRIGGER trg_stock_opname_sessions_updated_at
BEFORE UPDATE ON public.stock_opname_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Stock opname lines ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_opname_lines (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  session_id uuid NOT NULL REFERENCES public.stock_opname_sessions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  system_qty integer NOT NULL CHECK (system_qty >= 0),
  physical_qty integer,
  variance integer GENERATED ALWAYS AS (COALESCE(physical_qty, system_qty) - system_qty) STORED,
  unit_cost numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  reason text,
  counted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  counted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, product_id),
  CONSTRAINT chk_stock_opname_physical_nonnegative CHECK (
    physical_qty IS NULL OR physical_qty >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_stock_opname_lines_session
  ON public.stock_opname_lines (session_id);
CREATE INDEX IF NOT EXISTS idx_stock_opname_lines_product
  ON public.stock_opname_lines (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_opname_lines_variance
  ON public.stock_opname_lines (session_id, variance)
  WHERE physical_qty IS NOT NULL;

DROP TRIGGER IF EXISTS trg_stock_opname_lines_updated_at ON public.stock_opname_lines;
CREATE TRIGGER trg_stock_opname_lines_updated_at
BEFORE UPDATE ON public.stock_opname_lines
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Number generator ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_opname_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_next integer;
BEGIN
  v_prefix := 'OPN-' || to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYYMM') || '-';

  SELECT COALESCE(MAX(NULLIF(substring(opname_number FROM length(v_prefix) + 1), '')::integer), 0) + 1
    INTO v_next
  FROM public.stock_opname_sessions
  WHERE opname_number LIKE v_prefix || '%';

  RETURN v_prefix || lpad(v_next::text, 4, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_opname_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_opname_number() TO authenticated;

-- ─── RLS + grants ──────────────────────────────────────────────────────────
ALTER TABLE public.stock_opname_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_opname_lines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stock_opname_sessions FROM PUBLIC, anon;
REVOKE ALL ON public.stock_opname_lines FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.stock_opname_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.stock_opname_lines TO authenticated;
GRANT ALL ON public.stock_opname_sessions TO service_role;
GRANT ALL ON public.stock_opname_lines TO service_role;

DROP POLICY IF EXISTS "stock_opname_sessions_select_authorized" ON public.stock_opname_sessions;
DROP POLICY IF EXISTS "stock_opname_sessions_insert_gudang_owner" ON public.stock_opname_sessions;
DROP POLICY IF EXISTS "stock_opname_sessions_update_gudang_owner" ON public.stock_opname_sessions;
DROP POLICY IF EXISTS "stock_opname_lines_select_authorized" ON public.stock_opname_lines;
DROP POLICY IF EXISTS "stock_opname_lines_insert_gudang_owner" ON public.stock_opname_lines;
DROP POLICY IF EXISTS "stock_opname_lines_update_gudang_owner" ON public.stock_opname_lines;

CREATE POLICY "stock_opname_sessions_select_authorized"
ON public.stock_opname_sessions FOR SELECT
TO authenticated
USING (
  (select public.has_any_role(ARRAY['owner','finance','admin_gudang']::public.user_role[]))
);

CREATE POLICY "stock_opname_sessions_insert_gudang_owner"
ON public.stock_opname_sessions FOR INSERT
TO authenticated
WITH CHECK (
  started_by = (select auth.uid())
  AND (select public.has_any_role(ARRAY['owner','admin_gudang']::public.user_role[]))
);

CREATE POLICY "stock_opname_sessions_update_gudang_owner"
ON public.stock_opname_sessions FOR UPDATE
TO authenticated
USING (
  (select public.has_any_role(ARRAY['owner','admin_gudang']::public.user_role[]))
)
WITH CHECK (
  (select public.has_any_role(ARRAY['owner','admin_gudang']::public.user_role[]))
);

CREATE POLICY "stock_opname_lines_select_authorized"
ON public.stock_opname_lines FOR SELECT
TO authenticated
USING (
  (select public.has_any_role(ARRAY['owner','finance','admin_gudang']::public.user_role[]))
);

CREATE POLICY "stock_opname_lines_insert_gudang_owner"
ON public.stock_opname_lines FOR INSERT
TO authenticated
WITH CHECK (
  (select public.has_any_role(ARRAY['owner','admin_gudang']::public.user_role[]))
);

CREATE POLICY "stock_opname_lines_update_gudang_owner"
ON public.stock_opname_lines FOR UPDATE
TO authenticated
USING (
  (select public.has_any_role(ARRAY['owner','admin_gudang']::public.user_role[]))
)
WITH CHECK (
  (select public.has_any_role(ARRAY['owner','admin_gudang']::public.user_role[]))
);

COMMENT ON TABLE public.stock_opname_sessions IS
  'Stock opname sessions for physical cycle counts and owner approval.';
COMMENT ON TABLE public.stock_opname_lines IS
  'Stock opname product snapshots with physical count and computed variance.';
