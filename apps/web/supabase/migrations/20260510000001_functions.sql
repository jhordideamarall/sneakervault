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
-- HPP Baru = (Stok Lama × HPP Lama + Qty Baru × Harga Beli Baru) / (Stok Lama + Qty Baru)
CREATE OR REPLACE FUNCTION public.recalculate_hpp_by_model(
  p_brand text, 
  p_model text,
  p_new_qty integer,
  p_new_unit_cost numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_total_qty integer;
  current_hpp numeric;
  new_weighted_hpp numeric;
BEGIN
  -- 1. Get current state (use MAX(hpp) as baseline in case of size inconsistencies)
  SELECT 
    COALESCE(SUM(quantity), 0),
    COALESCE(MAX(hpp), 0)
  INTO current_total_qty, current_hpp
  FROM products
  WHERE brand = p_brand AND model = p_model AND is_active = true;

  -- 2. Formula: ( (TotalQty - NewQty) * OldHPP + (NewQty * NewCost) ) / TotalQty
  -- We use the state AFTER increment because it's easier to get current TotalQty
  IF current_total_qty > 0 THEN
    new_weighted_hpp := (
      ((current_total_qty - p_new_qty) * current_hpp) + (p_new_qty * p_new_unit_cost)
    ) / current_total_qty;

    UPDATE products
    SET hpp = new_weighted_hpp, updated_at = now()
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
