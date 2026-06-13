-- Lock search_path for inventory RPCs. Supabase security advisor flags mutable
-- search_path even for SECURITY INVOKER functions because unqualified names can
-- otherwise resolve differently for different roles.

ALTER FUNCTION public.get_inventory_page(text, integer, integer)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_inventory_summary(text)
  SET search_path = public, pg_temp;
