-- Update recalculate_hpp_by_model with correct weighted average logic
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
  -- Get current state AFTER the batch increment (confirmInbound calls this after RPC)
  SELECT 
    COALESCE(SUM(quantity), 0),
    COALESCE(MAX(hpp), 0)
  INTO current_total_qty, current_hpp
  FROM products
  WHERE brand = p_brand AND model = p_model AND is_active = true;

  -- Formula: ( (TotalQty - NewQty) * OldHPP + (NewQty * NewCost) ) / TotalQty
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
