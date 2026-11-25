-- Remove the old admin_users table and create new psychologist_registrations table
-- First drop all dependent policies

-- Drop policies that depend on is_admin function
DROP POLICY IF EXISTS "Admins can manage all emergency requests" ON public.emergency_requests;
DROP POLICY IF EXISTS "Admins can view all emergency requests" ON public.emergency_requests;
DROP POLICY IF EXISTS "Admins can view all appointments" ON public.appointments;
DROP POLICY IF EXISTS "Only admins can view security audit log" ON public.security_audit_log;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Drop existing policies and table
DROP POLICY IF EXISTS "Only admins can manage admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Only admins can view admin users" ON public.admin_users;
DROP TABLE IF EXISTS public.admin_users CASCADE;

-- Drop the old function
DROP FUNCTION IF EXISTS public.is_admin(uuid);

-- Create enum for registration status
CREATE TYPE public.registration_status AS ENUM ('pending', 'approved', 'rejected');

-- Create psychologist_registrations table
CREATE TABLE public.psychologist_registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  status registration_status NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on psychologist_registrations
ALTER TABLE public.psychologist_registrations ENABLE ROW LEVEL SECURITY;

-- Create policies for psychologist_registrations
CREATE POLICY "Users can view their own registration"
ON public.psychologist_registrations
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own registration"
ON public.psychologist_registrations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Super admins can view all registrations"
ON public.psychologist_registrations
FOR SELECT
USING ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'is_super_admin' = 'true');

CREATE POLICY "Super admins can update all registrations"
ON public.psychologist_registrations
FOR UPDATE
USING ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'is_super_admin' = 'true');

-- Create trigger for updated_at
CREATE TRIGGER update_psychologist_registrations_updated_at
BEFORE UPDATE ON public.psychologist_registrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create new is_super_admin function
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id_param uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(
    (
      SELECT (raw_user_meta_data ->> 'is_super_admin')::boolean
      FROM auth.users 
      WHERE id = user_id_param
    ), 
    false
  );
$$;

-- Update get_user_type function
DROP FUNCTION IF EXISTS public.get_user_type(uuid);
CREATE OR REPLACE FUNCTION public.get_user_type(user_id_param uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT 
    CASE 
      WHEN public.is_super_admin(user_id_param) THEN 'admin'
      WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = user_id_param AND user_type = 'psychologist') THEN 'psychologist'
      WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = user_id_param AND user_type = 'patient') THEN 'patient'
      ELSE 'unknown'
    END;
$$;

-- Update get_admin_metrics function
DROP FUNCTION IF EXISTS public.get_admin_metrics();
CREATE OR REPLACE FUNCTION public.get_admin_metrics()
RETURNS TABLE(total_patients bigint, active_psychologists bigint, pending_psychologists bigint, active_subscribers bigint, appointments_last_30_days bigint, sos_requests_last_30_days bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Only allow super admins to access this function
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied. Super admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM public.profiles WHERE user_type = 'patient')::BIGINT,
    (SELECT COUNT(*) FROM public.psychologist_registrations WHERE status = 'approved')::BIGINT,
    (SELECT COUNT(*) FROM public.psychologist_registrations WHERE status = 'pending')::BIGINT,
    (SELECT COUNT(*) FROM public.subscribers WHERE subscribed = true)::BIGINT,
    (SELECT COUNT(*) FROM public.appointments WHERE created_at >= NOW() - INTERVAL '30 days')::BIGINT,
    (SELECT COUNT(*) FROM public.emergency_requests WHERE created_at >= NOW() - INTERVAL '30 days')::BIGINT;
END;
$$;

-- Recreate all RLS policies with is_super_admin
CREATE POLICY "Super admins can view all appointments"
ON public.appointments
FOR SELECT
USING (public.is_super_admin());

CREATE POLICY "Super admins can manage all emergency requests"
ON public.emergency_requests
FOR UPDATE
USING (public.is_super_admin());

CREATE POLICY "Super admins can view all emergency requests"
ON public.emergency_requests
FOR SELECT
USING (public.is_super_admin());

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING ((auth.uid() = user_id) OR (public.is_super_admin() AND user_type = ANY (ARRAY['patient'::user_type, 'psychologist'::user_type])));

CREATE POLICY "Only super admins can view security audit log"
ON public.security_audit_log
FOR SELECT
USING (public.is_super_admin());