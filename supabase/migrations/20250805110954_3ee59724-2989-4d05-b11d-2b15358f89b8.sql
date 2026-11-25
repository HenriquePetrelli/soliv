-- Criar ou atualizar o bucket psychologist-documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('psychologist-documents', 'psychologist-documents', false, 52428800, ARRAY['image/*', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Remover políticas existentes para o bucket psychologist-documents
DROP POLICY IF EXISTS "Admins can view all documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;

-- Política para super admins visualizarem todos os documentos
CREATE POLICY "Super admins can view psychologist documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'psychologist-documents' 
  AND public.is_super_admin()
);

-- Política para usuários fazerem upload dos próprios documentos
CREATE POLICY "Users can upload to psychologist documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'psychologist-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Política para usuários atualizarem os próprios documentos
CREATE POLICY "Users can update their psychologist documents"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'psychologist-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Política para usuários deletarem os próprios documentos
CREATE POLICY "Users can delete their psychologist documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'psychologist-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Política para super admins gerenciarem todos os documentos
CREATE POLICY "Super admins can manage all psychologist documents"
ON storage.objects
FOR ALL
USING (
  bucket_id = 'psychologist-documents'
  AND public.is_super_admin()
);

-- Garantir que a função is_super_admin está correta
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id_param uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT (raw_user_meta_data ->> 'is_super_admin')::boolean
      FROM auth.users 
      WHERE id = user_id_param
    ), 
    false
  );
$$;