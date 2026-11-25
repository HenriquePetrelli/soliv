-- Create stored procedure for atomic psychologist profile creation
CREATE OR REPLACE FUNCTION public.create_psychologist_profile(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_crp_number text,
  p_specialization text,
  p_bio text,
  p_state text,
  p_city text,
  p_accepts_presential boolean,
  p_address text DEFAULT NULL,
  p_document_url text DEFAULT NULL,
  p_cpf text DEFAULT NULL,
  p_professional_email text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Insert into psychologists table
  INSERT INTO public.psychologists (
    user_id,
    full_name,
    email,
    crp_number,
    specialization,
    bio,
    state,
    city,
    accepts_presential,
    address,
    document_url,
    cpf,
    professional_email,
    approval_status
  ) VALUES (
    p_user_id,
    p_full_name,
    p_email,
    p_crp_number,
    p_specialization,
    p_bio,
    p_state,
    p_city,
    p_accepts_presential,
    p_address,
    p_document_url,
    p_cpf,
    p_professional_email,
    'pending'
  );

  -- Insert into psychologist_registrations table
  INSERT INTO public.psychologist_registrations (
    user_id,
    status,
    submitted_at
  ) VALUES (
    p_user_id,
    'pending',
    now()
  );

  RETURN json_build_object(
    'success', true,
    'message', 'Psychologist profile created successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Update RLS policies for storage to allow uploads during registration
CREATE POLICY "Enable psychologist document uploads during registration"
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'psychologist-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Enable psychologist document access"
ON storage.objects FOR SELECT 
USING (
  bucket_id = 'psychologist-documents' 
  AND (
    auth.uid()::text = (storage.foldername(name))[1] 
    OR public.is_super_admin()
  )
);