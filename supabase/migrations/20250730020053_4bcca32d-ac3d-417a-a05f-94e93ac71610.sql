-- Fix Security Linter Issues

-- Fix 1: Update functions to have proper search_path
CREATE OR REPLACE FUNCTION public.is_admin(user_id_param UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = user_id_param AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_user_type_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Allow initial insert
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  -- Prevent user_type changes unless done by an admin
  IF TG_OP = 'UPDATE' AND OLD.user_type != NEW.user_type THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change user types';
    END IF;
  END IF;
  
  -- Prevent registration_status changes unless done by an admin
  IF TG_OP = 'UPDATE' AND OLD.registration_status != NEW.registration_status THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change registration status';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_to_admin(target_user_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_user_id UUID;
  existing_admin_count INTEGER;
BEGIN
  -- Get the user ID from email
  SELECT id INTO target_user_id 
  FROM auth.users 
  WHERE email = target_user_email;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found with email: %', target_user_email;
  END IF;
  
  -- Check if there are any existing admins
  SELECT COUNT(*) INTO existing_admin_count 
  FROM public.admin_users 
  WHERE is_active = true;
  
  -- Only allow if no admins exist (initial setup) or if called by existing admin
  IF existing_admin_count > 0 AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only existing administrators can promote users to admin';
  END IF;
  
  -- Insert into admin_users if not already admin
  INSERT INTO public.admin_users (user_id, granted_by)
  VALUES (target_user_id, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET
    is_active = true,
    granted_by = auth.uid(),
    granted_at = now();
  
  -- Update user_type in profiles
  UPDATE public.profiles 
  SET user_type = 'admin'::user_type 
  WHERE user_id = target_user_id;
  
  RETURN true;
END;
$$;