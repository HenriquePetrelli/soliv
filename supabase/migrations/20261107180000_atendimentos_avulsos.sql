-- Atendimentos avulsos (2026-11-07): SOS e consulta agendada comprados um a
-- um, cobrados na hora no cartão salvo no Stripe.
--
--   Sem plano:  SOS R$ 79,90 · consulta agendada R$ 149,90
--   Com plano:  SOS R$ 54,90 · consulta agendada R$ 109,90
--
-- A compra vira um crédito (extra_credits). A cota do plano é usada primeiro;
-- o crédito só quando ela não existe ou acabou. Se o atendimento não acontece
-- (SOS que não conectou, consulta recusada/cancelada/não realizada), o crédito
-- volta a ficar disponível. Consulta paga com crédito não é cancelada quando o
-- plano termina. O repasse ao psicólogo é o mesmo (R$ 85,00 / R$ 40,00).

CREATE TABLE IF NOT EXISTS public.extra_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('sos', 'appointment')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  price_tier text NOT NULL CHECK (price_tier IN ('free', 'plan')),
  stripe_payment_intent_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'consumed', 'refunded')),
  emergency_request_id uuid,
  appointment_id uuid,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS extra_credits_user_kind_status_idx ON public.extra_credits (user_id, kind, status, created_at);

ALTER TABLE public.extra_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Paciente vê os próprios avulsos" ON public.extra_credits;
CREATE POLICY "Paciente vê os próprios avulsos" ON public.extra_credits
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_super_admin());
REVOKE INSERT, UPDATE, DELETE ON public.extra_credits FROM anon, authenticated;
GRANT SELECT ON public.extra_credits TO authenticated;
GRANT ALL ON public.extra_credits TO service_role;

ALTER TABLE public.emergency_requests ADD COLUMN IF NOT EXISTS extra_credit_id uuid REFERENCES public.extra_credits(id) ON DELETE SET NULL;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS extra_credit_id uuid REFERENCES public.extra_credits(id) ON DELETE SET NULL;

-- O app não grava a ligação com o crédito (só o servidor).
CREATE OR REPLACE FUNCTION public.guard_extra_credit_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user = 'authenticated' THEN
    NEW.extra_credit_id := CASE WHEN TG_OP = 'UPDATE' THEN OLD.extra_credit_id ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS a_guard_extra_credit_link ON public.emergency_requests;
CREATE TRIGGER a_guard_extra_credit_link BEFORE INSERT OR UPDATE ON public.emergency_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_extra_credit_link();
DROP TRIGGER IF EXISTS a_guard_extra_credit_link ON public.appointments;
CREATE TRIGGER a_guard_extra_credit_link BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_extra_credit_link();

-- ===========================================================================
-- Créditos: comprar, usar, devolver (só o servidor chama)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.grant_extra_credit(p_user_id uuid, p_kind text, p_amount_cents integer, p_price_tier text, p_payment_intent text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.extra_credits (user_id, kind, amount_cents, price_tier, stripe_payment_intent_id)
  VALUES (p_user_id, p_kind, p_amount_cents, p_price_tier, p_payment_intent)
  ON CONFLICT (stripe_payment_intent_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.extra_credits WHERE stripe_payment_intent_id = p_payment_intent;
  END IF;
  RETURN v_id;
END;
$function$;

/** Usa o crédito disponível mais antigo; devolve o id ou NULL se não houver. */
CREATE OR REPLACE FUNCTION public.consume_extra_credit(p_user_id uuid, p_kind text, p_emergency_request_id uuid DEFAULT NULL, p_appointment_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.extra_credits
  WHERE user_id = p_user_id AND kind = p_kind AND status = 'available'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE public.extra_credits
  SET status = 'consumed', consumed_at = now(),
      emergency_request_id = p_emergency_request_id, appointment_id = p_appointment_id
  WHERE id = v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.return_extra_credit(p_credit_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.extra_credits
  SET status = 'available', consumed_at = NULL, emergency_request_id = NULL, appointment_id = NULL
  WHERE id = p_credit_id AND status = 'consumed';
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.grant_extra_credit(uuid, text, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_extra_credit(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.return_extra_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_extra_credit(uuid, text, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_extra_credit(uuid, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.return_extra_credit(uuid) TO service_role;

-- ===========================================================================
-- SOS: cota do plano primeiro, depois o avulso
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.plan_sos_quota(p_user_id uuid)
 RETURNS TABLE(can_use boolean, reason text, plan_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  same_month boolean;
  appointment_this_month boolean;
  brazil_today date;
  v_tier text;
BEGIN
  SELECT subscribed, subscription_tier, subscription_end, sos_used_this_month, sos_last_used,
         appointments_used_this_month, appointments_last_used
  INTO rec
  FROM public.subscribers
  WHERE user_id = p_user_id
  LIMIT 1;

  -- Plano vencido conta como sem plano (a rotina que encerra planos roda de hora em hora).
  IF NOT FOUND OR rec.subscribed IS FALSE OR (rec.subscription_end IS NOT NULL AND rec.subscription_end <= now()) THEN
    RETURN QUERY SELECT false, 'Usuário não possui assinatura ativa', COALESCE(rec.subscription_tier, NULL);
    RETURN;
  END IF;

  v_tier := public.normalize_plan_tier(rec.subscription_tier);
  IF v_tier IS NULL THEN
    RETURN QUERY SELECT false, 'Plano não permite uso de SOS', rec.subscription_tier;
    RETURN;
  END IF;

  brazil_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  same_month := rec.sos_last_used IS NOT NULL
    AND date_part('year', rec.sos_last_used) = date_part('year', brazil_today)
    AND date_part('month', rec.sos_last_used) = date_part('month', brazil_today);

  IF rec.sos_used_this_month AND same_month THEN
    RETURN QUERY SELECT false, format('Limite mensal de SOS já utilizado (%s: 1x/mês)', upper(v_tier)), v_tier;
    RETURN;
  END IF;

  -- Flex: 1 atendimento no mês, SOS ou consulta. A consulta reservada no mês
  -- (mesmo pendente) já gastou o atendimento; se for recusada ou cancelada,
  -- a cota volta e o SOS fica liberado de novo.
  IF v_tier = 'Flex' THEN
    appointment_this_month := rec.appointments_used_this_month
      AND rec.appointments_last_used IS NOT NULL
      AND date_trunc('month', rec.appointments_last_used AT TIME ZONE 'America/Sao_Paulo')
          = date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo');
    IF appointment_this_month THEN
      RETURN QUERY SELECT false, 'Atendimento do mês já usado em uma consulta agendada (FLEX: SOS ou consulta, 1x/mês)', v_tier;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, format('Pode usar SOS (%s: 1x/mês)', upper(v_tier)), v_tier;
END;
$function$;
REVOKE ALL ON FUNCTION public.plan_sos_quota(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_use_sos(p_user_id uuid)
 RETURNS TABLE(can_use boolean, reason text, plan_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q record;
BEGIN
  SELECT * INTO q FROM public.plan_sos_quota(p_user_id);
  IF q.can_use THEN
    RETURN QUERY SELECT q.can_use, q.reason, q.plan_type;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.extra_credits WHERE user_id = p_user_id AND kind = 'sos' AND status = 'available') THEN
    RETURN QUERY SELECT true, 'Pode usar SOS (avulso)'::text, COALESCE(q.plan_type, 'Avulso');
    RETURN;
  END IF;
  RETURN QUERY SELECT q.can_use, q.reason, q.plan_type;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_sos_used_on_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_credit uuid;
BEGIN
  IF OLD.started_at IS NULL AND NEW.started_at IS NOT NULL AND NEW.extra_credit_id IS NULL THEN
    IF (SELECT can_use FROM public.plan_sos_quota(NEW.patient_id)) THEN
      UPDATE public.subscribers
      SET sos_used_this_month = true,
          sos_last_used = (now() AT TIME ZONE 'America/Sao_Paulo')::date,
          updated_at = now()
      WHERE user_id = NEW.patient_id
        AND subscribed = true
        AND public.normalize_plan_tier(subscription_tier) IS NOT NULL;
    ELSE
      -- Sem cota do plano: usa um SOS avulso.
      v_credit := public.consume_extra_credit(NEW.patient_id, 'sos', NEW.id, NULL);
      IF v_credit IS NOT NULL THEN
        UPDATE public.emergency_requests SET extra_credit_id = v_credit WHERE id = NEW.id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refund_sos_on_failed_call()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.started_at IS NOT NULL
     AND NEW.status IN ('cancelled', 'completed')
     AND OLD.status IS DISTINCT FROM NEW.status
     AND (
        -- Psicólogo sumiu, os dois perderam o sinal ou a conexão não se manteve:
       -- devolve mesmo que a chamada tenha chegado a conectar.
       NEW.end_reason IN ('abandoned', 'psychologist_unavailable', 'connection_failure')
       -- Qualquer outro fim sem os dois lados chegarem a se ver/ouvir.
       OR NOT public.sos_call_connected(NEW.id)
     ) THEN
    IF NEW.extra_credit_id IS NOT NULL THEN
      -- SOS avulso: o crédito volta para a próxima vez.
      PERFORM public.return_extra_credit(NEW.extra_credit_id);
    ELSE
      UPDATE public.subscribers
      SET sos_used_this_month = false, updated_at = now()
      WHERE user_id = NEW.patient_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ===========================================================================
-- Consulta: devolver o crédito quando a consulta não acontece
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.release_appointment_quota(p_appointment_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a public.appointments%ROWTYPE;
  v_rows integer;
BEGIN
  SELECT * INTO a FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND OR a.appointment_type IS DISTINCT FROM 'regular' THEN
    RETURN false;
  END IF;

  -- Consulta avulsa: o crédito volta (uma vez só: só se ainda estiver preso a ela).
  IF a.extra_credit_id IS NOT NULL THEN
    UPDATE public.extra_credits
    SET status = 'available', consumed_at = NULL, appointment_id = NULL
    WHERE id = a.extra_credit_id AND appointment_id = a.id AND status = 'consumed';
    RETURN FOUND;
  END IF;

  UPDATE public.subscribers
  SET appointments_used_this_month = false, updated_at = now()
  WHERE user_id = a.patient_id
    AND appointments_used_this_month = true
    AND appointments_last_used IS NOT NULL
    AND date_trunc('month', appointments_last_used AT TIME ZONE 'America/Sao_Paulo')
        = date_trunc('month', a.created_at AT TIME ZONE 'America/Sao_Paulo');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$function$;

-- Fim do plano: só cancela as consultas que usaram a cota do plano.
CREATE OR REPLACE FUNCTION public.cancel_appointments_after_plan_loss(p_user_id uuid, p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_count integer := 0;
  v_keeps boolean;
  v_plan_ended boolean := p_reason = 'plan_ended';
BEGIN
  -- Ainda tem um plano com consultas (Flex ou Completo, ex.: pela empresa): nada muda.
  SELECT COALESCE(bool_or(subscribed AND public.plan_tier_has_appointments(subscription_tier)), false)
    INTO v_keeps
  FROM public.subscribers WHERE user_id = p_user_id;
  IF v_keeps THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT a.id, a.psychologist_id,
           CASE WHEN a.status = 'reschedule_proposed' AND a.proposed_scheduled_at IS NOT NULL
                THEN a.proposed_scheduled_at ELSE a.scheduled_at END AS starts_at
    FROM public.appointments a
    WHERE a.patient_id = p_user_id
      AND a.appointment_type = 'regular'
      -- Consulta paga como avulsa não depende do plano.
      AND a.extra_credit_id IS NULL
      AND a.status IN ('pending', 'scheduled', 'confirmed', 'reschedule_proposed')
      AND CASE WHEN a.status = 'reschedule_proposed' AND a.proposed_scheduled_at IS NOT NULL
               THEN a.proposed_scheduled_at ELSE a.scheduled_at END > now()
    FOR UPDATE
  LOOP
    UPDATE public.appointments
    SET status = 'cancelled',
        cancelled_at = now(),
        cancellation_reason = CASE WHEN v_plan_ended THEN 'O plano do paciente terminou' ELSE 'Plano cancelado pelo paciente' END
    WHERE id = r.id;

    INSERT INTO public.notifications (patient_id, appointment_id, title, message, status, push, link)
    VALUES (
      r.psychologist_id, r.id, 'Consulta cancelada',
      'A consulta de ' || public.format_br_datetime(r.starts_at) || ' foi cancelada: '
        || CASE WHEN v_plan_ended THEN 'o plano do paciente terminou.' ELSE 'o paciente cancelou o plano.' END
        || ' O horário ficou livre.',
      'unread', true, '/psicologo/consultas'
    );
    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    INSERT INTO public.notifications (patient_id, title, message, status, push, link)
    VALUES (
      p_user_id, 'Consultas canceladas',
      CASE WHEN v_plan_ended THEN
             CASE WHEN v_count = 1 THEN 'Seu plano terminou e a consulta marcada para depois disso foi cancelada. Para agendar de novo, escolha um plano.'
                  ELSE 'Seu plano terminou e as ' || v_count || ' consultas marcadas para depois disso foram canceladas. Para agendar de novo, escolha um plano.' END
           ELSE
             CASE WHEN v_count = 1 THEN 'Sua consulta agendada foi cancelada junto com o plano.'
                  ELSE 'Suas ' || v_count || ' consultas agendadas foram canceladas junto com o plano.' END
      END,
      'unread', v_plan_ended, CASE WHEN v_plan_ended THEN '/subscription-plans' ELSE '/appointments' END
    );
  END IF;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.warn_appointments_before_plan_end()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT s.user_id, s.subscription_end, a.id AS appointment_id,
           CASE WHEN a.status = 'reschedule_proposed' AND a.proposed_scheduled_at IS NOT NULL
                THEN a.proposed_scheduled_at ELSE a.scheduled_at END AS starts_at
    FROM public.subscribers s
    JOIN public.appointments a ON a.patient_id = s.user_id
    WHERE s.subscribed
      AND s.cancel_at_period_end
      AND public.plan_tier_has_appointments(s.subscription_tier)
      AND s.subscription_end > now()
      AND s.subscription_end <= now() + interval '3 days'
      AND a.appointment_type = 'regular'
      AND a.extra_credit_id IS NULL
      AND a.status IN ('pending', 'scheduled', 'confirmed', 'reschedule_proposed')
      AND CASE WHEN a.status = 'reschedule_proposed' AND a.proposed_scheduled_at IS NOT NULL
               THEN a.proposed_scheduled_at ELSE a.scheduled_at END >= s.subscription_end
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.patient_id = s.user_id AND n.appointment_id = a.id
          AND n.title = 'Consulta depois do fim do plano'
      )
  LOOP
    INSERT INTO public.notifications (patient_id, appointment_id, title, message, status, push, link)
    VALUES (
      r.user_id, r.appointment_id, 'Consulta depois do fim do plano',
      'Seu plano termina em ' || to_char(r.subscription_end AT TIME ZONE 'America/Sao_Paulo', 'DD/MM')
        || '. A consulta de ' || public.format_br_datetime(r.starts_at)
        || ' será cancelada se o plano não for renovado.',
      'unread', true, '/subscription-plans'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;
