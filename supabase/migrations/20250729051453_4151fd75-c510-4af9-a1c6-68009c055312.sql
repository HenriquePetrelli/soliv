-- Remove the admin email from profiles table if it exists
DELETE FROM public.profiles 
WHERE user_id IN (
  SELECT id FROM auth.users 
  WHERE email = 'henriquepetrelli1996@gmail.com'
);

-- Also delete the user from auth.users if it exists (this will cascade delete the profile)
DELETE FROM auth.users 
WHERE email = 'henriquepetrelli1996@gmail.com';

-- Ensure the admin user exists in admin_users table
INSERT INTO public.admin_users (email, password_hash) 
VALUES ('henriquepetrelli1996@gmail.com', '$2b$10$example.hash.will.be.replaced.by.application')
ON CONFLICT (email) DO NOTHING;