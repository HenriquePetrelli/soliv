-- Allow uploads to 'documents' bucket for both anon and authenticated users
DROP POLICY IF EXISTS "Authenticated can upload documents" ON storage.objects;
CREATE POLICY "Public can upload documents"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'documents');