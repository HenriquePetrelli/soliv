-- Add quarterly_activities column to patient_statistics table
ALTER TABLE public.patient_statistics
ADD COLUMN IF NOT EXISTS quarterly_activities jsonb[] DEFAULT ARRAY[]::jsonb[];

-- Create function to clean up old quarterly activities (keep only last 3 months)
CREATE OR REPLACE FUNCTION public.cleanup_quarterly_activities()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  three_months_ago timestamp with time zone;
BEGIN
  -- Calculate the cutoff date (3 months ago from today)
  three_months_ago := date_trunc('month', now() - interval '3 months');
  
  -- Update all patient_statistics records to remove activities older than 3 months
  UPDATE public.patient_statistics
  SET quarterly_activities = (
    SELECT array_agg(activity)
    FROM unnest(quarterly_activities) AS activity
    WHERE (activity->>'date')::timestamp with time zone >= three_months_ago
  )
  WHERE quarterly_activities IS NOT NULL
    AND array_length(quarterly_activities, 1) > 0;
END;
$$;

-- Create function to add activity to quarterly history
CREATE OR REPLACE FUNCTION public.add_quarterly_activity(
  p_patient_id uuid,
  p_activity_name text,
  p_activity_date timestamp with time zone DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_activities jsonb[];
  new_activity jsonb;
BEGIN
  -- Create new activity object
  new_activity := jsonb_build_object(
    'name', p_activity_name,
    'date', p_activity_date
  );

  -- Get current quarterly activities
  SELECT quarterly_activities INTO current_activities
  FROM public.patient_statistics
  WHERE patient_id = p_patient_id;

  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.patient_statistics (patient_id, quarterly_activities)
    VALUES (p_patient_id, ARRAY[new_activity]);
    RETURN;
  END IF;

  -- If activities array is null, initialize it
  IF current_activities IS NULL THEN
    current_activities := ARRAY[]::jsonb[];
  END IF;

  -- Add new activity
  current_activities := current_activities || new_activity;

  -- Update the record
  UPDATE public.patient_statistics
  SET 
    quarterly_activities = current_activities,
    updated_at = NOW()
  WHERE patient_id = p_patient_id;
END;
$$;