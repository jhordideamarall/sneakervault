-- Add a clean "today" activity trail for dashboard/sidebar demos.
-- Safe to rerun: previous rows marked demo_recent are removed first.

begin;

delete from public.activity_logs
where new_data @> '{"demo_recent": true}'::jsonb;

with actors as (
  select
    (select id from public.profiles where email = 'owner@sneakervault.com') as owner_id,
    (select id from public.profiles where email = 'finance@sneakervault.com') as finance_id,
    (select id from public.profiles where email = 'budi@sneakervault.com') as gudang_id,
    (select id from public.profiles where email = 'siti@sneakervault.com') as online_id,
    (select id from public.profiles where email = 'agus@sneakervault.com') as shop_id
),
refs as (
  select
    (select id from public.products order by updated_at desc nulls last limit 1) as product_id,
    (select id from public.sales_invoices order by created_at desc limit 1) as sales_invoice_id,
    (select id from public.customer_payments order by created_at desc limit 1) as customer_payment_id,
    (select id from public.vendor_payments order by created_at desc limit 1) as vendor_payment_id,
    (select id from public.packing_items order by created_at desc limit 1) as packing_item_id,
    (select id from public.returns order by created_at desc limit 1) as return_id,
    (select id from public.journal_entries order by created_at desc limit 1) as journal_entry_id
),
sample_product as (
  select brand, model, sku, size, color, hpp, sell_price
  from public.products
  order by updated_at desc nulls last
  limit 1
)
insert into public.activity_logs (user_id, action, entity_type, entity_id, old_data, new_data, created_at)
select *
from (
  select
    a.owner_id,
    'review_dashboard',
    'journal_entry',
    r.journal_entry_id,
    null::jsonb,
    jsonb_build_object(
      'demo_recent', true,
      'summary', 'Owner review performa stok, penjualan, dan jurnal hari ini',
      'range', 'today'
    ),
    now() - interval '4 minutes'
  from actors a, refs r

  union all

  select
    a.finance_id,
    'receive_customer_payment',
    'customer_payment',
    r.customer_payment_id,
    null::jsonb,
    jsonb_build_object(
      'demo_recent', true,
      'payment_number', cp.payment_number,
      'amount', cp.amount,
      'customer_name', cp.customer_name
    ),
    now() - interval '9 minutes'
  from actors a, refs r
  join public.customer_payments cp on cp.id = r.customer_payment_id

  union all

  select
    a.finance_id,
    'pay_vendor',
    'vendor_payment',
    r.vendor_payment_id,
    null::jsonb,
    jsonb_build_object(
      'demo_recent', true,
      'payment_number', vp.payment_number,
      'amount', vp.amount
    ),
    now() - interval '16 minutes'
  from actors a, refs r
  join public.vendor_payments vp on vp.id = r.vendor_payment_id

  union all

  select
    a.gudang_id,
    'scan_in',
    'product',
    r.product_id,
    null::jsonb,
    jsonb_build_object(
      'demo_recent', true,
      'brand', p.brand,
      'model', p.model,
      'sku', p.sku,
      'size', p.size,
      'quantity', 4,
      'unit_cost', p.hpp
    ),
    now() - interval '22 minutes'
  from actors a, refs r, sample_product p

  union all

  select
    a.online_id,
    'status_change',
    'sales_invoice',
    r.sales_invoice_id,
    jsonb_build_object('status', 'issued'),
    jsonb_build_object(
      'demo_recent', true,
      'status', 'paid',
      'invoice_number', si.invoice_number,
      'order_id', coalesce(si.marketplace_order_id, si.invoice_number)
    ),
    now() - interval '28 minutes'
  from actors a, refs r
  join public.sales_invoices si on si.id = r.sales_invoice_id

  union all

  select
    a.shop_id,
    'scan_out',
    'packing_item',
    r.packing_item_id,
    null::jsonb,
    jsonb_build_object(
      'demo_recent', true,
      'brand', p.brand,
      'model', p.model,
      'size', p.size,
      'color', p.color,
      'sell_price', p.sell_price
    ),
    now() - interval '34 minutes'
  from actors a, refs r, sample_product p

  union all

  select
    a.gudang_id,
    'return_verified',
    'return',
    r.return_id,
    null::jsonb,
    jsonb_build_object(
      'demo_recent', true,
      'status', 'verified',
      'note', 'Return fisik sudah dicek dan siap diproses'
    ),
    now() - interval '41 minutes'
  from actors a, refs r

  union all

  select
    a.online_id,
    'notification_sent',
    'internal_message',
    null::uuid,
    null::jsonb,
    jsonb_build_object(
      'demo_recent', true,
      'event_type', 'packing.completed',
      'recipients', jsonb_build_array('owner', 'finance'),
      'subject', 'Pesanan selesai dan tercatat otomatis'
    ),
    now() - interval '47 minutes'
  from actors a
) rows(user_id, action, entity_type, entity_id, old_data, new_data, created_at)
where user_id is not null;

commit;
