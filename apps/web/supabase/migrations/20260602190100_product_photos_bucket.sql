-- Public bucket for product photos. Upload/delete limited to product managers
-- (owner/admin_gudang). Display works via public URL (bucket public, no RLS read needed).
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "product photos upload by stock managers" ON storage.objects;
CREATE POLICY "product photos upload by stock managers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos'
    AND (select public.has_any_role(ARRAY['owner','admin_gudang']::user_role[]))
  );

DROP POLICY IF EXISTS "product photos delete by stock managers" ON storage.objects;
CREATE POLICY "product photos delete by stock managers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND (select public.has_any_role(ARRAY['owner','admin_gudang']::user_role[]))
  );
