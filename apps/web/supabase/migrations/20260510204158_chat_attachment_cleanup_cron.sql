
-- Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- Function to clean up old attachments
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
  -- Read retention from app_settings
  SELECT (value::text)::int INTO retention_days
  FROM app_settings WHERE key = 'chat_attachment_retention_days';
  
  IF retention_days IS NULL THEN
    retention_days := 180;
  END IF;

  cutoff := now() - (retention_days || ' days')::interval;

  -- Delete old objects from storage
  DELETE FROM storage.objects
  WHERE bucket_id = 'chat-attachments'
    AND created_at < cutoff;
END;
$$;

-- Schedule daily at 03:00 UTC
SELECT cron.schedule(
  'cleanup-chat-attachments',
  '0 3 * * *',
  $$SELECT public.cleanup_old_chat_attachments()$$
);
