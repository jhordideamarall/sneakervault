-- Create a bucket for chat attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS for the bucket
-- Allow authenticated users to upload files
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-attachments');

-- Allow everyone to read chat attachments (public bucket)
CREATE POLICY "Allow public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat-attachments');

-- Allow users to delete their own uploads
CREATE POLICY "Allow individual delete access"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-attachments' AND owner = auth.uid());
