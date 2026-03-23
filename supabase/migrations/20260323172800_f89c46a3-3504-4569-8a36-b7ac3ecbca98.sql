
-- Make gate-passes bucket public with PDF-only restriction
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gate-passes',
  'gate-passes',
  true,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf'];

-- Drop existing gate-passes policies to avoid conflicts
DROP POLICY IF EXISTS "gate_passes_factory" ON storage.objects;
DROP POLICY IF EXISTS "Factory members can upload gate passes" ON storage.objects;
DROP POLICY IF EXISTS "Gate passes are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Factory members can update gate passes" ON storage.objects;

-- RLS: authenticated users can upload
CREATE POLICY "Factory members can upload gate passes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'gate-passes');

-- RLS: anyone can read (public bucket)
CREATE POLICY "Gate passes are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'gate-passes');

-- RLS: authenticated users can update
CREATE POLICY "Factory members can update gate passes"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'gate-passes');
