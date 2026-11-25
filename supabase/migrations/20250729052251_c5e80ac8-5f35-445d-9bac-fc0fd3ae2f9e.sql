-- Remove the admin-related RLS policies first
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles; 
DROP POLICY IF EXISTS "Admins can delete all profiles" ON public.profiles;

-- Now drop the admin_users table
DROP TABLE IF EXISTS public.admin_users CASCADE;

-- Add admin user type to the enum  
DO $$ BEGIN
    ALTER TYPE public.user_type ADD VALUE IF NOT EXISTS 'admin';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;