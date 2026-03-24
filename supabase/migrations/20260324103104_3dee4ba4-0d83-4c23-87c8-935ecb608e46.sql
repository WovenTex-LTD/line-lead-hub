-- Make dispatch-photos bucket public
UPDATE storage.buckets
SET public = true
WHERE id = 'dispatch-photos';

-- Allow public read
CREATE POLICY "Dispatch photos are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'dispatch-photos');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload dispatch photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'dispatch-photos');

-- Allow authenticated users to update (for edits)
CREATE POLICY "Authenticated users can update dispatch photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'dispatch-photos');