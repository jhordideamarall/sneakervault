-- Phase 4: Hardening — RLS tightening, rate limit, cleanup cron, permission revokes

-- 4.1 Tighten RLS: SELECT/UPDATE from public → authenticated
DROP POLICY IF EXISTS "Users can see messages they sent or received" ON internal_messages;
CREATE POLICY "Users can see messages they sent or received" ON internal_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Receivers can mark messages as read" ON internal_messages;
CREATE POLICY "Receivers can mark messages as read" ON internal_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- 4.3 Cleanup cron job for old attachments
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;

CREATE OR REPLACE FUNCTION public.cleanup_old_chat_attachments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  retention_days int;
  cutoff timestamptz;
BEGIN
  SELECT (value::text)::int INTO retention_days
  FROM app_settings WHERE key = 'chat_attachment_retention_days';
  IF retention_days IS NULL THEN retention_days := 180; END IF;
  cutoff := now() - (retention_days || ' days')::interval;
  DELETE FROM storage.objects
  WHERE bucket_id = 'chat-attachments' AND created_at < cutoff;
END;
$$;

SELECT cron.schedule(
  'cleanup-chat-attachments',
  '0 3 * * *',
  $$SELECT public.cleanup_old_chat_attachments()$$
);

-- 4.4 Rate limit trigger
CREATE OR REPLACE FUNCTION public.check_chat_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_per_minute int;
  recent_count int;
BEGIN
  IF NEW.is_system THEN RETURN NEW; END IF;
  SELECT (value::text)::int INTO max_per_minute
  FROM app_settings WHERE key = 'chat_rate_limit_per_minute';
  IF max_per_minute IS NULL THEN max_per_minute := 30; END IF;
  SELECT count(*) INTO recent_count
  FROM internal_messages
  WHERE sender_id = NEW.sender_id AND is_system = false
    AND created_at > now() - interval '1 minute';
  IF recent_count >= max_per_minute THEN
    RAISE EXCEPTION 'Rate limit exceeded: max % messages per minute', max_per_minute;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_chat_rate_limit
  BEFORE INSERT ON internal_messages
  FOR EACH ROW
  EXECUTE FUNCTION check_chat_rate_limit();

-- Revoke direct execute on internal functions
REVOKE EXECUTE ON FUNCTION public.check_chat_rate_limit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_chat_attachments() FROM anon, authenticated;
