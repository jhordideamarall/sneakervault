-- Operational hardening without resetting data.
-- Scope:
-- 1. Inactive profiles no longer receive roles in RLS helpers.
-- 2. Stock/HPP SECURITY DEFINER RPCs validate caller roles internally.
-- 3. stock_movements INSERT is routed through a typed RPC instead of a broad INSERT policy.

CREATE OR REPLACE FUNCTION public.get_my_roles()
RETURNS user_role[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT roles
    FROM profiles
    WHERE id = auth.uid()
      AND is_active = true
  ), '{}'::user_role[]);
$$;

CREATE OR REPLACE FUNCTION public.increment_product_quantity(p_id uuid, qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_any_role(ARRAY['owner','admin_gudang','admin_online','shopkeeper','finance']::user_role[]) THEN
    RAISE EXCEPTION 'Not allowed to update stock quantity';
  END IF;

  IF qty <= 0 THEN
    RAISE EXCEPTION 'qty must be positive';
  END IF;

  UPDATE products
  SET quantity = quantity + qty,
      updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % not found', p_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_product_quantity(p_id uuid, qty integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF NOT public.has_any_role(ARRAY['owner','admin_gudang','admin_online','shopkeeper','finance']::user_role[]) THEN
    RAISE EXCEPTION 'Not allowed to update stock quantity';
  END IF;

  IF qty <= 0 THEN
    RAISE EXCEPTION 'qty must be positive';
  END IF;

  UPDATE products
  SET quantity = quantity - qty,
      updated_at = now()
  WHERE id = p_id
    AND quantity >= qty;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_hpp_by_sku(
  p_product_id    uuid,
  p_new_qty       integer,
  p_new_unit_cost numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_qty integer;
  old_hpp     numeric;
  new_hpp     numeric;
BEGIN
  IF NOT public.has_any_role(ARRAY['owner','admin_gudang','finance']::user_role[]) THEN
    RAISE EXCEPTION 'Only owner, admin_gudang, or finance may recalculate HPP';
  END IF;

  IF p_new_qty <= 0 THEN
    RAISE EXCEPTION 'p_new_qty must be positive';
  END IF;
  IF p_new_unit_cost < 0 THEN
    RAISE EXCEPTION 'p_new_unit_cost cannot be negative';
  END IF;

  SELECT quantity, hpp INTO current_qty, old_hpp
  FROM products
  WHERE id = p_product_id;

  IF current_qty IS NULL THEN
    RAISE EXCEPTION 'product % not found', p_product_id;
  END IF;

  IF current_qty <= 0 THEN
    RETURN;
  END IF;

  new_hpp := (
    ((current_qty - p_new_qty) * old_hpp) + (p_new_qty * p_new_unit_cost)
  ) / current_qty;

  UPDATE products
     SET hpp = new_hpp,
         updated_at = now()
   WHERE id = p_product_id;
END;
$$;

DROP POLICY IF EXISTS "stock_movements_insert_authenticated" ON public.stock_movements;

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
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_roles user_role[];
  new_id uuid;
BEGIN
  caller_roles := public.get_my_roles();

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity must be positive';
  END IF;

  IF p_unit_cost < 0 THEN
    RAISE EXCEPTION 'unit_cost cannot be negative';
  END IF;

  IF p_type = 'inbound' AND NOT (caller_roles && ARRAY['owner','admin_gudang','finance']::user_role[]) THEN
    RAISE EXCEPTION 'Only owner/admin_gudang/finance can create inbound movements';
  END IF;

  IF p_type = 'outbound' AND NOT (caller_roles && ARRAY['owner','shopkeeper','admin_online','finance']::user_role[]) THEN
    RAISE EXCEPTION 'Only owner/shopkeeper/admin_online/finance can create outbound movements';
  END IF;

  IF p_type IN ('return_in','return_out') AND NOT (caller_roles && ARRAY['owner','admin_gudang','admin_online']::user_role[]) THEN
    RAISE EXCEPTION 'Only owner/admin_gudang/admin_online can create return movements';
  END IF;

  IF p_type = 'adjustment' AND NOT (caller_roles && ARRAY['owner','admin_gudang']::user_role[]) THEN
    RAISE EXCEPTION 'Only owner/admin_gudang can create adjustment movements';
  END IF;

  INSERT INTO stock_movements (
    product_id,
    type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    notes,
    performed_by
  )
  VALUES (
    p_product_id,
    p_type,
    p_quantity,
    p_unit_cost,
    p_reference_type,
    p_reference_id,
    p_notes,
    auth.uid()
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_stock_movement(uuid, stock_movement_type, integer, numeric, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_movement(uuid, stock_movement_type, integer, numeric, text, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.get_my_roles() IS
  'Returns roles only for active profiles. Inactive users receive no roles for RLS and RPC checks.';

COMMENT ON FUNCTION public.create_stock_movement(uuid, stock_movement_type, integer, numeric, text, uuid, text) IS
  'Role-gated stock movement writer. Use from server actions instead of broad stock_movements INSERT policies.';

-- Storage advisor hardening for the public chat-attachments bucket.
-- Public object URLs keep working, but authenticated users no longer get a broad
-- SELECT policy that can list every object metadata row.
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload to own folder in chat" ON storage.objects;

CREATE POLICY "Authenticated read own chat attachment metadata"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (
        (storage.foldername(name))[1] = 'avatars'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
    )
  );

CREATE POLICY "Authenticated upload scoped chat attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (
        (storage.foldername(name))[1] = 'avatars'
        AND (storage.foldername(name))[2] = auth.uid()::text
      )
    )
  );
