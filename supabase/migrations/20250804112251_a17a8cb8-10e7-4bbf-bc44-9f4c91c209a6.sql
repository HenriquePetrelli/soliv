-- Create storage bucket for psychologist documents (only if it doesn't exist)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
  'psychologist-documents', 
  'psychologist-documents', 
  false,
  5242880, -- 5MB in bytes
  ARRAY['image/*', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policy for document upload (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND policyname = 'Authenticated users can upload their own documents'
    ) THEN
        CREATE POLICY "Authenticated users can upload their own documents" 
        ON storage.objects 
        FOR INSERT 
        TO authenticated 
        WITH CHECK (
          bucket_id = 'psychologist-documents' AND
          (storage.foldername(name))[1] = auth.uid()::text
        );
    END IF;
END $$;

-- Update psychologists table RLS policies
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON psychologists;

-- Allow initial psychologist registration
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'psychologists' 
        AND policyname = 'Allow psychologist registration'
    ) THEN
        CREATE POLICY "Allow psychologist registration" 
        ON psychologists 
        FOR INSERT 
        TO authenticated 
        WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- Allow users to update their own psychologist profile
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'psychologists' 
        AND policyname = 'Users can update their own psychologist profile'
    ) THEN
        CREATE POLICY "Users can update their own psychologist profile" 
        ON psychologists 
        FOR UPDATE 
        USING (auth.uid() = user_id);
    END IF;
END $$;