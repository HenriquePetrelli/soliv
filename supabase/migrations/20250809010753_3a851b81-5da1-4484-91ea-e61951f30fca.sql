-- Criar o enum user_type se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_type') THEN
        CREATE TYPE user_type AS ENUM ('patient', 'psychologist', 'admin');
    END IF;
END $$;

-- Criar bucket para documentos de psicólogos se não existir
INSERT INTO storage.buckets (id, name, public) 
VALUES ('psychologist-documents', 'psychologist-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Remover políticas existentes que podem estar causando conflito
DROP POLICY IF EXISTS "Psychologist document upload" ON storage.objects;
DROP POLICY IF EXISTS "Psychologist document access" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload psychologist documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to view their own psychologist documents" ON storage.objects;

-- Criar política para upload de documentos
CREATE POLICY "Psychologist document upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'psychologist-documents'
);

-- Criar política para leitura de documentos
CREATE POLICY "Psychologist document access" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'psychologist-documents'
);

-- Criar política para atualização de documentos
CREATE POLICY "Psychologist document update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'psychologist-documents'
);

-- Criar política para deleção de documentos  
CREATE POLICY "Psychologist document delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'psychologist-documents'
);