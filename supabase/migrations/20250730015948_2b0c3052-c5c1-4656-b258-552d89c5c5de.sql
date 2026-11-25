-- Security Fix 1: Prevent privilege escalation in profiles table
-- Remove ability for users to update their own user_type
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create new restricted update policy that excludes user_type and registration_status
CREATE POLICY "Users can update their own profile (restricted)" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND user_type = (SELECT user_type FROM public.profiles WHERE user_id = auth.uid()));

-- Security Fix 2: Create admin role management system
-- Create admin_users table for secure admin management
CREATE TABLE public.admin_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Only existing admins can view admin users
CREATE POLICY "Only admins can view admin users" 
ON public.admin_users 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.admin_users 
  WHERE user_id = auth.uid() AND is_active = true
));

-- Only existing admins can manage admin users
CREATE POLICY "Only admins can manage admin users" 
ON public.admin_users 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.admin_users 
  WHERE user_id = auth.uid() AND is_active = true
));

-- Security Fix 3: Create secure function to check admin status
CREATE OR REPLACE FUNCTION public.is_admin(user_id_param UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = user_id_param AND is_active = true
  );
$$;

-- Security Fix 4: Create trigger to prevent direct user_type manipulation
CREATE OR REPLACE FUNCTION public.prevent_user_type_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Create trigger for profiles table
DROP TRIGGER IF EXISTS prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_type_change();

-- Security Fix 5: Enhanced RLS for emergency requests (admin visibility)
DROP POLICY IF EXISTS "Admins can view all emergency requests" ON public.emergency_requests;
CREATE POLICY "Admins can view all emergency requests" 
ON public.emergency_requests 
FOR SELECT 
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage all emergency requests" ON public.emergency_requests;
CREATE POLICY "Admins can manage all emergency requests" 
ON public.emergency_requests 
FOR UPDATE 
USING (public.is_admin());

-- Security Fix 6: Add audit logging
CREATE TABLE public.security_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit log (only admins can view)
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view security audit log" 
ON public.security_audit_log 
FOR SELECT 
USING (public.is_admin());

-- Security Fix 7: Create function to safely promote users to admin (for initial setup)
CREATE OR REPLACE FUNCTION public.promote_to_admin(target_user_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
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