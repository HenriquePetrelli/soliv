-- Create weekly_goals table
CREATE TABLE IF NOT EXISTS public.weekly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target INTEGER NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.weekly_goals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own weekly goals"
  ON public.weekly_goals
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own weekly goals"
  ON public.weekly_goals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own weekly goals"
  ON public.weekly_goals
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own weekly goals"
  ON public.weekly_goals
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for better performance
CREATE INDEX idx_weekly_goals_user_id ON public.weekly_goals(user_id);
CREATE INDEX idx_weekly_goals_dates ON public.weekly_goals(start_date, end_date);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_weekly_goals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_weekly_goals_updated_at
  BEFORE UPDATE ON public.weekly_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_weekly_goals_updated_at();