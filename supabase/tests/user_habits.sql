-- Teste de "Meus hábitos" (migration 20261001030059_…, "Meus hábitos").
--
--   supabase start
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -f supabase/tests/user_habits.sql
-- Tudo roda numa transação desfeita no final; qualquer falha interrompe com
-- "FALHOU: ...".

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.check(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT p_ok THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
  RAISE NOTICE 'ok: %', p_msg;
END $$;

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'paciente@teste.local'),
  ('b0000000-0000-0000-0000-00000000000b', 'outro@teste.local');
INSERT INTO public.fcm_tokens (user_id, token, is_active) VALUES ('a0000000-0000-0000-0000-00000000000a', 'token-a', true);
-- 'a' tem plano pago (até 10 hábitos); 'b' está no Plano Grátis (até 3).
INSERT INTO public.subscribers (user_id, email, subscribed, subscription_tier)
VALUES ('a0000000-0000-0000-0000-00000000000a', 'paciente@teste.local', true, 'Essencial')
ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id, subscribed = true, subscription_tier = 'Essencial';

-- 1. Cada um cuida só dos próprios hábitos
SELECT pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
INSERT INTO public.user_habits (id, user_id, kind, daily_goal, reminders_enabled, reminder_start, reminder_end, reminder_interval_minutes, timezone)
VALUES ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'water', 2000, true, '00:00', '23:59', 60, 'UTC');
INSERT INTO public.user_habits (id, user_id, kind, quit_started_at, settings, reminders_enabled, reminder_start, timezone)
VALUES ('10000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'quit_smoking', now() - interval '10 days',
        '{"cigarettes_per_day": 20, "pack_price": 12, "cigarettes_per_pack": 20}', true,
        date_trunc('minute', (now() AT TIME ZONE 'UTC')::time)::time, 'UTC');
INSERT INTO public.habit_events (habit_id, user_id, kind, amount, local_date)
VALUES ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'intake', 500, (now() AT TIME ZONE 'UTC')::date);

DO $$ BEGIN
  INSERT INTO public.user_habits (user_id, kind, daily_goal) VALUES ('a0000000-0000-0000-0000-00000000000a', 'water', 1500);
  RAISE EXCEPTION 'FALHOU: criou dois hábitos de água ativos';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'ok: um hábito de água ativo por vez';
END $$;

SELECT pg_temp.act_as('b0000000-0000-0000-0000-00000000000b');
SELECT pg_temp.check((SELECT count(*) FROM public.user_habits) = 0, 'outra pessoa não vê os hábitos');
SELECT pg_temp.check((SELECT count(*) FROM public.habit_events) = 0, 'outra pessoa não vê os registros');
DO $$ BEGIN
  INSERT INTO public.habit_events (habit_id, user_id, kind, amount, local_date)
  VALUES ('10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'intake', 200, current_date);
  RAISE EXCEPTION 'FALHOU: registrou no hábito de outra pessoa';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: não registra no hábito de outra pessoa';
END $$;
DO $$ BEGIN
  PERFORM public.register_habit_relapse('10000000-0000-0000-0000-000000000002', current_date);
  RAISE EXCEPTION 'FALHOU: registrou recaída no hábito de outra pessoa';
EXCEPTION WHEN no_data_found THEN RAISE NOTICE 'ok: não registra recaída no hábito de outra pessoa';
END $$;

-- 2. Lembretes: água abaixo da meta e o lembrete diário de quem parou de fumar
RESET role;
SET LOCAL role service_role;
SELECT pg_temp.check((SELECT count(*) FROM public.claim_due_habit_reminders()) = 2, 'dois lembretes devidos');
SELECT pg_temp.check((SELECT count(*) FROM public.claim_due_habit_reminders()) = 0, 'chamar de novo não repete lembrete');

-- Meta batida: sem lembrete de água mesmo depois do intervalo
RESET role;
UPDATE public.user_habits SET last_reminder_at = now() - interval '2 hours' WHERE id = '10000000-0000-0000-0000-000000000001';
INSERT INTO public.habit_events (habit_id, user_id, kind, amount, local_date)
VALUES ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'intake', 1500, (now() AT TIME ZONE 'UTC')::date);
SET LOCAL role service_role;
SELECT pg_temp.check((SELECT count(*) FROM public.claim_due_habit_reminders()) = 0, 'meta de água batida: sem lembrete');

-- Sem aparelho com notificação ativa: sem lembrete
RESET role;
DELETE FROM public.habit_events WHERE amount = 1500;
UPDATE public.fcm_tokens SET is_active = false;
SET LOCAL role service_role;
SELECT pg_temp.check((SELECT count(*) FROM public.claim_due_habit_reminders()) = 0, 'sem aparelho ativo: sem lembrete');

-- 3. Recaída: recomeça a contagem e guarda o recorde
RESET role;
SELECT pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
SELECT public.register_habit_relapse('10000000-0000-0000-0000-000000000002', current_date, 'Festa');
SELECT pg_temp.check(
  (SELECT best_streak_seconds BETWEEN 863000 AND 865000 FROM public.user_habits WHERE id = '10000000-0000-0000-0000-000000000002'),
  'recorde de 10 dias guardado'
);
SELECT pg_temp.check(
  (SELECT now() - quit_started_at < interval '1 minute' FROM public.user_habits WHERE id = '10000000-0000-0000-0000-000000000002'),
  'contagem recomeça na recaída'
);
SELECT pg_temp.check(
  (SELECT count(*) FROM public.habit_events WHERE kind = 'relapse' AND details ->> 'note' = 'Festa') = 1,
  'recaída fica no histórico'
);

-- 4. Limite de 10 hábitos ativos
DO $$ BEGIN
  FOR i IN 1..9 LOOP
    INSERT INTO public.user_habits (user_id, kind, title, quit_started_at)
    VALUES ('a0000000-0000-0000-0000-00000000000a', 'quit_custom', 'Hábito ' || i, now());
  END LOOP;
  RAISE EXCEPTION 'FALHOU: passou de 10 hábitos';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: no máximo 10 hábitos ativos';
END $$;

-- 5. Plano Grátis: no máximo 3 hábitos ativos
SELECT pg_temp.act_as('b0000000-0000-0000-0000-00000000000b');
DO $$ BEGIN
  FOR i IN 1..4 LOOP
    INSERT INTO public.user_habits (user_id, kind, title, quit_started_at)
    VALUES ('b0000000-0000-0000-0000-00000000000b', 'quit_custom', 'Hábito ' || i, now());
  END LOOP;
  RAISE EXCEPTION 'FALHOU: Plano Grátis passou de 3 hábitos';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: Plano Grátis com no máximo 3 hábitos ativos';
END $$;

RESET role;
ROLLBACK;
