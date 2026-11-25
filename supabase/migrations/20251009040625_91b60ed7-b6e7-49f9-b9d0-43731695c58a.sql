-- Add weekly_goals column to patients table
ALTER TABLE public.patients
ADD COLUMN IF NOT EXISTS weekly_goals text[] DEFAULT '{}';

-- Create function to reset weekly goals every Monday
CREATE OR REPLACE FUNCTION public.reset_patient_weekly_goals_array()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Reset weekly goals array and show modal flag
  UPDATE public.patients
  SET 
    weekly_goals = '{}',
    show_weekly_goal_modal = true
  WHERE show_goal_modal = true;
END;
$$;

-- Drop old patient_weekly_goals related functions if they exist
DROP FUNCTION IF EXISTS public.reset_patient_weekly_goals() CASCADE;

-- Comment: The cron job should be set up to call reset_patient_weekly_goals_array()
-- every Monday at 01:00 Brasília time (04:00 UTC during standard time, 03:00 UTC during DST)