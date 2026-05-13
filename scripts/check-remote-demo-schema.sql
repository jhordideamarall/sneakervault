select 'user_role' as section, enumlabel as value
from pg_enum
join pg_type on pg_type.oid = pg_enum.enumtypid
where typname = 'user_role'
order by enumsortorder;

select 'profile' as section, email as value, roles::text as extra
from public.profiles
order by email;

select
  'tables' as section,
  to_regclass('public.purchase_orders')::text as purchase_orders,
  to_regclass('public.sales_invoices')::text as sales_invoices,
  to_regclass('public.bank_accounts')::text as bank_accounts,
  to_regclass('public.journal_entries')::text as journal_entries;
