
ALTER FUNCTION public.update_patient_weekly_goals_updated_at() SET search_path = 'public';
ALTER FUNCTION public.update_patient_statistics_updated_at() SET search_path = 'public';
ALTER FUNCTION public.update_weekly_goals_updated_at() SET search_path = 'public';

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated;',
      fn.schema_name, fn.func_name, fn.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role;',
      fn.schema_name, fn.func_name, fn.args
    );
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_patient_achievements(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_psychologist_rejection_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_unique_crp(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_emergency_accepted(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_emergency_rejected(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_patient_activity(uuid, text, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_quarterly_activity(uuid, text, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_patient_activity_time(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_patient_streak(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_psychologist_profile(uuid, text, text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_psychologist_profile(uuid, text, text, text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_psychologist_profile(uuid, text, text, text, text, text, text, text, boolean, text, text, text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_type(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_sos(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_document(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_document(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_route_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_cpf(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_crp(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_criar_conversa(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_statistics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_psychologist_average_rating(uuid) TO authenticated;

DROP POLICY IF EXISTS "Public can read documents" ON storage.objects;
