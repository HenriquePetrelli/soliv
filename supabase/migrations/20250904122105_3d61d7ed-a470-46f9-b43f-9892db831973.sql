-- Fix RLS issues for existing tables only

-- The linter shows these tables need RLS enabled or have issues
-- Let's focus on the actual existing tables from the schema

-- Check if these tables exist and fix search path issues in functions
-- Update functions to have proper search_path

CREATE OR REPLACE FUNCTION public.increment_emergency_accepted(p_psychologist_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.psychologist_presence
  SET emergency_accepted_count = emergency_accepted_count + 1
  WHERE psychologist_id = p_psychologist_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_emergency_rejected(p_psychologist_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.psychologist_presence
  SET emergency_rejected_count = emergency_rejected_count + 1
  WHERE psychologist_id = p_psychologist_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_psychologist_appointment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Update total_appointments when appointment status changes to completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE public.psychologists 
    SET total_appointments = total_appointments + 1
    WHERE user_id = NEW.psychologist_id;
  END IF;
  
  -- Decrease count if appointment was completed but now changed to another status
  IF OLD.status = 'completed' AND NEW.status != 'completed' THEN
    UPDATE public.psychologists 
    SET total_appointments = GREATEST(total_appointments - 1, 0)
    WHERE user_id = NEW.psychologist_id;
  END IF;
  
  RETURN NEW;
END;
$function$;