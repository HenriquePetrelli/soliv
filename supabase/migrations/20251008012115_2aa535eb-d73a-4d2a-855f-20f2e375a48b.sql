-- Create patient_achievements table
CREATE TABLE public.patient_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  achieved BOOLEAN NOT NULL DEFAULT false,
  achieved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, title)
);

-- Enable RLS
ALTER TABLE public.patient_achievements ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own achievements"
ON public.patient_achievements
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own achievements"
ON public.patient_achievements
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own achievements"
ON public.patient_achievements
FOR UPDATE
USING (auth.uid() = user_id);

-- Create function to initialize achievements for a user
CREATE OR REPLACE FUNCTION public.initialize_patient_achievements(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.patient_achievements (user_id, title, description, icon)
  VALUES
    (p_user_id, 'First Step', 'Complete sua primeira prática de respiração guiada', 'undraw_meditation'),
    (p_user_id, 'Deep Breather', 'Complete 5 sessões de respiração guiada', 'undraw_yoga'),
    (p_user_id, 'Mindful Writer', 'Registre 7 entradas no seu diário privado', 'undraw_note_list'),
    (p_user_id, 'Therapy Follower', 'Complete 3 consultas agendadas', 'undraw_chat'),
    (p_user_id, 'Mood Tracker Pro', 'Registre seu humor por 7 dias consecutivos', 'undraw_profile_data'),
    (p_user_id, 'Consistent Care', 'Use o aplicativo por 30 dias consecutivos', 'undraw_celebration')
  ON CONFLICT (user_id, title) DO NOTHING;
END;
$$;

-- Create trigger to update updated_at
CREATE TRIGGER update_patient_achievements_updated_at
BEFORE UPDATE ON public.patient_achievements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();