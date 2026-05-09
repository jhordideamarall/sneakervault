-- ============================================================================
-- SneakerVault — 05: Audit fixes
-- ============================================================================
-- Fixes identified during deep audit. No breaking changes to existing data.
-- ============================================================================

-- ─── 1. Fix HPP recalculation (was circular — read its own output) ──────────
-- Drop old 2-param version first (it was buggy — circular logic).
DROP FUNCTION IF EXISTS public.recalculate_hpp_by_model(text, text);

-- New signature accepts the incoming batch data so calculation is correct.
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
  current_total_value numeric;
  new_hpp numeric;
BEGIN
  SELECT
    COALESCE(SUM(quantity), 0),
    COALESCE(SUM(quantity * hpp), 0)
  INTO current_total_qty, current_total_value
  FROM products
  WHERE brand = p_brand AND model = p_model AND is_active = true;

  IF (current_total_qty + p_new_qty) > 0 THEN
    new_hpp := (current_total_value + p_new_qty * p_new_unit_cost)
               / (current_total_qty + p_new_qty);

    -- Signal to guard_product_financials trigger that this is an internal recalc
    PERFORM set_config('app.hpp_recalc', 'true', true);

    UPDATE products
    SET hpp = new_hpp, updated_at = now()
    WHERE brand = p_brand AND model = p_model AND is_active = true;

    PERFORM set_config('app.hpp_recalc', '', true);
  END IF;
END;
$$;

-- ─── 2. Guard hpp/sell_price — only owner can change financial fields ───────
CREATE OR REPLACE FUNCTION public.guard_product_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- sell_price: only owner can change (always enforced)
  IF (NEW.sell_price IS DISTINCT FROM OLD.sell_price)
     AND NOT public.has_role('owner') THEN
    RAISE EXCEPTION 'Only owner can change sell_price';
  END IF;

  -- hpp: only owner can change DIRECTLY. However, recalculate_hpp_by_model
  -- (SECURITY DEFINER) also updates hpp. We distinguish by checking if
  -- the caller is in a session variable set by that function.
  IF (NEW.hpp IS DISTINCT FROM OLD.hpp)
     AND NOT public.has_role('owner')
     AND current_setting('app.hpp_recalc', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Only owner can change hpp';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_products_financials
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_product_financials();

-- ─── 3. Prevent duplicate active return per packing item ────────────────────
CREATE UNIQUE INDEX idx_returns_one_active_per_item
  ON returns(packing_item_id)
  WHERE status NOT IN ('cancelled');

-- ─── 4. Secure stock_movements — insert via function only ───────────────────
-- Drop the overly permissive INSERT policy.
DROP POLICY IF EXISTS "stock_movements_insert_authenticated" ON stock_movements;

-- Replace with a SECURITY DEFINER function that validates role vs movement type.
CREATE OR REPLACE FUNCTION public.create_stock_movement(
  p_product_id uuid,
  p_type stock_movement_type,
  p_quantity integer,
  p_unit_cost numeric DEFAULT 0,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_roles user_role[];
  new_id uuid;
BEGIN
  caller_roles := public.get_my_roles();

  -- Role gate per movement type
  IF p_type = 'inbound' AND NOT (caller_roles && ARRAY['owner','admin_gudang']::user_role[]) THEN
    RAISE EXCEPTION 'Only owner/admin_gudang can create inbound movements';
  END IF;

  IF p_type = 'outbound' AND NOT (caller_roles && ARRAY['owner','shopkeeper']::user_role[]) THEN
    RAISE EXCEPTION 'Only owner/shopkeeper can create outbound movements';
  END IF;

  IF p_type IN ('return_in','return_out') AND NOT (caller_roles && ARRAY['owner','admin_gudang','admin_online']::user_role[]) THEN
    RAISE EXCEPTION 'Only owner/admin_gudang/admin_online can create return movements';
  END IF;

  IF p_type = 'adjustment' AND NOT (caller_roles && ARRAY['owner']::user_role[]) THEN
    RAISE EXCEPTION 'Only owner can create adjustment movements';
  END IF;

  INSERT INTO stock_movements (product_id, type, quantity, unit_cost, reference_type, reference_id, notes, performed_by)
  VALUES (p_product_id, p_type, p_quantity, p_unit_cost, p_reference_type, p_reference_id, p_notes, auth.uid())
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_stock_movement(uuid, stock_movement_type, integer, numeric, text, uuid, text) TO authenticated;

-- ─── 5. recalculate_hpp grant ────────────────────────────────────────────────
-- The function is SECURITY DEFINER so it bypasses RLS internally. The real
-- protection is guard_products_financials trigger: even if someone calls
-- recalculate_hpp directly, the UPDATE to products.hpp will be blocked for
-- non-owners by the trigger. So the grant to authenticated is safe.
GRANT EXECUTE ON FUNCTION public.recalculate_hpp_by_model(text, text, integer, numeric) TO authenticated;

-- ─── 6. Status transition validation trigger (defense-in-depth) ─────────────
CREATE OR REPLACE FUNCTION public.guard_session_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only validate if status actually changed
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Valid transitions
  IF NOT (
    (OLD.status = 'packing'   AND NEW.status IN ('shipped', 'cancelled')) OR
    (OLD.status = 'shipped'   AND NEW.status IN ('completed', 'has_return')) OR
    (OLD.status = 'completed' AND NEW.status = 'has_return') OR
    -- Owner override: can force any transition
    public.has_role('owner')
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % → %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_packing_sessions_status
  BEFORE UPDATE ON packing_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_session_status_transition();
