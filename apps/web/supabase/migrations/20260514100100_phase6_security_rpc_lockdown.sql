-- Phase 6 — Security: Lock down SECURITY DEFINER RPCs + fix mutable search_path.
--
-- Problem: All RPCs were callable by `anon` via PUBLIC default grant.
-- Fix:
--   - REVOKE from PUBLIC (removes anon access via inheritance)
--   - GRANT only to `authenticated` for legitimate business RPCs
--   - Admin-only functions (bootstrap, triggers) locked to service_role + postgres only
--   - Fix search_path on search_products_fuzzy (prevent search-path hijack)

-- Business RPCs: revoke PUBLIC, keep authenticated
REVOKE EXECUTE ON FUNCTION public.generate_po_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_purchase_invoice_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_vendor_payment_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_sales_invoice_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_customer_payment_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_journal_entry_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_product_quantity(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_product_quantity(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalculate_hpp_by_sku(uuid, integer, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalculate_hpp_by_model(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalculate_hpp_by_model(text, text, integer, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_product_condition(uuid, public.product_condition, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_roles() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(public.user_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_any_role(public.user_role[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_chat_rate_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_products_fuzzy(text, integer, real) FROM PUBLIC;

-- Admin/internal: revoke from ALL non-service roles
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_owner(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bootstrap_employee_role(text, public.user_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_chat_attachments() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_roles() FROM PUBLIC, anon, authenticated;

-- Explicit grants to authenticated for business RPCs
GRANT EXECUTE ON FUNCTION public.generate_po_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_purchase_invoice_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_vendor_payment_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_sales_invoice_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_customer_payment_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_journal_entry_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_product_quantity(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_product_quantity(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_hpp_by_sku(uuid, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product_condition(uuid, public.product_condition, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(public.user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(public.user_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_products_fuzzy(text, integer, real) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_chat_rate_limit() TO authenticated;

-- Fix mutable search_path vulnerability on fuzzy search function
ALTER FUNCTION public.search_products_fuzzy(text, integer, real)
  SET search_path = public, pg_temp;
