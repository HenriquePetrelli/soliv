-- Escala (2026-11-08): o app aguentar muita gente ao mesmo tempo.
--
-- 1. Painel de SOS dos psicólogos: a lista de pedidos abertos vem de uma
--    função do banco (uma consulta), não mais da edge function
--    psychologist-emergency chamada a cada 10 s por psicólogo (cada chamada
--    gastava a cota mensal de funções e fazia 2 consultas por pedido).
-- 2. Lembretes de hábitos em lotes de 500: com milhares devidos ao mesmo
--    tempo, a edge function estourava o tempo e os lembretes já marcados se
--    perdiam. A edge function repete até acabar.
-- 3. Cache do estado da assinatura no Stripe (stripe_customer_state): o
--    check-subscription não consulta o Stripe a cada vez que o app abre (o
--    webhook mantém o cache em dia), evitando o limite de requisições do
--    Stripe em pico de acesso.

-- ===========================================================================
-- 1. Fila de SOS para o psicólogo
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.list_open_emergency_requests()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Só psicólogo aprovado e não bloqueado vê a fila (nome e sintomas do paciente).
  IF v_uid IS NULL OR NOT public.psychologist_can_attend(v_uid) THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(
             to_jsonb(e) || jsonb_build_object(
               'patient', jsonb_build_object(
                 'full_name', COALESCE(p.full_name, 'Paciente'),
                 'symptoms', COALESCE(to_jsonb(pt.sintomas_selecionados), '[]'::jsonb)
               )
             )
             ORDER BY e.created_at
           )
    FROM public.emergency_requests e
    LEFT JOIN public.profiles p ON p.user_id = e.patient_id
    LEFT JOIN public.patients pt ON pt.user_id = e.patient_id
    WHERE e.status = 'pending'
      AND e.created_at > now() - interval '10 minutes'
  ), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.list_open_emergency_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_open_emergency_requests() TO authenticated;

-- Pedidos abertos (a fila e as rotinas filtram por status e data).
CREATE INDEX IF NOT EXISTS emergency_requests_open_idx ON public.emergency_requests (created_at)
  WHERE status IN ('pending', 'accepted', 'in_progress');

-- ===========================================================================
-- 2. Lembretes de hábitos em lotes de 500
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.claim_due_habit_reminders()
 RETURNS TABLE(habit_id uuid, user_id uuid, kind text, title text, daily_goal numeric, today_total numeric, quit_started_at timestamp with time zone, settings jsonb, due_slot text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT h.*,
           (now() AT TIME ZONE h.timezone) AS local_now
    FROM public.user_habits h
    WHERE h.archived_at IS NULL
      AND h.reminders_enabled
      AND public.is_valid_timezone(h.timezone)
      AND EXISTS (SELECT 1 FROM public.fcm_tokens t WHERE t.user_id = h.user_id AND t.is_active IS NOT FALSE)
  ),
  totals AS (
    SELECT c.id,
           c.local_now,
           COALESCE((
             SELECT sum(e.amount) FROM public.habit_events e
              WHERE e.habit_id = c.id AND e.kind = 'intake' AND e.local_date = c.local_now::date
           ), 0) AS total,
           EXISTS (
             SELECT 1 FROM public.habit_events e
             WHERE e.habit_id = c.id AND e.kind IN ('intake', 'check') AND e.local_date = c.local_now::date
           ) AS logged_today
    FROM candidates c
  ),
  -- Horários com lembrete próprio que estão valendo agora (até 2 h depois) e
  -- ainda não foram marcados: doses do remédio (settings.times, marcadas em
  -- details.slot) e refeições (settings.meal_times, marcadas em details.meal).
  slots AS (
    SELECT c.id, s.t AS slot, s.t AS at_time
    FROM candidates c
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(c.settings -> 'times') = 'array' THEN c.settings -> 'times' ELSE '[]'::jsonb END
    ) AS s(t)
    WHERE c.kind = 'medication'
      AND s.t ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND NOT EXISTS (
        SELECT 1 FROM public.habit_events e
        WHERE e.habit_id = c.id AND e.kind = 'intake'
          AND e.local_date = c.local_now::date AND e.details ->> 'slot' = s.t
      )
    UNION ALL
    SELECT c.id, m.key, m.value
    FROM candidates c
    CROSS JOIN LATERAL jsonb_each_text(
      CASE WHEN jsonb_typeof(c.settings -> 'meal_times') = 'object' THEN c.settings -> 'meal_times' ELSE '{}'::jsonb END
    ) AS m(key, value)
    WHERE c.kind = 'meals'
      AND m.value ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND NOT EXISTS (
        SELECT 1 FROM public.habit_events e
        WHERE e.habit_id = c.id AND e.kind = 'intake'
          AND e.local_date = c.local_now::date AND e.details ->> 'meal' = m.key
      )
  ),
  med_slots AS (
    SELECT s.id, s.slot, s.at_time
    FROM slots s
    JOIN candidates c ON c.id = s.id
    WHERE c.local_now::time >= s.at_time::time
      AND c.local_now::time - s.at_time::time < interval '2 hours'
      AND (c.last_reminder_at IS NULL
           OR (c.last_reminder_at AT TIME ZONE c.timezone) < (c.local_now::date + s.at_time::time))
  ),
  -- Hábitos que avisam por horário (remédio; refeições com horários).
  slotted AS (
    SELECT c.id FROM candidates c
    WHERE c.kind = 'medication'
       OR (c.kind = 'meals' AND jsonb_typeof(c.settings -> 'meal_times') = 'object')
  ),
  due AS (
    SELECT c.id, c.last_reminder_at
    FROM candidates c
    JOIN totals t ON t.id = c.id
    WHERE (
        c.id IN (SELECT id FROM slotted)
        AND EXISTS (SELECT 1 FROM med_slots m WHERE m.id = c.id)
      )
      OR (
        c.id NOT IN (SELECT id FROM slotted)
        AND c.local_now::time >= c.reminder_start
        -- Já feito hoje: sono/algo que me faz bem anotados, meta batida.
        AND NOT (c.kind IN ('sleep', 'joy') AND t.logged_today)
        AND NOT (c.kind IN ('water', 'movement', 'meals') AND c.daily_goal IS NOT NULL AND t.total >= c.daily_goal)
        AND (
          -- Um por dia, até 3 horas depois do horário escolhido.
          (c.reminder_interval_minutes IS NULL
            AND c.local_now::time - c.reminder_start < interval '3 hours'
            AND (c.last_reminder_at IS NULL OR (c.last_reminder_at AT TIME ZONE c.timezone)::date < c.local_now::date))
          OR
          -- A cada N minutos dentro da janela, enquanto a meta do dia não foi batida.
          (c.reminder_interval_minutes IS NOT NULL
            AND c.local_now::time <= c.reminder_end
            AND (c.daily_goal IS NULL OR t.total < c.daily_goal)
            AND (c.last_reminder_at IS NULL
                 OR now() - c.last_reminder_at >= make_interval(mins => c.reminder_interval_minutes - 5)))
        )
      )
  
    ORDER BY c.last_reminder_at NULLS FIRST
    LIMIT 500
  ),
  claimed AS (
    UPDATE public.user_habits h
    SET last_reminder_at = now()
    FROM due
    WHERE h.id = due.id
      -- Se outra execução já marcou este lembrete, não envia de novo.
      AND h.last_reminder_at IS NOT DISTINCT FROM due.last_reminder_at
    RETURNING h.*
  )
  SELECT cl.id, cl.user_id, cl.kind, cl.title, cl.daily_goal, t.total, cl.quit_started_at, cl.settings,
         (SELECT m.slot FROM med_slots m WHERE m.id = cl.id ORDER BY m.at_time DESC LIMIT 1)
  FROM claimed cl
  JOIN totals t ON t.id = cl.id;
END;
$function$
;

-- ===========================================================================
-- 3. Cache do Stripe (só o servidor lê e grava)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.stripe_customer_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text,
  state jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_customer_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_customer_state FROM anon, authenticated;
GRANT ALL ON public.stripe_customer_state TO service_role;
CREATE INDEX IF NOT EXISTS stripe_customer_state_customer_idx ON public.stripe_customer_state (stripe_customer_id);
