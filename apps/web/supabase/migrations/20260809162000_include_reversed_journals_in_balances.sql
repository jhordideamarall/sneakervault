-- A reversed entry remains accounting history and is neutralized by the
-- separately posted reversal entry. Financial balances must therefore count
-- both `posted` and `reversed` entries (everything except drafts).

CREATE OR REPLACE FUNCTION public.get_account_balances(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (
  account_id uuid,
  code text,
  name text,
  type text,
  normal_balance text,
  parent_id uuid,
  total_debit numeric,
  total_credit numeric,
  balance numeric
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
  WITH line_totals AS (
    SELECT
      jl.account_id,
      coalesce(sum(jl.debit), 0)::numeric AS total_debit,
      coalesce(sum(jl.credit), 0)::numeric AS total_credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je
      ON je.id = jl.entry_id
    WHERE je.status IN (
      'posted'::public.journal_status,
      'reversed'::public.journal_status
    )
      AND (p_from IS NULL OR je.entry_date >= p_from)
      AND (p_to IS NULL OR je.entry_date <= p_to)
    GROUP BY jl.account_id
  )
  SELECT
    a.id AS account_id,
    a.code,
    a.name,
    a.type::text AS type,
    a.normal_balance::text AS normal_balance,
    a.parent_id,
    coalesce(lt.total_debit, 0)::numeric AS total_debit,
    coalesce(lt.total_credit, 0)::numeric AS total_credit,
    CASE
      WHEN a.normal_balance = 'debit'::public.coa_normal_balance
        THEN coalesce(lt.total_debit, 0) - coalesce(lt.total_credit, 0)
      ELSE coalesce(lt.total_credit, 0) - coalesce(lt.total_debit, 0)
    END::numeric AS balance
  FROM public.chart_of_accounts a
  LEFT JOIN line_totals lt
    ON lt.account_id = a.id
  ORDER BY a.code;
$$;

REVOKE ALL ON FUNCTION public.get_account_balances(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_account_balances(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_account_balances(date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_account_ledger(
  p_account_id uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  account_normal_balance text,
  account_parent_id uuid,
  account_is_active boolean,
  account_is_system boolean,
  account_description text,
  opening_balance numeric,
  closing_balance numeric,
  total_debit numeric,
  total_credit numeric,
  line_id uuid,
  entry_id uuid,
  entry_number text,
  entry_date date,
  description text,
  source_type text,
  source_id uuid,
  status text,
  debit numeric,
  credit numeric,
  line_description text,
  running_balance numeric
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
  WITH account_row AS (
    SELECT
      a.id,
      a.code,
      a.name,
      a.type,
      a.normal_balance,
      a.parent_id,
      a.is_active,
      a.is_system,
      a.description
    FROM public.chart_of_accounts a
    WHERE a.id = p_account_id
  ),
  opening AS (
    SELECT
      coalesce(sum(jl.debit), 0)::numeric AS opening_debit,
      coalesce(sum(jl.credit), 0)::numeric AS opening_credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je
      ON je.id = jl.entry_id
    WHERE jl.account_id = p_account_id
      AND je.status IN (
        'posted'::public.journal_status,
        'reversed'::public.journal_status
      )
      AND p_from IS NOT NULL
      AND je.entry_date < p_from
  ),
  period_lines AS (
    SELECT
      jl.id AS line_id,
      je.id AS entry_id,
      je.entry_number,
      je.entry_date,
      je.created_at AS entry_created_at,
      je.description,
      je.source_type,
      je.source_id,
      je.status,
      jl.debit,
      jl.credit,
      jl.description AS line_description,
      jl.line_order,
      CASE
        WHEN ar.normal_balance = 'debit'::public.coa_normal_balance
          THEN jl.debit - jl.credit
        ELSE jl.credit - jl.debit
      END::numeric AS signed_delta
    FROM public.journal_lines jl
    JOIN public.journal_entries je
      ON je.id = jl.entry_id
    CROSS JOIN account_row ar
    WHERE jl.account_id = p_account_id
      AND je.status IN (
        'posted'::public.journal_status,
        'reversed'::public.journal_status
      )
      AND (p_from IS NULL OR je.entry_date >= p_from)
      AND (p_to IS NULL OR je.entry_date <= p_to)
  ),
  period_summary AS (
    SELECT
      coalesce(sum(pl.debit), 0)::numeric AS total_debit,
      coalesce(sum(pl.credit), 0)::numeric AS total_credit,
      coalesce(sum(pl.signed_delta), 0)::numeric AS total_signed
    FROM period_lines pl
  ),
  with_running AS (
    SELECT
      pl.*,
      sum(pl.signed_delta) OVER (
        ORDER BY pl.entry_date ASC, pl.entry_created_at ASC, pl.line_order ASC, pl.line_id ASC
      )::numeric AS period_running
    FROM period_lines pl
  ),
  balances AS (
    SELECT
      ar.*,
      CASE
        WHEN ar.normal_balance = 'debit'::public.coa_normal_balance
          THEN o.opening_debit - o.opening_credit
        ELSE o.opening_credit - o.opening_debit
      END::numeric AS opening_balance,
      ps.total_debit,
      ps.total_credit,
      ps.total_signed
    FROM account_row ar
    CROSS JOIN opening o
    CROSS JOIN period_summary ps
  )
  SELECT
    b.id AS account_id,
    b.code AS account_code,
    b.name AS account_name,
    b.type::text AS account_type,
    b.normal_balance::text AS account_normal_balance,
    b.parent_id AS account_parent_id,
    b.is_active AS account_is_active,
    b.is_system AS account_is_system,
    b.description AS account_description,
    b.opening_balance,
    (b.opening_balance + b.total_signed)::numeric AS closing_balance,
    b.total_debit,
    b.total_credit,
    wr.line_id,
    wr.entry_id,
    wr.entry_number,
    wr.entry_date,
    wr.description,
    wr.source_type::text AS source_type,
    wr.source_id,
    wr.status::text AS status,
    wr.debit,
    wr.credit,
    wr.line_description,
    CASE
      WHEN wr.line_id IS NULL THEN NULL
      ELSE (b.opening_balance + wr.period_running)::numeric
    END AS running_balance
  FROM balances b
  LEFT JOIN with_running wr
    ON true
  ORDER BY wr.entry_date ASC NULLS LAST,
           wr.entry_created_at ASC NULLS LAST,
           wr.line_order ASC NULLS LAST,
           wr.line_id ASC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.get_account_ledger(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_account_ledger(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_account_ledger(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.get_account_balances(date, date) IS
  'Account balances including original reversed entries and their posted reversal audit entries; drafts excluded.';
COMMENT ON FUNCTION public.get_account_ledger(uuid, date, date) IS
  'Account ledger including original reversed entries and their posted reversal audit entries; drafts excluded.';
