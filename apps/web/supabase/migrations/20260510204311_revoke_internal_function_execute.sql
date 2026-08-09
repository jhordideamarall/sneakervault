
-- These functions are only called by triggers/cron, not directly by users
REVOKE EXECUTE ON FUNCTION public.check_chat_rate_limit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_chat_attachments() FROM anon, authenticated;
