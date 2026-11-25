-- Add missing fields to profiles table for psychologist registration
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS specialty TEXT,
ADD COLUMN IF NOT EXISTS cpf TEXT,
ADD COLUMN IF NOT EXISTS professional_email TEXT,
ADD COLUMN IF NOT EXISTS registration_status TEXT DEFAULT 'pending' CHECK (registration_status IN ('pending', 'approved', 'rejected'));

-- Create index for faster queries on registration status
CREATE INDEX IF NOT EXISTS idx_profiles_registration_status ON public.profiles(registration_status);

-- Create admin_users table for admin authentication
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Create policy for admin_users (only authenticated admins can access)
CREATE POLICY "Admins can manage admin users" 
ON public.admin_users 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Insert default admin user (password will be hashed in the application)
INSERT INTO public.admin_users (email, password_hash) 
VALUES ('henriquepetrelli1996@gmail.com', '$2b$10$example.hash.will.be.replaced.by.application')
ON CONFLICT (email) DO NOTHING;

-- Create trigger for updating admin_users updated_at
CREATE TRIGGER update_admin_users_updated_at
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update profiles RLS policies to allow admin access
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.admin_users 
  WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
));

CREATE POLICY "Admins can update all profiles" 
ON public.profiles 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.admin_users 
  WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
));

CREATE POLICY "Admins can delete all profiles" 
ON public.profiles 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.admin_users 
  WHERE email = current_setting('request.jwt.claims', true)::json->>'email'
));