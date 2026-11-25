-- Verificar se o bucket psychologist-documents existe e criar se necessário
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('psychologist-documents', 'psychologist-documents', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];

-- Remover políticas existentes se houver
DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;

-- Criar políticas mais permissivas para o bucket psychologist-documents
-- Permitir upload para usuários autenticados
CREATE POLICY "Allow authenticated users to upload psychologist documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'psychologist-documents' 
  AND auth.uid() IS NOT NULL
);

-- Permitir visualização de documentos próprios
CREATE POLICY "Allow users to view their own psychologist documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'psychologist-documents' 
  AND (
    auth.uid() IS NOT NULL 
    AND (
      (storage.foldername(name))[1] = auth.uid()::text 
      OR (storage.foldername(name))[1] LIKE 'temp-%'
    )
  )
);

-- Permitir atualização de documentos próprios
CREATE POLICY "Allow users to update their own psychologist documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'psychologist-documents' 
  AND auth.uid() IS NOT NULL 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Permitir deleção de documentos próprios
CREATE POLICY "Allow users to delete their own psychologist documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'psychologist-documents' 
  AND auth.uid() IS NOT NULL 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Permitir aos admins visualizar todos os documentos
CREATE POLICY "Allow admins to view all psychologist documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'psychologist-documents' 
  AND is_super_admin()
);