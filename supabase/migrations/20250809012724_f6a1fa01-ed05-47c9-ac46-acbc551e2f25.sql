-- Ensure clean slate by dropping existing policies with the same names
DROP POLICY IF EXISTS "Public can read documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete documents" ON storage.objects;

-- Allow anyone (including anon) to read from public 'documents' bucket
CREATE POLICY "Public can read documents"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'documents');

-- Allow authenticated users to upload to 'documents' bucket
CREATE POLICY "Authenticated can upload documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Allow authenticated users to update files in 'documents' bucket
CREATE POLICY "Authenticated can update documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'documents');

-- Allow authenticated users to delete files in 'documents' bucket
CREATE POLICY "Authenticated can delete documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'documents');