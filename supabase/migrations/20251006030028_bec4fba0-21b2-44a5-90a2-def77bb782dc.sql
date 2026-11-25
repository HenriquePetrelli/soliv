-- Fix search_path for add_patient_activity function
DROP FUNCTION IF EXISTS public.add_patient_activity(UUID, TEXT, TIMESTAMP WITH TIME ZONE);

CREATE OR REPLACE FUNCTION public.add_patient_activity(
  p_patient_id UUID,
  p_activity_name TEXT,
  p_activity_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_activities JSONB[];
  new_activity JSONB;
BEGIN
  -- Create new activity object
  new_activity := jsonb_build_object(
    'name', p_activity_name,
    'date', p_activity_date
  );

  -- Get current activities
  SELECT recent_activities INTO current_activities
  FROM public.patient_statistics
  WHERE patient_id = p_patient_id;

  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.patient_statistics (patient_id, recent_activities)
    VALUES (p_patient_id, ARRAY[new_activity]);
    RETURN;
  END IF;

  -- If activities array is null, initialize it
  IF current_activities IS NULL THEN
    current_activities := ARRAY[]::JSONB[];
  END IF;

  -- Add new activity at the beginning
  current_activities := ARRAY[new_activity] || current_activities;

  -- Keep only the 5 most recent activities
  IF array_length(current_activities, 1) > 5 THEN
    current_activities := current_activities[1:5];
  END IF;

  -- Update the record
  UPDATE public.patient_statistics
  SET 
    recent_activities = current_activities,
    updated_at = NOW()
  WHERE patient_id = p_patient_id;
END;
$$;