
-- Rate limit: max messages per minute per user (reads from app_settings)
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
  -- System messages bypass rate limit
  IF NEW.is_system THEN
    RETURN NEW;
  END IF;

  SELECT (value::text)::int INTO max_per_minute
  FROM app_settings WHERE key = 'chat_rate_limit_per_minute';
  
  IF max_per_minute IS NULL THEN
    max_per_minute := 30;
  END IF;

  SELECT count(*) INTO recent_count
  FROM internal_messages
  WHERE sender_id = NEW.sender_id
    AND is_system = false
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
