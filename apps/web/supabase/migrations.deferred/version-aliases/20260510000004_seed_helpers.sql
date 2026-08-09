-- ============================================================================
-- SneakerVault — 04: Seed helpers
-- ============================================================================
-- One-time bootstrap: the first user to sign up has an empty roles array
-- (set by handle_new_user trigger). Until someone is owner, no one can assign
-- roles. This file provides a SECURITY DEFINER function that promotes a user
-- to 'owner' IFF no owner exists yet, which is safe to expose but useless
-- after the initial bootstrap.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bootstrap_first_owner(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id uuid;
  owner_count integer;
BEGIN
  -- If an owner already exists, this function is a no-op — prevents abuse.
  SELECT COUNT(*) INTO owner_count
  FROM profiles
  WHERE 'owner'::user_role = ANY(roles);

  IF owner_count > 0 THEN
    RAISE EXCEPTION 'An owner already exists. Use the settings UI to assign roles.';
  END IF;

  SELECT id INTO target_id
  FROM profiles
  WHERE email = p_email;

  IF target_id IS NULL THEN
    RAISE EXCEPTION 'No profile found for email %. The user must sign up first.', p_email;
  END IF;

  UPDATE profiles
  SET roles = ARRAY['owner']::user_role[]
  WHERE id = target_id;
END;
$$;

-- Only callable by anon/authenticated until first owner is created, then
-- it raises on subsequent calls. Grant to authenticated so you can run it
-- from the SQL editor while logged in; anon grant is also fine because the
-- function itself enforces the one-time rule.
GRANT EXECUTE ON FUNCTION public.bootstrap_first_owner(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_owner(text) TO anon;

-- ─── Usage (after deploying all migrations) ─────────────────────────────────
-- 1) Sign up the owner account through the app at /login (or Supabase dashboard).
-- 2) Run exactly once in SQL editor:
--      SELECT public.bootstrap_first_owner('owner@example.com');
-- 3) From then on, assign roles via the /settings UI (owner only).
