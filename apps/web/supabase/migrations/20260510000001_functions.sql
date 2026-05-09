-- ============================================================================
-- SneakerVault — 01: Functions (RPC, triggers, role helpers)
-- ============================================================================
-- Functions are defined BEFORE triggers and RLS policies that depend on them.
-- All SECURITY DEFINER functions have explicit search_path for safety.
-- ============================================================================

-- ─── Role helpers (used by RLS policies) ────────────────────────────────────

-- Return the roles array of the currently-authenticated user, or '{}' if none.
CREATE OR REPLACE FUNCTION public.get_my_roles()
RETURNS user_role[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT roles FROM profiles WHERE id = auth.uid()), '{}'::user_role[]);
$$;

-- Does the current user have the given role?
CREATE OR REPLACE FUNCTION public.has_role(required user_role)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT required = ANY(public.get_my_roles());
$$;

-- Does the current user have ANY of the given roles?
CREATE OR REPLACE FUNCTION public.has_any_role(required user_role[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.get_my_roles() && required;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_roles()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(user_role)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(user_role[])     TO authenticated;

-- ─── Stock mutation RPCs (bypass RLS for non-owner/admin_gudang roles) ──────

-- Atomically increment a product's quantity. Used for returns and rollbacks.
CREATE OR REPLACE FUNCTION public.increment_product_quantity(p_id uuid, qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF qty <= 0 THEN
    RAISE EXCEPTION 'qty must be positive';
  END IF;
  UPDATE products
  SET quantity = quantity + qty,
      updated_at = now()
  WHERE id = p_id;
END;
$$;

-- Atomically decrement a product's quantity with a stock check.
-- Returns true on success, false if insufficient stock (no rows updated).
-- SECURITY DEFINER so shopkeepers can call it (bypasses products_update RLS).
CREATE OR REPLACE FUNCTION public.decrement_product_quantity(p_id uuid, qty integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF qty <= 0 THEN
    RAISE EXCEPTION 'qty must be positive';
  END IF;
  UPDATE products
  SET quantity = quantity - qty,
      updated_at = now()
  WHERE id = p_id AND quantity >= qty;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_product_quantity(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_product_quantity(uuid, integer) TO authenticated;

-- ─── HPP recalculation (weighted average per model across all sizes) ────────
-- Called after any inbound batch for the given brand+model.
CREATE OR REPLACE FUNCTION public.recalculate_hpp_by_model(p_brand text, p_model text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_qty integer;
  weighted  numeric;
BEGIN
  SELECT
    COALESCE(SUM(quantity), 0),
    CASE WHEN COALESCE(SUM(quantity), 0) = 0 THEN 0
         ELSE SUM(quantity * hpp)::numeric / SUM(quantity)
    END
  INTO total_qty, weighted
  FROM products
  WHERE brand = p_brand AND model = p_model AND is_active = true;

  IF total_qty > 0 THEN
    UPDATE products
    SET hpp = weighted, updated_at = now()
    WHERE brand = p_brand AND model = p_model AND is_active = true;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_hpp_by_model(text, text) TO authenticated;

-- ─── Trigger functions ──────────────────────────────────────────────────────

-- Auto-create a profile row when a new auth.users row is inserted.
-- Runs with elevated privileges (SECURITY DEFINER) because it writes to public
-- from the auth schema. Role is initially empty; owner assigns later.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, roles)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    '{}'::user_role[]
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Generic updated_at maintainer.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Guard rail: prevent changing `roles` on profiles unless the caller is owner.
-- Regular users can update their own profile (name, avatar) but not roles.
CREATE OR REPLACE FUNCTION public.guard_profile_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.roles IS DISTINCT FROM OLD.roles AND NOT public.has_role('owner') THEN
    RAISE EXCEPTION 'Only owner can change roles';
  END IF;
  RETURN NEW;
END;
$$;
