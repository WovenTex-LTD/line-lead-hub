INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('lina-uploads', 'lina-uploads', false, 52428800)  -- 50 MB
ON CONFLICT (id) DO NOTHING;

-- Uploads use upsert:false (insert only), so no UPDATE policy is needed.
DROP POLICY IF EXISTS "lina_uploads_select" ON storage.objects;
CREATE POLICY "lina_uploads_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lina-uploads' AND (storage.foldername(name))[1] IN (
    SELECT factory_id::text FROM public.profiles WHERE id = auth.uid()
  ));
DROP POLICY IF EXISTS "lina_uploads_insert" ON storage.objects;
CREATE POLICY "lina_uploads_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lina-uploads' AND (storage.foldername(name))[1] IN (
    SELECT factory_id::text FROM public.profiles WHERE id = auth.uid()
  ));
DROP POLICY IF EXISTS "lina_uploads_delete" ON storage.objects;
CREATE POLICY "lina_uploads_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lina-uploads' AND (storage.foldername(name))[1] IN (
    SELECT factory_id::text FROM public.profiles WHERE id = auth.uid()
  ));
