-- Add new boolean columns to weekly_goals table
ALTER TABLE public.weekly_goals
ADD COLUMN IF NOT EXISTS show_weekly_goal_modal BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS show_goal_modal BOOLEAN NOT NULL DEFAULT true;

-- Create index for better performance on modal checks
CREATE INDEX IF NOT EXISTS idx_weekly_goals_modal_flags ON public.weekly_goals(user_id, show_goal_modal, show_weekly_goal_modal);

-- Create function to reset weekly goals every Monday
CREATE OR REPLACE FUNCTION public.reset_weekly_goals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reset progress and completed status for all goals
  UPDATE public.weekly_goals
  SET 
    progress = 0,
    completed = false,
    show_weekly_goal_modal = true,
    start_date = date_trunc('week', CURRENT_DATE)::date,
    end_date = (date_trunc('week', CURRENT_DATE) + interval '6 days')::date,
    updated_at = now()
  WHERE show_goal_modal = true;
END;
$$;