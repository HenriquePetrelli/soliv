GRANT EXECUTE ON FUNCTION public.get_admin_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_type(uuid) TO authenticated;