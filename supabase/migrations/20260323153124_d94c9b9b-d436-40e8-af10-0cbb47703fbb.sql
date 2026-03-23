
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('dispatch-photos', 'dispatch-photos', false, 10485760),
  ('gate-passes', 'gate-passes', false, 20971520),
  ('signatures', 'signatures', false, 5242880);

-- RLS policies for dispatch-photos
CREATE POLICY "dispatch_photos_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dispatch-photos' AND (storage.foldername(name))[1] IN (
    SELECT factory_id::text FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "dispatch_photos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dispatch-photos' AND (storage.foldername(name))[1] IN (
    SELECT factory_id::text FROM public.profiles WHERE id = auth.uid()
  ));

-- RLS policies for gate-passes
CREATE POLICY "gate_passes_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'gate-passes' AND (storage.foldername(name))[1] IN (
    SELECT factory_id::text FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "gate_passes_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gate-passes' AND (storage.foldername(name))[1] IN (
    SELECT factory_id::text FROM public.profiles WHERE id = auth.uid()
  ));

-- RLS policies for signatures
CREATE POLICY "signatures_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'signatures' AND (storage.foldername(name))[1] IN (
    SELECT factory_id::text FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "signatures_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'signatures' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "signatures_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'signatures' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "signatures_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'signatures' AND (storage.foldername(name))[1] = auth.uid()::text);
