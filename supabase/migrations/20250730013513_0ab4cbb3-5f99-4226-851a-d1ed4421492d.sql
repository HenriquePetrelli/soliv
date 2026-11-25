-- Temporarily promote a user to admin for testing (use the first user)
UPDATE profiles 
SET user_type = 'admin' 
WHERE user_id = '2ec95ab5-6dd2-40fb-a0d4-106c0dd178a3';