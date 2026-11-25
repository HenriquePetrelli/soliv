-- Update user metadata to add is_super_admin flag
UPDATE auth.users 
SET raw_user_meta_data = raw_user_meta_data || '{"is_super_admin": true}'::jsonb
WHERE email = 'admin@admin.com';