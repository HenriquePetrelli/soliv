-- Criar bucket de storage para documentos
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Políticas para o bucket de documentos
CREATE POLICY "Authenticated users can upload documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can view all documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'documents' AND 
  public.is_super_admin()
);

CREATE POLICY "Users can delete their own documents" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'documents' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);