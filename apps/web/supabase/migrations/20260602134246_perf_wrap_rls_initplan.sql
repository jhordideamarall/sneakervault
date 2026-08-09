-- Performance: wrap auth.uid()/has_any_role()/has_role()/get_my_roles() in
-- (select ...) across all public RLS policies so Postgres evaluates them ONCE
-- per statement (initplan) instead of once per row. Semantically identical
-- (these are scalar/stable) — only the evaluation count changes.
--
-- Fail-closed: runs in one transaction; any malformed rewrite aborts everything.
DO $$
DECLARE
  r record;
  nq text;
  nc text;
  stmt text;
  cnt int := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual,'') ~ '(auth\.uid\(\)|has_any_role\(|has_role\(|get_my_roles\(\))'
        OR coalesce(with_check,'') ~ '(auth\.uid\(\)|has_any_role\(|has_role\(|get_my_roles\(\))'
      )
  LOOP
    nq := r.qual;
    nc := r.with_check;

    IF nq IS NOT NULL THEN
      nq := regexp_replace(nq, 'auth\.uid\(\)', '(select auth.uid())', 'g');
      nq := regexp_replace(nq, 'has_any_role\(([^()]+)\)', '(select has_any_role(\1))', 'g');
      nq := regexp_replace(nq, 'has_role\(([^()]+)\)', '(select has_role(\1))', 'g');
      nq := regexp_replace(nq, 'get_my_roles\(\)', '(select get_my_roles())', 'g');
    END IF;
    IF nc IS NOT NULL THEN
      nc := regexp_replace(nc, 'auth\.uid\(\)', '(select auth.uid())', 'g');
      nc := regexp_replace(nc, 'has_any_role\(([^()]+)\)', '(select has_any_role(\1))', 'g');
      nc := regexp_replace(nc, 'has_role\(([^()]+)\)', '(select has_role(\1))', 'g');
      nc := regexp_replace(nc, 'get_my_roles\(\)', '(select get_my_roles())', 'g');
    END IF;

    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF nq IS NOT NULL THEN stmt := stmt || ' USING (' || nq || ')'; END IF;
    IF nc IS NOT NULL THEN stmt := stmt || ' WITH CHECK (' || nc || ')'; END IF;

    EXECUTE stmt;
    cnt := cnt + 1;
  END LOOP;

  RAISE NOTICE 'Rewrote % policies', cnt;
END $$;
