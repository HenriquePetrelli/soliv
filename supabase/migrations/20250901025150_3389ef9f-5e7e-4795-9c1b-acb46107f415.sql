-- Update the database function to handle area_atendimento as an array
DROP FUNCTION IF EXISTS public.create_psychologist_profile(uuid, text, text, text, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_psychologist_profile(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_crp_number text,
  p_specialization text,
  p_bio text,
  p_state text,
  p_city text,
  p_address text DEFAULT NULL,
  p_document_url text DEFAULT NULL,
  p_cpf text DEFAULT NULL,
  p_area_atendimento text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  area_atendimento_array text[];
BEGIN
  -- Parse the JSON string to array if provided
  IF p_area_atendimento IS NOT NULL THEN
    SELECT array_agg(value)
    INTO area_atendimento_array
    FROM json_array_elements_text(p_area_atendimento::json);
  END IF;

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
    CASE 
      WHEN area_atendimento_array IS NOT NULL THEN array_to_string(area_atendimento_array, ',')
      ELSE NULL
    END,
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