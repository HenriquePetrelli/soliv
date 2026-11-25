-- Update functions to set a fixed search_path for security
CREATE OR REPLACE FUNCTION public.increment_emergency_accepted(p_psychologist_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.psychologist_presence
  SET emergency_accepted_count = emergency_accepted_count + 1
  WHERE psychologist_id = p_psychologist_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_emergency_rejected(p_psychologist_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.psychologist_presence
  SET emergency_rejected_count = emergency_rejected_count + 1
  WHERE psychologist_id = p_psychologist_id;
END;
$$;