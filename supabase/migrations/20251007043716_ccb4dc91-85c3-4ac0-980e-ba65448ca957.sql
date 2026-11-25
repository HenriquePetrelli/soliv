-- Add new columns to patient_statistics table
ALTER TABLE public.patient_statistics
ADD COLUMN IF NOT EXISTS total_scheduled_consultations integer DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS total_emergency_consultations integer DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS total_guided_breathing_time integer DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS total_therapeutic_sound_time integer DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS streak_days integer DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS last_active_date date;

-- Function to sync consultation counts from appointments table
CREATE OR REPLACE FUNCTION public.sync_consultation_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Update all patient statistics with current appointment counts
  UPDATE public.patient_statistics ps
  SET 
    total_scheduled_consultations = (
      SELECT COUNT(*)
      FROM public.appointments a
      WHERE a.patient_id = ps.patient_id
        AND a.appointment_type = 'regular'
        AND a.status = 'completed'
    ),
    total_emergency_consultations = (
      SELECT COUNT(*)
      FROM public.appointments a
      WHERE a.patient_id = ps.patient_id
        AND a.appointment_type = 'emergency'
        AND a.status = 'completed'
    );
END;
$$;

-- Function to update consultation count when appointment status changes
CREATE OR REPLACE FUNCTION public.update_patient_consultation_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only update when appointment is completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Ensure patient_statistics record exists
    INSERT INTO public.patient_statistics (patient_id)
    VALUES (NEW.patient_id)
    ON CONFLICT (patient_id) DO NOTHING;
    
    -- Update the appropriate counter
    IF NEW.appointment_type = 'regular' THEN
      UPDATE public.patient_statistics
      SET total_scheduled_consultations = total_scheduled_consultations + 1
      WHERE patient_id = NEW.patient_id;
    ELSIF NEW.appointment_type = 'emergency' THEN
      UPDATE public.patient_statistics
      SET total_emergency_consultations = total_emergency_consultations + 1
      WHERE patient_id = NEW.patient_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for appointments
DROP TRIGGER IF EXISTS trigger_update_consultation_stats ON public.appointments;
CREATE TRIGGER trigger_update_consultation_stats
  AFTER INSERT OR UPDATE OF status
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_patient_consultation_stats();

-- Function to update activity time (breathing or sound)
CREATE OR REPLACE FUNCTION public.update_patient_activity_time(
  p_patient_id uuid,
  p_activity_type text,
  p_duration_minutes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Ensure patient_statistics record exists
  INSERT INTO public.patient_statistics (patient_id)
  VALUES (p_patient_id)
  ON CONFLICT (patient_id) DO NOTHING;
  
  -- Update the appropriate time column
  IF p_activity_type = 'breathing' THEN
    UPDATE public.patient_statistics
    SET total_guided_breathing_time = total_guided_breathing_time + p_duration_minutes
    WHERE patient_id = p_patient_id;
  ELSIF p_activity_type = 'sound' THEN
    UPDATE public.patient_statistics
    SET total_therapeutic_sound_time = total_therapeutic_sound_time + p_duration_minutes
    WHERE patient_id = p_patient_id;
  END IF;
END;
$$;

-- Function to check and update streak
CREATE OR REPLACE FUNCTION public.update_patient_streak(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_streak integer;
  last_date date;
  new_streak integer;
BEGIN
  -- Ensure patient_statistics record exists
  INSERT INTO public.patient_statistics (patient_id)
  VALUES (p_patient_id)
  ON CONFLICT (patient_id) DO NOTHING;
  
  -- Get current values
  SELECT streak_days, last_active_date
  INTO current_streak, last_date
  FROM public.patient_statistics
  WHERE patient_id = p_patient_id;
  
  -- If last_active_date is today, don't update (already counted today)
  IF last_date = CURRENT_DATE THEN
    RETURN jsonb_build_object('streak_days', current_streak, 'already_updated', true);
  END IF;
  
  -- Calculate new streak
  IF last_date = CURRENT_DATE - INTERVAL '1 day' THEN
    -- Yesterday: increment streak
    new_streak := current_streak + 1;
  ELSIF last_date < CURRENT_DATE - INTERVAL '1 day' OR last_date IS NULL THEN
    -- Older than yesterday or never set: reset to 1
    new_streak := 1;
  ELSE
    -- Should not happen, but default to current
    new_streak := current_streak;
  END IF;
  
  -- Update the record
  UPDATE public.patient_statistics
  SET 
    streak_days = new_streak,
    last_active_date = CURRENT_DATE
  WHERE patient_id = p_patient_id;
  
  RETURN jsonb_build_object('streak_days', new_streak, 'already_updated', false);
END;
$$;

-- Sync existing appointment data
SELECT public.sync_consultation_counts();