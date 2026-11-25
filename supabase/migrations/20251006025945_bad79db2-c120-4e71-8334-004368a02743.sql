-- Create patient_statistics table
CREATE TABLE public.patient_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recent_activities JSONB[] DEFAULT ARRAY[]::JSONB[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(patient_id)
);

-- Enable RLS
ALTER TABLE public.patient_statistics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Patients can view their own statistics"
ON public.patient_statistics
FOR SELECT
USING (auth.uid() = patient_id);

CREATE POLICY "Patients can insert their own statistics"
ON public.patient_statistics
FOR INSERT
WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Patients can update their own statistics"
ON public.patient_statistics
FOR UPDATE
USING (auth.uid() = patient_id);

-- Function to add activity (maintains max 5 items)
CREATE OR REPLACE FUNCTION public.add_patient_activity(
  p_patient_id UUID,
  p_activity_name TEXT,
  p_activity_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_patient_statistics_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_patient_statistics_timestamp
BEFORE UPDATE ON public.patient_statistics
FOR EACH ROW
EXECUTE FUNCTION public.update_patient_statistics_updated_at();