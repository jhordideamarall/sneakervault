
-- Tighten SELECT policy: public → authenticated
DROP POLICY "Users can see messages they sent or received" ON internal_messages;
CREATE POLICY "Users can see messages they sent or received" ON internal_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Tighten UPDATE policy: public → authenticated
DROP POLICY "Receivers can mark messages as read" ON internal_messages;
CREATE POLICY "Receivers can mark messages as read" ON internal_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);
