-- Create session feedback table for storing video call feedback
CREATE TABLE IF NOT EXISTS public.session_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('patient', 'psychologist')),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  problem_resolved TEXT CHECK (problem_resolved IN ('yes', 'no')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add RLS policies
ALTER TABLE public.session_feedback ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own feedback
CREATE POLICY "Users can view their own feedback" ON public.session_feedback
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own feedback" ON public.session_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can view all feedback
CREATE POLICY "Super admins can view all feedback" ON public.session_feedback
  FOR SELECT USING (is_super_admin());

-- Create trigger for updated_at
CREATE TRIGGER update_session_feedback_updated_at
  BEFORE UPDATE ON public.session_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for performance
CREATE INDEX idx_session_feedback_session_id ON public.session_feedback(session_id);
CREATE INDEX idx_session_feedback_user_id ON public.session_feedback(user_id);

-- Function to calculate psychologist average rating
CREATE OR REPLACE FUNCTION public.calculate_psychologist_average_rating(psychologist_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  avg_rating NUMERIC;
BEGIN
  -- Get all feedback for sessions where this psychologist was involved
  SELECT AVG(sf.rating)::NUMERIC(3,2)
  INTO avg_rating
  FROM public.session_feedback sf
  JOIN public.webrtc_sessions ws ON sf.session_id = ws.id
  WHERE ws.psychologist_id = psychologist_user_id
    AND sf.user_type = 'patient'; -- Only patient ratings count towards psychologist rating
    
  RETURN COALESCE(avg_rating, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get patient statistics
CREATE OR REPLACE FUNCTION public.get_patient_statistics(patient_user_id UUID)
RETURNS TABLE(
  consultation_count INTEGER,
  sos_count INTEGER,
  average_rating NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE((
      SELECT COUNT(*)::INTEGER 
      FROM public.appointments 
      WHERE patient_id = patient_user_id AND status = 'completed'
    ), 0) as consultation_count,
    COALESCE((
      SELECT COUNT(*)::INTEGER 
      FROM public.emergency_requests 
      WHERE patient_id = patient_user_id AND status = 'completed'
    ), 0) as sos_count,
    COALESCE((
      SELECT AVG(sf.rating)::NUMERIC(3,2)
      FROM public.session_feedback sf
      JOIN public.webrtc_sessions ws ON sf.session_id = ws.id
      WHERE ws.patient_id = patient_user_id
        AND sf.user_type = 'psychologist' -- Psychologist rating of patient
    ), 0) as average_rating;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;