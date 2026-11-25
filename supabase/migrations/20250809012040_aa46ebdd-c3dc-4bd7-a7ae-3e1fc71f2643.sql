-- Criar função para verificar se o usuário pode fazer upload
CREATE OR REPLACE FUNCTION can_upload_document(bucket_name text, object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bucket_name = 'psychologist-documents' AND auth.role() = 'authenticated';
$$;

-- Criar função para verificar se o usuário pode acessar documento
CREATE OR REPLACE FUNCTION can_access_document(bucket_name text, object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bucket_name = 'psychologist-documents';
$$;