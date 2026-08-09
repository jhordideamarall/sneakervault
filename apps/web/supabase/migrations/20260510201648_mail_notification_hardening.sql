-- =============================================================================
-- Mail/Notification Hardening Migration
-- =============================================================================
-- Tujuan:
-- 1. Tambah kolom is_system untuk membedakan notif sistem vs chat manual
-- 2. Harden RLS: regular users tidak bisa insert dengan is_system=true atau ubah field selain is_read
-- 3. Tambah indeks untuk lookup notif (related_entity, conversation, metadata)
-- 4. Tambah app_settings + notification_preferences
-- 5. Storage: limit 10MB + restrict MIME types untuk chat-attachments
-- 6. Fix security advisor: function search_path dan public bucket listing
-- =============================================================================

-- 1. is_system column ----------------------------------------------------------
ALTER TABLE public.internal_messages
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.internal_messages.is_system IS
  'TRUE jika auto-generated notif dari event sistem. FALSE untuk chat manual antar user.';

-- 2. Harden INSERT policy: no client-side is_system=true ----------------------
DROP POLICY IF EXISTS "Users can send messages" ON public.internal_messages;
CREATE POLICY "Users can send messages"
  ON public.internal_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND is_system = false
  );

-- 3. Guard trigger: hanya is_read yang boleh berubah via UPDATE oleh user -----
CREATE OR REPLACE FUNCTION public.guard_internal_messages_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
     OR NEW.subject IS DISTINCT FROM OLD.subject
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
     OR NEW.attachment_urls IS DISTINCT FROM OLD.attachment_urls
     OR NEW.related_entity_type IS DISTINCT FROM OLD.related_entity_type
     OR NEW.related_entity_id IS DISTINCT FROM OLD.related_entity_id
     OR NEW.is_system IS DISTINCT FROM OLD.is_system
     OR NEW.metadata IS DISTINCT FROM OLD.metadata
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only is_read field may be updated';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_internal_messages_update ON public.internal_messages;
CREATE TRIGGER trg_guard_internal_messages_update
  BEFORE UPDATE ON public.internal_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_internal_messages_update();

-- 4. Indeks tambahan untuk notif lookup --------------------------------------
CREATE INDEX IF NOT EXISTS idx_internal_messages_related
  ON public.internal_messages(related_entity_type, related_entity_id)
  WHERE related_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_internal_messages_conversation
  ON public.internal_messages(sender_id, receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_messages_metadata
  ON public.internal_messages USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_internal_messages_is_system_receiver
  ON public.internal_messages(receiver_id, is_system, created_at DESC);

-- 5. App settings table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All can read app settings" ON public.app_settings;
CREATE POLICY "All can read app settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Only owner can modify settings" ON public.app_settings;
CREATE POLICY "Only owner can modify settings"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (public.has_role('owner'::user_role))
  WITH CHECK (public.has_role('owner'::user_role));

-- Default values
INSERT INTO public.app_settings (key, value, description) VALUES
  ('low_stock_threshold', '3'::jsonb, 'Stok < threshold akan trigger notif ke semua karyawan'),
  ('chat_attachment_max_size_mb', '10'::jsonb, 'Maksimum ukuran file lampiran chat (MB)'),
  ('chat_attachment_retention_days', '180'::jsonb, 'Lampiran chat dihapus setelah N hari (sesuai siklus backup PRD NF03)'),
  ('notification_debounce_seconds', '60'::jsonb, 'Window untuk debounce/batch notif tipe sama'),
  ('chat_rate_limit_per_minute', '30'::jsonb, 'Maksimum pesan manual per user per menit (anti-spam)')
ON CONFLICT (key) DO NOTHING;

-- 6. Notification preferences (per user) -------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  muted_event_types TEXT[] DEFAULT '{}',
  digest_mode BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users manage own notification preferences"
  ON public.notification_preferences FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. Storage hardening: 10MB limit + MIME whitelist --------------------------
UPDATE storage.buckets
SET
  file_size_limit = 10485760,  -- 10 MB
  allowed_mime_types = ARRAY[
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
WHERE id = 'chat-attachments';

-- 8. Tighten storage SELECT (fix advisor warning: public listing) ------------
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
CREATE POLICY "Authenticated read chat attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-attachments');

-- 9. Tighten storage INSERT: must upload to own folder -----------------------
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
CREATE POLICY "Authenticated upload to own folder in chat"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 10. Fix function_search_path_mutable advisor for set_updated_at ------------
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- 11. Helper function untuk insert notif sistem (bypass RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.create_system_notification(
  p_receiver_id UUID,
  p_content TEXT,
  p_subject TEXT DEFAULT NULL,
  p_related_entity_type TEXT DEFAULT NULL,
  p_related_entity_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_actor UUID;
BEGIN
  -- Pakai auth.uid() bila ada (server action context), fallback ke receiver itu sendiri
  v_actor := COALESCE(auth.uid(), p_receiver_id);

  INSERT INTO public.internal_messages (
    sender_id, receiver_id, subject, content,
    related_entity_type, related_entity_id, metadata, is_system
  ) VALUES (
    v_actor, p_receiver_id, p_subject, p_content,
    p_related_entity_type, p_related_entity_id, p_metadata, true
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Hanya service_role yang boleh execute (server actions pakai service client)
REVOKE EXECUTE ON FUNCTION public.create_system_notification FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_system_notification TO service_role;

COMMENT ON FUNCTION public.create_system_notification IS
  'Insert system-generated notification message. Dipanggil server-side via service_role saja. Bypass RLS.';
