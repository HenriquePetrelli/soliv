-- Drop existing function and recreate with new parameter
DROP FUNCTION IF EXISTS public.create_psychologist_profile(uuid,text,text,text,text,text,text,text,text,text,text,text);

-- Recreate function with area_atendimento parameter
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
  p_cpf text DEFAULT NULL::text, 
  p_area_atendimento text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path TO 'public'
AS $function$
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
    'psychologist'::user_type,
    p_full_name,
    p_cpf,
    p_crp_number,
    p_specialization
  );

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
    area_atendimento,
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
    p_area_atendimento,
    'pending'
  );

  -- Insert into psychologist_registrations table
  INSERT INTO public.psychologist_registrations (
    user_id,
    status,
    submitted_at
  ) VALUES (
    p_user_id,
    'pending'::registration_status,
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
$function$;