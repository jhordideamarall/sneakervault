update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array['image/png','image/jpeg','image/jpg','image/webp','image/gif']
where id = 'feedback-screenshots';
