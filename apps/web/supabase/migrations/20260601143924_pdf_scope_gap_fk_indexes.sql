-- Additional FK indexes surfaced by Supabase performance advisor after
-- applying the PDF scope gap tables.

CREATE INDEX IF NOT EXISTS idx_expense_categories_created_by
  ON public.expense_categories (created_by);
CREATE INDEX IF NOT EXISTS idx_expense_categories_updated_by
  ON public.expense_categories (updated_by);

CREATE INDEX IF NOT EXISTS idx_expenses_approved_by
  ON public.expenses (approved_by);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by
  ON public.expenses (paid_by);
CREATE INDEX IF NOT EXISTS idx_expenses_rejected_by
  ON public.expenses (rejected_by);
CREATE INDEX IF NOT EXISTS idx_expenses_voided_by
  ON public.expenses (voided_by);

CREATE INDEX IF NOT EXISTS idx_stock_opname_sessions_reviewed_by
  ON public.stock_opname_sessions (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_stock_opname_sessions_approved_by
  ON public.stock_opname_sessions (approved_by);
CREATE INDEX IF NOT EXISTS idx_stock_opname_sessions_cancelled_by
  ON public.stock_opname_sessions (cancelled_by);

CREATE INDEX IF NOT EXISTS idx_stock_opname_lines_counted_by
  ON public.stock_opname_lines (counted_by);
