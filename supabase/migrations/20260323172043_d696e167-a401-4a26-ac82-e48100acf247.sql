
DROP POLICY IF EXISTS "signatures_read" ON storage.objects;
DROP POLICY IF EXISTS "signatures_insert" ON storage.objects;
DROP POLICY IF EXISTS "signatures_update" ON storage.objects;
DROP POLICY IF EXISTS "signatures_delete" ON storage.objects;

CREATE POLICY "signatures_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'signatures');

CREATE POLICY "signatures_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'signatures' AND auth.role() = 'authenticated');

CREATE POLICY "signatures_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'signatures' AND auth.role() = 'authenticated');

CREATE POLICY "signatures_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);
