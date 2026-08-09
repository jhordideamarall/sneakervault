-- ============================================================================
-- SneakerVault — 06: Fix bootstrap_first_owner blocked by guard_profile_roles
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_profile_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_count integer;
BEGIN
  IF NEW.roles IS DISTINCT FROM OLD.roles THEN
    -- Allow if no owner exists yet (bootstrap scenario)
    SELECT COUNT(*) INTO owner_count
    FROM profiles WHERE 'owner'::user_role = ANY(roles);

    IF owner_count > 0 AND NOT public.has_role('owner') THEN
      RAISE EXCEPTION 'Only owner can change roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
