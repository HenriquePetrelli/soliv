-- Fix security issues by removing direct user_metadata references in RLS policies

-- Drop policies that directly reference user_metadata (security vulnerability)
DROP POLICY IF EXISTS "Super admins can view all registrations" ON public.psychologist_registrations;
DROP POLICY IF EXISTS "Super admins can update all registrations" ON public.psychologist_registrations;

-- Recreate policies using the security definer function instead
CREATE POLICY "Super admins can view all registrations"
ON public.psychologist_registrations
FOR SELECT
USING (public.is_super_admin());

CREATE POLICY "Super admins can update all registrations"
ON public.psychologist_registrations
FOR UPDATE
USING (public.is_super_admin());