
-- Public bucket: URLs work without auth. SELECT policy only affects storage.listObjects API.
-- Keep it scoped to authenticated users (acceptable for a public bucket).
DROP POLICY IF EXISTS "Authenticated read own chat attachments" ON storage.objects;
CREATE POLICY "Authenticated read chat attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments');
