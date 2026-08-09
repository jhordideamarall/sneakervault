-- Accounting and transaction page performance:
-- - list pages use composite indexes matching their ORDER BY patterns
-- - financial statements aggregate journal lines inside Postgres
-- - account ledger computes opening/running balances in Postgres
--
-- SECURITY INVOKER preserves the same RLS behavior as direct table reads.

CREATE INDEX IF NOT EXISTS idx_sales_invoices_invoice_date_created_at
  ON public.sales_invoices (invoice_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_at
  ON public.purchase_orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_invoice_date_created_at
  ON public.purchase_invoices (invoice_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_date_created_at
  ON public.bank_transactions (transaction_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vendor_payments_date_created_at
  ON public.vendor_payments (payment_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_payments_date_created_at
  ON public.customer_payments (payment_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date_created_at
  ON public.journal_entries (entry_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_journal_lines_account_entry_order
  ON public.journal_lines (account_id, entry_id, line_order);

CREATE OR REPLACE FUNCTION public.get_sales_invoice_list(
  p_limit integer DEFAULT 1000
)
RETURNS TABLE (
  id uuid,
  invoice_number text,
  customer_id uuid,
  customer_name text,
  channel text,
  invoice_date date,
  due_date date,
  subtotal numeric,
  discount numeric,
  shipping numeric,
  marketplace_fee numeric,
  tax numeric,
  total numeric,
  paid_amount numeric,
  status text,
  marketplace_order_id text,
  notes text,
  created_at timestamptz,
  line_count bigint
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
  SELECT
    si.id,
    si.invoice_number,
    si.customer_id,
    si.customer_name,
    si.channel::text AS channel,
    si.invoice_date,
    si.due_date,
    si.subtotal,
    si.discount,
    si.shipping,
    si.marketplace_fee,
    si.tax,
    si.total,
    si.paid_amount,
    si.status::text AS status,
    si.marketplace_order_id,
    si.notes,
    si.created_at,
    coalesce(lines.line_count, 0)::bigint AS line_count
  FROM public.sales_invoices si
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS line_count
    FROM public.sales_invoice_lines sil
    WHERE sil.invoice_id = si.id
  ) lines ON true
  ORDER BY si.invoice_date DESC, si.created_at DESC
  LIMIT greatest(coalesce(p_limit, 1000), 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_invoice_list(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_purchase_order_list(
  p_status text DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE (
  id uuid,
  po_number text,
  supplier_id uuid,
  supplier_name text,
  order_date date,
  expected_date date,
  status text,
  total numeric,
  line_count bigint,
  created_at timestamptz
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
  SELECT
    po.id,
    po.po_number,
    po.supplier_id,
    coalesce(s.name, '—') AS supplier_name,
    po.order_date,
    po.expected_date,
    po.status::text AS status,
    po.total,
    coalesce(lines.line_count, 0)::bigint AS line_count,
    po.created_at
  FROM public.purchase_orders po
  LEFT JOIN public.suppliers s
    ON s.id = po.supplier_id
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS line_count
    FROM public.purchase_order_lines pol
    WHERE pol.po_id = po.id
  ) lines ON true
  WHERE (p_status IS NULL OR po.status = p_status::public.po_status)
    AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
  ORDER BY po.created_at DESC
  LIMIT greatest(coalesce(p_limit, 1000), 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_purchase_order_list(text, uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_receivable_purchase_orders()
RETURNS TABLE (
  id uuid,
  po_number text,
  supplier_name text,
  order_date date,
  expected_date date,
  status text,
  total numeric,
  total_ordered bigint,
  total_received bigint,
  total_remaining bigint
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
  SELECT
    po.id,
    po.po_number,
    coalesce(s.name, '—') AS supplier_name,
    po.order_date,
    po.expected_date,
    po.status::text AS status,
    po.total,
    coalesce(lines.total_ordered, 0)::bigint AS total_ordered,
    coalesce(lines.total_received, 0)::bigint AS total_received,
    (coalesce(lines.total_ordered, 0) - coalesce(lines.total_received, 0))::bigint AS total_remaining
  FROM public.purchase_orders po
  LEFT JOIN public.suppliers s
    ON s.id = po.supplier_id
  LEFT JOIN LATERAL (
    SELECT
      coalesce(sum(pol.ordered_qty), 0)::bigint AS total_ordered,
      coalesce(sum(pol.received_qty), 0)::bigint AS total_received
    FROM public.purchase_order_lines pol
    WHERE pol.po_id = po.id
  ) lines ON true
  WHERE po.status IN ('approved'::public.po_status, 'receiving'::public.po_status)
  ORDER BY po.order_date ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_receivable_purchase_orders() TO authenticated;

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
    WHERE je.status = 'posted'::public.journal_status
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
      AND je.status = 'posted'::public.journal_status
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
        WHEN je.status = 'posted'::public.journal_status
          THEN CASE
            WHEN ar.normal_balance = 'debit'::public.coa_normal_balance
              THEN jl.debit - jl.credit
            ELSE jl.credit - jl.debit
          END
        ELSE 0
      END::numeric AS signed_delta
    FROM public.journal_lines jl
    JOIN public.journal_entries je
      ON je.id = jl.entry_id
    CROSS JOIN account_row ar
    WHERE jl.account_id = p_account_id
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

GRANT EXECUTE ON FUNCTION public.get_account_ledger(uuid, date, date) TO authenticated;
