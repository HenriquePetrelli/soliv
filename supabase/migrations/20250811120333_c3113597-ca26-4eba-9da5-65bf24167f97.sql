-- Remove columns related to professional email and referencias if they exist
ALTER TABLE public.psychologists DROP COLUMN IF EXISTS professional_email;
ALTER TABLE public.psychologists DROP COLUMN IF EXISTS email_profissional;
ALTER TABLE public.psychologists DROP COLUMN IF EXISTS referencias;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS professional_email;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS email_profissional;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS referencias;

-- Update create_psychologist_profile function to remove professional_email and accepts_presential usage
CREATE OR REPLACE FUNCTION public.create_psychologist_profile(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_crp_number text,
  p_specialization text,
  p_bio text,
  p_state text,
  p_city text,
  p_address text DEFAULT NULL::text,
  p_document_url text DEFAULT NULL::text,
  p_cpf text DEFAULT NULL::text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Insert into profiles table
  INSERT INTO public.profiles (
    user_id,
    user_type,
    full_name,
    cpf,
    crp,
    specialty
  ) VALUES (
    p_user_id,
    'psychologist'::public.user_type,
    p_full_name,
    p_cpf,
    p_crp_number,
    p_specialization
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    cpf = EXCLUDED.cpf,
    crp = EXCLUDED.crp,
    specialty = EXCLUDED.specialty;

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
    address,
    document_url,
    cpf,
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
    p_address,
    p_document_url,
    p_cpf,
    'pending'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    crp_number = EXCLUDED.crp_number,
    specialization = EXCLUDED.specialization,
    bio = EXCLUDED.bio,
    state = EXCLUDED.state,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    document_url = EXCLUDED.document_url,
    cpf = EXCLUDED.cpf;

  -- Insert or update psychologist_registrations
  INSERT INTO public.psychologist_registrations (
    user_id,
    status,
    submitted_at
  ) VALUES (
    p_user_id,
    'pending'::public.registration_status,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    status = EXCLUDED.status,
    submitted_at = EXCLUDED.submitted_at;

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