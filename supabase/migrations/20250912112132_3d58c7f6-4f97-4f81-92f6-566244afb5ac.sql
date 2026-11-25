-- Add average_rating column to psychologists
ALTER TABLE public.psychologists
  ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2) DEFAULT 0;

-- Optional ratings_count (not strictly required by spec, but useful)
ALTER TABLE public.psychologists
  ADD COLUMN IF NOT EXISTS ratings_count INTEGER DEFAULT 0;

-- Recreate functions with explicit search_path for security linter
CREATE OR REPLACE FUNCTION public.calculate_psychologist_average_rating(psychologist_user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  avg_rating NUMERIC;
BEGIN
  SELECT AVG(sf.rating)::NUMERIC(3,2)
  INTO avg_rating
  FROM public.session_feedback sf
  JOIN public.webrtc_sessions ws ON sf.session_id = ws.id
  WHERE ws.psychologist_id = psychologist_user_id
    AND sf.user_type = 'patient';
  RETURN COALESCE(avg_rating, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_patient_statistics(patient_user_id UUID)
RETURNS TABLE(
  consultation_count INTEGER,
  sos_count INTEGER,
  average_rating NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
        AND sf.user_type = 'psychologist'
    ), 0) as average_rating;
END;
$$;