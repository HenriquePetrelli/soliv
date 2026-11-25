-- Fix the create_psychologist_profile function to ensure proper transaction handling
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
  profile_exists boolean;
  psych_exists boolean;
  reg_exists boolean;
BEGIN
  -- Check if user already has records (avoid duplicates)
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id = p_user_id) INTO profile_exists;
  SELECT EXISTS(SELECT 1 FROM public.psychologists WHERE user_id = p_user_id) INTO psych_exists;
  SELECT EXISTS(SELECT 1 FROM public.psychologist_registrations WHERE user_id = p_user_id) INTO reg_exists;

  -- Parse the JSON string to array if provided
  IF p_area_atendimento IS NOT NULL THEN
    BEGIN
      SELECT array_agg(value)
      INTO area_atendimento_array
      FROM json_array_elements_text(p_area_atendimento::json);
    EXCEPTION
      WHEN OTHERS THEN
        -- If JSON parsing fails, treat as comma-separated string
        area_atendimento_array := string_to_array(p_area_atendimento, ',');
    END;
  END IF;

  -- Insert into profiles table only if doesn't exist
  IF NOT profile_exists THEN
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
  ELSE
    UPDATE public.profiles SET
      full_name = p_full_name,
      cpf = p_cpf,
      crp = p_crp_number,
      specialty = p_specialization,
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- Insert into psychologists table only if doesn't exist
  IF NOT psych_exists THEN
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
      approval_status,
      created_at,
      updated_at
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
      'pending',
      now(),
      now()
    );
  ELSE
    UPDATE public.psychologists SET
      full_name = p_full_name,
      email = p_email,
      crp_number = p_crp_number,
      specialization = p_specialization,
      bio = p_bio,
      state = p_state,
      city = p_city,
      address = p_address,
      document_url = p_document_url,
      cpf = p_cpf,
      area_atendimento = CASE 
        WHEN area_atendimento_array IS NOT NULL THEN array_to_string(area_atendimento_array, ',')
        ELSE area_atendimento
      END,
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- Insert into psychologist_registrations table only if doesn't exist
  IF NOT reg_exists THEN
    INSERT INTO public.psychologist_registrations (
      user_id,
      status,
      submitted_at,
      created_at,
      updated_at
    ) VALUES (
      p_user_id,
      'pending'::registration_status,
      now(),
      now(),
      now()
    );
  ELSE
    UPDATE public.psychologist_registrations SET
      status = 'pending'::registration_status,
      submitted_at = now(),
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- Verify that all records were created/updated successfully
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Failed to create profile record';
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.psychologists WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Failed to create psychologist record';
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.psychologist_registrations WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Failed to create registration record';
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'Psychologist profile created successfully',
    'user_id', p_user_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log the error for debugging
    RAISE LOG 'Error in create_psychologist_profile for user %: %', p_user_id, SQLERRM;
    
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'user_id', p_user_id
    );
END;
$function$;