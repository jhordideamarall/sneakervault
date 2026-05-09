-- ============================================================================
-- SneakerVault — 03: Row Level Security policies
-- ============================================================================
-- Depends on has_role/has_any_role helpers from 01_functions.sql.
--
-- Design principles:
-- 1. Every table has RLS enabled (default deny).
-- 2. SELECT is broadly allowed to authenticated users (except activity_logs).
-- 3. Mutations are role-scoped. Stock changes bypass RLS via SECURITY DEFINER
--    RPCs (see decrement_product_quantity / increment_product_quantity).
-- 4. No DELETE on audit tables (activity_logs, delete_requests) or immutable
--    records (packing_items except in 'packing' status, stock_movements except
--    for outbound rollback).
-- ============================================================================

ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_batches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE delete_requests   ENABLE ROW LEVEL SECURITY;

-- ─── profiles ───────────────────────────────────────────────────────────────
-- All authenticated users can read profiles (need full_name for display).
-- Each user can update their own profile; guard_profiles_roles trigger
-- prevents non-owners from changing the roles field.
-- Owner can update any profile (including roles assignment).

CREATE POLICY "profiles_select_authenticated" ON profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "profiles_update_self" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_owner" ON profiles
  FOR UPDATE TO authenticated
  USING (public.has_role('owner'))
  WITH CHECK (public.has_role('owner'));

-- Bootstrap: one-time insert path used by seed helpers. Normal inserts
-- happen via the handle_new_user trigger (SECURITY DEFINER).
CREATE POLICY "profiles_insert_owner" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role('owner'));

-- ─── suppliers ──────────────────────────────────────────────────────────────
CREATE POLICY "suppliers_select_authenticated" ON suppliers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "suppliers_insert_gudang_owner" ON suppliers
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','admin_gudang']::user_role[]));

CREATE POLICY "suppliers_update_gudang_owner" ON suppliers
  FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','admin_gudang']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','admin_gudang']::user_role[]));

-- ─── products ───────────────────────────────────────────────────────────────
CREATE POLICY "products_select_authenticated" ON products
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "products_insert_gudang_owner" ON products
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','admin_gudang']::user_role[]));

CREATE POLICY "products_update_gudang_owner" ON products
  FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','admin_gudang']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','admin_gudang']::user_role[]));

-- Note: stock decrement by shopkeepers goes through decrement_product_quantity
-- (SECURITY DEFINER), which bypasses RLS. Stock increment (returns, rollback)
-- goes through increment_product_quantity for the same reason.

-- ─── purchase_batches ───────────────────────────────────────────────────────
CREATE POLICY "purchase_batches_select_authenticated" ON purchase_batches
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "purchase_batches_insert_gudang_owner" ON purchase_batches
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','admin_gudang']::user_role[]));

CREATE POLICY "purchase_batches_update_gudang_owner" ON purchase_batches
  FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','admin_gudang']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','admin_gudang']::user_role[]));

-- ─── stock_movements ────────────────────────────────────────────────────────
-- Insert is broadly allowed (server actions always set performed_by=auth.uid).
-- No updates. Delete only for rolling back a packing_item that was removed.

CREATE POLICY "stock_movements_select_authenticated" ON stock_movements
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_movements_insert_authenticated" ON stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "stock_movements_delete_packing_rollback" ON stock_movements
  FOR DELETE TO authenticated
  USING (
    reference_type = 'packing_item'
    AND public.has_any_role(ARRAY['owner','shopkeeper']::user_role[])
  );

-- ─── packing_sessions ───────────────────────────────────────────────────────
CREATE POLICY "packing_sessions_select_authenticated" ON packing_sessions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "packing_sessions_insert_shop_owner" ON packing_sessions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','shopkeeper']::user_role[]));

-- Update allowed for any role that manages status transitions. The server
-- action enforces which (from,to) transitions each role may perform.
CREATE POLICY "packing_sessions_update_workflow" ON packing_sessions
  FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','shopkeeper','admin_online']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','shopkeeper','admin_online']::user_role[]));

-- ─── packing_items ──────────────────────────────────────────────────────────
-- Immutable once inserted. Delete only while parent session is still 'packing'.

CREATE POLICY "packing_items_select_authenticated" ON packing_items
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "packing_items_insert_shop_owner" ON packing_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','shopkeeper']::user_role[]));

CREATE POLICY "packing_items_delete_while_packing" ON packing_items
  FOR DELETE TO authenticated
  USING (
    public.has_any_role(ARRAY['owner','shopkeeper']::user_role[])
    AND EXISTS (
      SELECT 1 FROM packing_sessions
      WHERE id = packing_items.packing_session_id
        AND status = 'packing'
    )
  );

-- ─── returns ────────────────────────────────────────────────────────────────
-- initiate: admin_online / owner
-- verify:   admin_gudang / owner (physical check)
-- process: admin_gudang / owner (stock adjustment)
-- Server actions gate each action by status. RLS is the final safety net.

CREATE POLICY "returns_select_authenticated" ON returns
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "returns_insert_online_owner" ON returns
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['owner','admin_online']::user_role[]));

CREATE POLICY "returns_update_gudang_online_owner" ON returns
  FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['owner','admin_gudang','admin_online']::user_role[]))
  WITH CHECK (public.has_any_role(ARRAY['owner','admin_gudang','admin_online']::user_role[]));

-- ─── activity_logs ──────────────────────────────────────────────────────────
-- Only owner can read. Any authenticated user can insert (server actions log
-- their own mutations). No updates or deletes — this is an immutable audit trail.

CREATE POLICY "activity_logs_select_owner" ON activity_logs
  FOR SELECT TO authenticated
  USING (public.has_role('owner'));

CREATE POLICY "activity_logs_insert_authenticated" ON activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ─── delete_requests ────────────────────────────────────────────────────────
-- Anyone can request. Requester can read their own. Owner reads all and
-- approves/rejects (status + reviewed_by update).

CREATE POLICY "delete_requests_select_self_or_owner" ON delete_requests
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.has_role('owner'));

CREATE POLICY "delete_requests_insert_authenticated" ON delete_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND requested_by = auth.uid());

CREATE POLICY "delete_requests_update_owner" ON delete_requests
  FOR UPDATE TO authenticated
  USING (public.has_role('owner'))
  WITH CHECK (public.has_role('owner'));
