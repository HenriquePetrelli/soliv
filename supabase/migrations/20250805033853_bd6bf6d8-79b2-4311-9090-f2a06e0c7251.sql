-- Criar política RLS para admins acessarem documentos de psicólogos
CREATE POLICY "admin_document_access" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'psychologist-documents' 
  AND EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND (auth.users.raw_user_meta_data ->> 'is_super_admin')::boolean = true
  )
);

-- Política para psicólogos acessarem seus próprios documentos
CREATE POLICY "psychologist_own_documents" 
ON storage.objects 
FOR ALL 
USING (
  bucket_id = 'psychologist-documents' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Política para admins enviarem documentos
CREATE POLICY "admin_upload_documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'psychologist-documents' 
  AND EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND (auth.users.raw_user_meta_data ->> 'is_super_admin')::boolean = true
  )
);

-- Criar uma função para gerar URLs assinadas para admins
CREATE OR REPLACE FUNCTION public.get_psychologist_document_url(document_path text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  signed_url text;
BEGIN
  -- Verificar se é admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem acessar documentos.';
  END IF;
  
  -- Esta função será chamada pelo frontend que então criará a URL assinada
  RETURN document_path;
END;
$$;