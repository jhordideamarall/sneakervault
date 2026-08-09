-- Security hardening: lock down RPC permissions + fix mutable search_path.
REVOKE EXECUTE ON FUNCTION public.generate_po_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_purchase_invoice_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_vendor_payment_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_sales_invoice_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_customer_payment_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_journal_entry_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_product_quantity(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decrement_product_quantity(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_hpp_by_sku(uuid, integer, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_hpp_by_model(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_hpp_by_model(text, text, integer, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_product_condition(uuid, public.product_condition, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_roles() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(public.user_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(public.user_role[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_chat_rate_limit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_chat_attachments() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_profile_roles() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
-- Admin-only bootstrap from authenticated too
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_owner(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bootstrap_employee_role(text, public.user_role) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_chat_attachments() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_roles() FROM authenticated;
-- Fix mutable search_path
ALTER FUNCTION public.search_products_fuzzy(text, integer, real)
  SET search_path = public, pg_temp;
