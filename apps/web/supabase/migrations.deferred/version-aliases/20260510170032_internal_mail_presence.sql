-- Create internal_messages table
CREATE TABLE public.internal_messages (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject TEXT,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  related_entity_type TEXT,
  related_entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can see messages they sent or received"
  ON public.internal_messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send messages"
  ON public.internal_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Receivers can mark messages as read"
  ON public.internal_messages FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- Enable Realtime for internal_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_messages;

-- Create an index for faster lookups
CREATE INDEX idx_internal_messages_receiver_read ON public.internal_messages(receiver_id, is_read);
CREATE INDEX idx_internal_messages_sender ON public.internal_messages(sender_id);
