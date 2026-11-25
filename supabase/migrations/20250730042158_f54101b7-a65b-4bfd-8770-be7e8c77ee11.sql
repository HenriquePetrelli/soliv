-- Fix 1: Security Definer View Vulnerability - Remove or fix admin_metrics view
-- The current admin_metrics view bypasses RLS, so we'll drop it and create a secure function instead
DROP VIEW IF EXISTS public.admin_metrics;

-- Create a secure function to get admin metrics that respects RLS
CREATE OR REPLACE FUNCTION public.get_admin_metrics()
RETURNS TABLE (
  total_patients BIGINT,
  active_psychologists BIGINT,
  pending_psychologists BIGINT,
  active_subscribers BIGINT,
  appointments_last_30_days BIGINT,
  sos_requests_last_30_days BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only allow admins to access this function
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM public.profiles WHERE user_type = 'patient')::BIGINT,
    (SELECT COUNT(*) FROM public.profiles WHERE user_type = 'psychologist' AND registration_status = 'approved')::BIGINT,
    (SELECT COUNT(*) FROM public.profiles WHERE user_type = 'psychologist' AND registration_status = 'pending')::BIGINT,
    (SELECT COUNT(*) FROM public.subscribers WHERE subscribed = true)::BIGINT,
    (SELECT COUNT(*) FROM public.appointments WHERE created_at >= NOW() - INTERVAL '30 days')::BIGINT,
    (SELECT COUNT(*) FROM public.emergency_requests WHERE created_at >= NOW() - INTERVAL '30 days')::BIGINT;
END;
$$;

-- Fix 2: Strengthen the user type change prevention trigger
-- Update the existing trigger function to be more strict
CREATE OR REPLACE FUNCTION public.prevent_user_type_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Allow initial insert
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  -- For updates, be more strict about changes
  IF TG_OP = 'UPDATE' THEN
    -- Prevent user_type changes unless done by an admin
    IF OLD.user_type != NEW.user_type THEN
      IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Only administrators can change user types';
      END IF;
      
      -- Log security-sensitive changes
      INSERT INTO public.security_audit_log (
        user_id, action, table_name, record_id, 
        old_values, new_values
      ) VALUES (
        auth.uid(), 'user_type_change', 'profiles', NEW.id,
        jsonb_build_object('user_type', OLD.user_type),
        jsonb_build_object('user_type', NEW.user_type)
      );
    END IF;
    
    -- Prevent registration_status changes unless done by an admin
    IF OLD.registration_status != NEW.registration_status THEN
      IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Only administrators can change registration status';
      END IF;
      
      -- Log security-sensitive changes
      INSERT INTO public.security_audit_log (
        user_id, action, table_name, record_id,
        old_values, new_values
      ) VALUES (
        auth.uid(), 'registration_status_change', 'profiles', NEW.id,
        jsonb_build_object('registration_status', OLD.registration_status),
        jsonb_build_object('registration_status', NEW.registration_status)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS prevent_user_type_change_trigger ON public.profiles;
CREATE TRIGGER prevent_user_type_change_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_type_change();

-- Fix 3: Add input validation functions
CREATE OR REPLACE FUNCTION public.validate_cpf(cpf_input TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
BEGIN
  -- Remove any non-digit characters
  cpf_input := regexp_replace(cpf_input, '[^0-9]', '', 'g');
  
  -- Check if has exactly 11 digits
  IF length(cpf_input) != 11 THEN
    RETURN FALSE;
  END IF;
  
  -- Check for invalid sequences (all same digits)
  IF cpf_input ~ '^(.)\1{10}$' THEN
    RETURN FALSE;
  END IF;
  
  -- CPF validation algorithm
  DECLARE
    sum_1 INTEGER := 0;
    sum_2 INTEGER := 0;
    digit_1 INTEGER;
    digit_2 INTEGER;
    i INTEGER;
  BEGIN
    -- Calculate first check digit
    FOR i IN 1..9 LOOP
      sum_1 := sum_1 + (substring(cpf_input, i, 1)::INTEGER * (11 - i));
    END LOOP;
    
    digit_1 := 11 - (sum_1 % 11);
    IF digit_1 >= 10 THEN
      digit_1 := 0;
    END IF;
    
    -- Calculate second check digit
    FOR i IN 1..10 LOOP
      sum_2 := sum_2 + (substring(cpf_input, i, 1)::INTEGER * (12 - i));
    END LOOP;
    
    digit_2 := 11 - (sum_2 % 11);
    IF digit_2 >= 10 THEN
      digit_2 := 0;
    END IF;
    
    -- Check if calculated digits match
    RETURN digit_1 = substring(cpf_input, 10, 1)::INTEGER 
       AND digit_2 = substring(cpf_input, 11, 1)::INTEGER;
  END;
END;
$$;

-- Fix 4: Add CRP validation for psychologists (more lenient to handle existing data)
CREATE OR REPLACE FUNCTION public.validate_crp(crp_input TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
BEGIN
  -- Allow null values
  IF crp_input IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Remove any whitespace
  crp_input := trim(crp_input);
  
  -- Check minimum length (should have some content)
  IF length(crp_input) < 3 THEN
    RETURN FALSE;
  END IF;
  
  -- Check maximum reasonable length
  IF length(crp_input) > 20 THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Fix 5: Add secure audit logging trigger for sensitive operations
CREATE OR REPLACE FUNCTION public.audit_sensitive_operations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Log admin actions
  IF TG_TABLE_NAME = 'admin_users' THEN
    INSERT INTO public.security_audit_log (
      user_id, action, table_name, record_id,
      old_values, new_values
    ) VALUES (
      auth.uid(), TG_OP, TG_TABLE_NAME, 
      COALESCE(NEW.id, OLD.id),
      CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
      CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END
    );
  END IF;
  
  -- Log emergency request changes
  IF TG_TABLE_NAME = 'emergency_requests' AND TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status THEN
      INSERT INTO public.security_audit_log (
        user_id, action, table_name, record_id,
        old_values, new_values
      ) VALUES (
        auth.uid(), 'emergency_status_change', TG_TABLE_NAME, NEW.id,
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status)
      );
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply audit triggers
DROP TRIGGER IF EXISTS audit_admin_users ON public.admin_users;
CREATE TRIGGER audit_admin_users
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_sensitive_operations();

DROP TRIGGER IF EXISTS audit_emergency_requests ON public.emergency_requests;
CREATE TRIGGER audit_emergency_requests
  AFTER UPDATE ON public.emergency_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_sensitive_operations();