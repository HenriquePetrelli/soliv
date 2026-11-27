BEGIN;
CREATE TEMP TABLE lt_ids ON COMMIT DROP AS
  SELECT id FROM auth.users WHERE email LIKE '%@loadtest.invalid';
-- Salas e conversas de teste primeiro (filhos: presença, mensagens).
DELETE FROM public.participant_presence WHERE session_id IN (SELECT id FROM public.webrtc_sessions WHERE patient_id IN (SELECT id FROM lt_ids) OR psychologist_id IN (SELECT id FROM lt_ids));
DELETE FROM public.webrtc_sessions WHERE patient_id IN (SELECT id FROM lt_ids) OR psychologist_id IN (SELECT id FROM lt_ids);
DELETE FROM public.mensagens WHERE conversa_id IN (SELECT id FROM public.conversas WHERE paciente_id IN (SELECT id FROM lt_ids) OR psicologo_id IN (SELECT id FROM lt_ids));
DELETE FROM public.conversas WHERE paciente_id IN (SELECT id FROM lt_ids) OR psicologo_id IN (SELECT id FROM lt_ids);
DELETE FROM public.emergency_requests WHERE patient_id IN (SELECT id FROM lt_ids);
-- Qualquer outra linha das contas de teste, em qualquer tabela pública.
DO $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.data_type = 'uuid'
      AND c.column_name IN ('user_id','patient_id','psychologist_id','paciente_id','psicologo_id','autor_id','accepted_by','actor_id')
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE %I IN (SELECT id FROM lt_ids)', r.table_name, r.column_name);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE NOTICE '% . %: %', r.table_name, r.column_name, n; END IF;
  END LOOP;
END $$;
DELETE FROM public.rate_limits WHERE EXISTS (SELECT 1 FROM lt_ids WHERE rate_limits.key LIKE '%' || lt_ids.id::text || '%');
DELETE FROM auth.users WHERE id IN (SELECT id FROM lt_ids);
SELECT count(*) AS sobrou FROM auth.users WHERE email LIKE '%@loadtest.invalid';
COMMIT;
