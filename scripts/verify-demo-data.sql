-- Demo data verification checklist.
-- This script is read-only and returns result sets that should be empty for
-- failure checks.

-- 1. Volume summary for presentation readiness.
select 'profiles' as area, count(*)::numeric as total from public.profiles
union all select 'suppliers', count(*) from public.suppliers
union all select 'customers', count(*) from public.customers
union all select 'products', count(*) from public.products
union all select 'stock_movements', count(*) from public.stock_movements
union all select 'purchase_orders', count(*) from public.purchase_orders where to_regclass('public.purchase_orders') is not null
union all select 'purchase_invoices', count(*) from public.purchase_invoices where to_regclass('public.purchase_invoices') is not null
union all select 'sales_invoices', count(*) from public.sales_invoices where to_regclass('public.sales_invoices') is not null
union all select 'customer_payments', count(*) from public.customer_payments where to_regclass('public.customer_payments') is not null
union all select 'journal_entries', count(*) from public.journal_entries where to_regclass('public.journal_entries') is not null
union all select 'activity_logs', count(*) from public.activity_logs
union all select 'internal_messages', count(*) from public.internal_messages
order by area;

-- 2. Every active staff member should have an activity trail.
select
  p.email,
  p.full_name,
  p.roles,
  count(al.id) as activity_count
from public.profiles p
left join public.activity_logs al on al.user_id = p.id
where p.is_active = true
group by p.id, p.email, p.full_name, p.roles
having count(al.id) = 0
order by p.email;

-- 3. Stock quantity must equal stock movement history.
with movement_qty as (
  select
    product_id,
    sum(
      case
        when type in ('inbound', 'return_in') then quantity
        when type in ('outbound', 'return_out') then -quantity
        else quantity
      end
    ) as quantity_from_movements
  from public.stock_movements
  group by product_id
)
select
  p.sku,
  p.quantity as product_quantity,
  coalesce(m.quantity_from_movements, 0) as movement_quantity
from public.products p
left join movement_qty m on m.product_id = p.id
where p.quantity <> coalesce(m.quantity_from_movements, 0)
order by p.sku;

-- 4. Journal entries must be balanced and match their lines.
with line_totals as (
  select
    entry_id,
    round(sum(debit)::numeric, 2) as line_debit,
    round(sum(credit)::numeric, 2) as line_credit
  from public.journal_lines
  group by entry_id
)
select
  je.entry_number,
  je.total_debit,
  je.total_credit,
  lt.line_debit,
  lt.line_credit
from public.journal_entries je
left join line_totals lt on lt.entry_id = je.id
where round(je.total_debit::numeric, 2) <> round(je.total_credit::numeric, 2)
   or round(je.total_debit::numeric, 2) <> coalesce(lt.line_debit, 0)
   or round(je.total_credit::numeric, 2) <> coalesce(lt.line_credit, 0)
order by je.entry_date desc;

-- 5. Paid amounts must not exceed invoice totals.
select 'sales_invoice' as area, invoice_number, total, paid_amount
from public.sales_invoices
where paid_amount > total
union all
select 'purchase_invoice', invoice_number, total, paid_amount
from public.purchase_invoices
where paid_amount > total
order by area, invoice_number;

-- 6. Bank current balance must match latest transaction balance.
with latest_tx as (
  select distinct on (bank_account_id)
    bank_account_id,
    balance_after
  from public.bank_transactions
  order by bank_account_id, transaction_date desc, created_at desc
)
select
  ba.name,
  ba.current_balance,
  coalesce(lt.balance_after, ba.opening_balance) as latest_balance_after
from public.bank_accounts ba
left join latest_tx lt on lt.bank_account_id = ba.id
where round(ba.current_balance::numeric, 2) <> round(coalesce(lt.balance_after, ba.opening_balance)::numeric, 2);

-- 7. Mail/notification health.
select
  receiver.email,
  count(*) filter (where im.is_system = true) as system_notifications,
  count(*) filter (where im.is_system = false) as chat_messages,
  count(*) filter (where im.is_read = false) as unread_messages
from public.internal_messages im
join public.profiles receiver on receiver.id = im.receiver_id
group by receiver.email
order by receiver.email;
