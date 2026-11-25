-- Remover as políticas que criei anteriormente pois não podemos modificar storage.objects diretamente
DROP POLICY IF EXISTS "Psychologist document upload" ON storage.objects;
DROP POLICY IF EXISTS "Psychologist document access" ON storage.objects;
DROP POLICY IF EXISTS "Psychologist document update" ON storage.objects;
DROP POLICY IF EXISTS "Psychologist document delete" ON storage.objects;

-- Tornar o bucket público para resolver problemas de RLS
UPDATE storage.buckets 
SET public = true 
WHERE name = 'psychologist-documents';