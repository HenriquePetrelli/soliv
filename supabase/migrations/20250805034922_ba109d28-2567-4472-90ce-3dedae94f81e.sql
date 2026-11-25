-- Verificar se o bucket existe
INSERT INTO storage.buckets (id, name, public) 
VALUES ('psychologist-documents', 'psychologist-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Remover políticas antigas que possam estar causando conflito
DROP POLICY IF EXISTS "Allow admin access to psychologist documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow psychologist access to their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can access all documents" ON storage.objects;

-- Criar política principal para acesso a documentos
CREATE POLICY "Admin and owner access to psychologist documents" 
ON storage.objects 
FOR ALL 
USING (
  bucket_id = 'psychologist-documents'
  AND (
    -- Permite acesso a administradores (super admins)
    public.is_super_admin()
    -- OU permite acesso ao dono do documento
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- Política específica para leitura
CREATE POLICY "Read access to psychologist documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'psychologist-documents'
  AND (
    public.is_super_admin()
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);