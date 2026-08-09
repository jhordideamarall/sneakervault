
-- Replace broad SELECT with scoped policy (users can only list their own folder)
DROP POLICY "Authenticated read chat attachments" ON storage.objects;
CREATE POLICY "Authenticated read own chat attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
