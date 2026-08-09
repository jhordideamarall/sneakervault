-- Activity logs are immutable audit records. Authenticated callers may append
-- only records attributed to their own JWT user; only owners may read them.
-- SECURITY DEFINER RPCs owned by postgres continue to bypass RLS when they
-- write an audit record on behalf of the current authenticated actor.

REVOKE ALL ON TABLE public.activity_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.activity_logs TO authenticated;
GRANT ALL ON TABLE public.activity_logs TO service_role;

DROP POLICY IF EXISTS activity_logs_insert_authenticated
  ON public.activity_logs;

CREATE POLICY activity_logs_insert_authenticated
  ON public.activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND user_id = (SELECT auth.uid())
  );

COMMENT ON POLICY activity_logs_insert_authenticated
  ON public.activity_logs IS
  'Authenticated users can append immutable activity only as their own JWT user.';
