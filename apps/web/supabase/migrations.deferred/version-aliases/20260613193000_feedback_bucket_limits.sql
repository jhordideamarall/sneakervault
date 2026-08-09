-- Batasi bucket feedback-screenshots: hanya gambar, maks 5MB.
-- Defense-in-depth: accept="image/*" di form hanya filter client-side.
update storage.buckets
set
  file_size_limit = 5242880, -- 5 MB
  allowed_mime_types = array['image/png','image/jpeg','image/jpg','image/webp','image/gif']
where id = 'feedback-screenshots';
