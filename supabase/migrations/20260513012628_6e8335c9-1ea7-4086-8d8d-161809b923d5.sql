CREATE OR REPLACE FUNCTION public.is_super_admin(user_id_param uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE user_id = user_id_param
        AND is_active = true
    )
    OR EXISTS (
      SELECT 1
      FROM auth.users
      WHERE id = user_id_param
        AND COALESCE((raw_user_meta_data ->> 'is_super_admin')::boolean, false) = true
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_type(user_id_param uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT CASE
    WHEN public.is_super_admin(user_id_param) THEN 'admin'
    WHEN EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE user_id = user_id_param
        AND user_type = 'psychologist'
    ) THEN 'psychologist'
    WHEN EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE user_id = user_id_param
        AND user_type = 'patient'
    ) THEN 'patient'
    ELSE 'unknown'
  END;
$$;