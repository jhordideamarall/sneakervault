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
),
stock_mismatch as (
  select p.id
  from public.products p
  left join movement_qty m on m.product_id = p.id
  where p.quantity <> coalesce(m.quantity_from_movements, 0)
),
line_totals as (
  select
    entry_id,
    round(sum(debit)::numeric, 2) as line_debit,
    round(sum(credit)::numeric, 2) as line_credit
  from public.journal_lines
  group by entry_id
),
journal_mismatch as (
  select je.id
  from public.journal_entries je
  left join line_totals lt on lt.entry_id = je.id
  where round(je.total_debit::numeric, 2) <> round(je.total_credit::numeric, 2)
     or round(je.total_debit::numeric, 2) <> coalesce(lt.line_debit, 0)
     or round(je.total_credit::numeric, 2) <> coalesce(lt.line_credit, 0)
),
overpaid as (
  select id from public.sales_invoices where paid_amount > total
  union all
  select id from public.purchase_invoices where paid_amount > total
),
latest_tx as (
  select distinct on (bank_account_id)
    bank_account_id,
    balance_after
  from public.bank_transactions
  order by bank_account_id, transaction_date desc, created_at desc
),
bank_mismatch as (
  select ba.id
  from public.bank_accounts ba
  left join latest_tx lt on lt.bank_account_id = ba.id
  where round(ba.current_balance::numeric, 2) <> round(coalesce(lt.balance_after, ba.opening_balance)::numeric, 2)
),
inactive_activity as (
  select p.id
  from public.profiles p
  left join public.activity_logs al on al.user_id = p.id
  where p.is_active = true
  group by p.id
  having count(al.id) = 0
)
select jsonb_pretty(jsonb_build_object(
  'counts', jsonb_build_object(
    'profiles', (select count(*) from public.profiles),
    'suppliers', (select count(*) from public.suppliers),
    'customers', (select count(*) from public.customers),
    'products', (select count(*) from public.products),
    'stock_movements', (select count(*) from public.stock_movements),
    'purchase_orders', (select count(*) from public.purchase_orders),
    'purchase_invoices', (select count(*) from public.purchase_invoices),
    'vendor_payments', (select count(*) from public.vendor_payments),
    'sales_invoices', (select count(*) from public.sales_invoices),
    'customer_payments', (select count(*) from public.customer_payments),
    'journal_entries', (select count(*) from public.journal_entries),
    'activity_logs', (select count(*) from public.activity_logs),
    'internal_messages', (select count(*) from public.internal_messages),
    'returns', (select count(*) from public.returns)
  ),
  'failures', jsonb_build_object(
    'staff_without_activity', (select count(*) from inactive_activity),
    'stock_mismatch', (select count(*) from stock_mismatch),
    'journal_mismatch', (select count(*) from journal_mismatch),
    'overpaid_invoices', (select count(*) from overpaid),
    'bank_balance_mismatch', (select count(*) from bank_mismatch)
  ),
  'mail_by_receiver', (
    select jsonb_agg(row_data order by row_data->>'email')
    from (
      select jsonb_build_object(
        'email', receiver.email,
        'system_notifications', count(*) filter (where im.is_system = true),
        'chat_messages', count(*) filter (where im.is_system = false),
        'unread_messages', count(*) filter (where im.is_read = false)
      ) as row_data
      from public.internal_messages im
      join public.profiles receiver on receiver.id = im.receiver_id
      group by receiver.email
    ) rows
  )
)) as result;
