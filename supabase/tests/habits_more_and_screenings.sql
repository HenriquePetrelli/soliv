-- Teste da migration 20261003000704_430065d1-08fe-4c94-b0ba-9912555d03f3.sql (rodar num banco
-- de teste com a migration de hábitos e esta aplicadas). Cada checagem imprime
-- uma linha "ok"; qualquer falha aborta com erro.
\set ON_ERROR_STOP 1
SET client_min_messages = warning;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'paciente@x.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'psi@x.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'outro-psi@x.com');
INSERT INTO public.fcm_tokens (user_id, token) VALUES ('00000000-0000-0000-0000-0000000000a1', 'tok');
-- Plano pago: no Plano Grátis cabem só 3 hábitos (migration 20261107120000).
INSERT INTO public.subscribers (user_id, email, subscribed, subscription_tier)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'paciente@x.com', true, 'Completo')
ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id, subscribed = true, subscription_tier = 'Completo';

CREATE FUNCTION pg_temp.check(cond boolean, label text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'FALHOU: %', label; END IF;
  RETURN 'ok - ' || label;
END $$;

CREATE FUNCTION pg_temp.local_hhmm(delta interval) RETURNS text LANGUAGE sql AS $$
  -- Fica dentro do dia de hoje: perto da meia-noite, "há 40 min" cairia
  -- ontem e "daqui a 3 h" amanhã, e o teste falhava sem defeito no app.
  SELECT to_char(LEAST(GREATEST((now() AT TIME ZONE 'America/Sao_Paulo') + delta,
                                date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')),
                       date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '23 hours 59 minutes'),
                 'HH24:MI')
$$;

-- 1. Novos tipos aceitos; remédio exige nome; vários remédios ao mesmo tempo.
INSERT INTO public.user_habits (id, user_id, kind, daily_goal, settings) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'caffeine', 400, '{"cutoff_time":"14:00"}'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'meals', 3, '{}'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'screen_time', 120, '{}'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', 'joy', 1, '{}');
INSERT INTO public.user_habits (id, user_id, kind, title, daily_goal, settings, reminders_enabled) VALUES
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', 'medication', 'Sertralina', 1,
   jsonb_build_object('times', jsonb_build_array(pg_temp.local_hhmm('-30 minutes'))), true),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', 'medication', 'Vitamina D', 1,
   jsonb_build_object('times', jsonb_build_array(pg_temp.local_hhmm('3 hours'))), true);
SELECT pg_temp.check((SELECT count(*) FROM public.user_habits WHERE kind = 'medication') = 2, 'dois remédios ativos ao mesmo tempo');

DO $$ BEGIN
  INSERT INTO public.user_habits (user_id, kind, daily_goal) VALUES ('00000000-0000-0000-0000-0000000000a1', 'medication', 1);
  RAISE EXCEPTION 'remédio sem nome deveria falhar';
EXCEPTION WHEN check_violation THEN NULL; END $$;
SELECT pg_temp.check(true, 'remédio sem nome é recusado');

DO $$ BEGIN
  INSERT INTO public.user_habits (user_id, kind, daily_goal) VALUES ('00000000-0000-0000-0000-0000000000a1', 'caffeine', 300);
  RAISE EXCEPTION 'segunda cafeína deveria falhar';
EXCEPTION WHEN unique_violation THEN NULL; END $$;
SELECT pg_temp.check(true, 'só uma cafeína ativa por vez');

DO $$ BEGIN
  INSERT INTO public.user_habits (user_id, kind) VALUES ('00000000-0000-0000-0000-0000000000a1', 'joy');
  RAISE EXCEPTION 'hábito do dia sem meta deveria falhar';
EXCEPTION WHEN check_violation THEN NULL; END $$;
SELECT pg_temp.check(true, 'hábito do dia sem meta é recusado');

INSERT INTO public.habit_events (habit_id, user_id, kind, local_date, details)
VALUES ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'check', CURRENT_DATE, '{"item":"offline_before_bed"}');
SELECT pg_temp.check(true, 'evento "check" aceito');

-- 2. Lembrete do remédio: só o horário que já passou (há 30 min), uma vez.
CREATE TEMP TABLE r1 AS SELECT * FROM public.claim_due_habit_reminders();
SELECT pg_temp.check((SELECT count(*) FROM r1 WHERE kind = 'medication') = 1, 'só o remédio do horário que passou é lembrado');
SELECT pg_temp.check((SELECT due_slot FROM r1 WHERE kind = 'medication') = pg_temp.local_hhmm('-30 minutes'), 'due_slot traz o horário');
CREATE TEMP TABLE r2 AS SELECT * FROM public.claim_due_habit_reminders();
SELECT pg_temp.check((SELECT count(*) FROM r2 WHERE kind = 'medication') = 0, 'o mesmo horário não é lembrado duas vezes');

-- Dose marcada: mesmo com o lembrete "zerado", não avisa mais.
UPDATE public.user_habits SET last_reminder_at = NULL WHERE id = '10000000-0000-0000-0000-000000000005';
INSERT INTO public.habit_events (habit_id, user_id, kind, amount, local_date, details)
VALUES ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', 'intake', 1,
        (now() AT TIME ZONE 'America/Sao_Paulo')::date, jsonb_build_object('slot', pg_temp.local_hhmm('-30 minutes')));
CREATE TEMP TABLE r3 AS SELECT * FROM public.claim_due_habit_reminders();
SELECT pg_temp.check((SELECT count(*) FROM r3 WHERE kind = 'medication') = 0, 'dose já marcada não gera lembrete');

-- 3. Questionários: pontuação, gravidade e alerta da pergunta 9 no banco.
INSERT INTO public.mental_health_screenings (id, user_id, instrument, answers) VALUES
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'gad7', '{2,2,2,2,1,1,1}'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'phq9', '{3,3,3,3,3,3,2,2,1}');
SELECT pg_temp.check((SELECT score = 11 AND severity = 'moderate' AND NOT self_harm_flag FROM public.mental_health_screenings WHERE instrument = 'gad7'), 'GAD-7 11 = moderada');
SELECT pg_temp.check((SELECT score = 23 AND severity = 'severe' AND self_harm_flag FROM public.mental_health_screenings WHERE instrument = 'phq9'), 'PHQ-9 23 = grave, com alerta da pergunta 9');

DO $$ BEGIN
  INSERT INTO public.mental_health_screenings (user_id, instrument, answers) VALUES ('00000000-0000-0000-0000-0000000000a1', 'gad7', '{1,1,1}');
  RAISE EXCEPTION 'GAD-7 com 3 respostas deveria falhar';
EXCEPTION WHEN check_violation THEN NULL; END $$;
SELECT pg_temp.check(true, 'número errado de respostas é recusado');

DO $$ BEGIN
  INSERT INTO public.mental_health_screenings (user_id, instrument, answers) VALUES ('00000000-0000-0000-0000-0000000000a1', 'gad7', '{4,0,0,0,0,0,0}');
  RAISE EXCEPTION 'resposta 4 deveria falhar';
EXCEPTION WHEN check_violation THEN NULL; END $$;
SELECT pg_temp.check(true, 'resposta fora de 0 a 3 é recusada');

-- Pontuação vem do banco, mesmo se o app mandar outra.
INSERT INTO public.mental_health_screenings (user_id, instrument, answers, score, severity)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'gad7', '{0,0,0,0,0,0,0}', 21, 'severe');
SELECT pg_temp.check((SELECT score = 0 AND severity = 'minimal' FROM public.mental_health_screenings WHERE answers = '{0,0,0,0,0,0,0}'), 'pontuação enviada pelo app é ignorada');

-- 4. Permissões: psicólogo só vê o que foi compartilhado, e só se atende o paciente.
-- A consulta exige o psicólogo cadastrado.
INSERT INTO public.psychologists (user_id, full_name, email, crp_number, approved, approval_status)
VALUES ('00000000-0000-0000-0000-0000000000b1', 'Psi Teste', 'psi@x.com', '06/00001', true, 'approved');
INSERT INTO public.appointments (patient_id, psychologist_id, status, scheduled_at)
VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'completed', now() - interval '2 days');

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
SELECT pg_temp.check((SELECT count(*) FROM public.mental_health_screenings) = 0, 'psicólogo não vê o que não foi compartilhado');
SELECT pg_temp.check((SELECT count(*) FROM public.user_habits) = 0, 'psicólogo não vê hábitos');
RESET ROLE;

UPDATE public.mental_health_screenings SET shared_with_psychologist = true WHERE instrument = 'phq9';

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
SELECT pg_temp.check((SELECT count(*) FROM public.mental_health_screenings) = 1, 'psicólogo do paciente vê o compartilhado');
DO $$ BEGIN
  UPDATE public.mental_health_screenings SET answers = '{0,0,0,0,0,0,0,0,0}';
END $$;
RESET ROLE;
SELECT pg_temp.check((SELECT score FROM public.mental_health_screenings WHERE instrument = 'phq9') = 23, 'psicólogo não altera respostas');

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
SELECT pg_temp.check((SELECT count(*) FROM public.mental_health_screenings) = 0, 'outro psicólogo não vê nada');
SET request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
SELECT pg_temp.check((SELECT count(*) FROM public.mental_health_screenings) = 3, 'paciente vê os próprios questionários');
UPDATE public.mental_health_screenings SET shared_with_psychologist = false;
RESET ROLE;
SELECT pg_temp.check((SELECT count(*) FROM public.mental_health_screenings WHERE shared_with_psychologist) = 0, 'paciente pode deixar de compartilhar');
