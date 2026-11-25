
-- Revoke EXECUTE from public/anon/authenticated on SECURITY DEFINER functions
-- that are only invoked by triggers or scheduled jobs (never called directly by clients).

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'update_patient_statistics_updated_at()',
    'cleanup_quarterly_activities()',
    'prevent_user_type_change()',
    'update_weekly_goals_updated_at()',
    'sync_consultation_counts()',
    'update_private_journals_updated_at()',
    'update_psychologists_updated_at()',
    'notify_psychologist_status_change()',
    'update_updated_at_column()',
    'handle_new_user()',
    'update_patient_weekly_goals_updated_at()',
    'reset_patient_weekly_goals_array()',
    'reset_weekly_goals()',
    'audit_sensitive_operations()',
    'update_psychologist_appointment_count()',
    'update_patient_consultation_stats()',
    'audit_admin_changes()',
    'sync_psychologist_payments()',
    'gerenciar_expiracao_conversas()',
    'update_testimonial_like_counts()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Function public.% not found, skipping', fn;
    END;
  END LOOP;
END $$;
