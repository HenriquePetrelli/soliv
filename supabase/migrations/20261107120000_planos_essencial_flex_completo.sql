-- Planos novos (2026-11-07): Grátis, Essencial (R$ 69,90), Flex (R$ 120,00)
-- e Completo (R$ 159,90).
--
-- 1. Nomes: Plus → Essencial (mesmos benefícios: 1 SOS por mês); Premium →
--    Completo (1 SOS e 1 consulta agendada por mês). Novo: Flex, com 1
--    atendimento por mês, usado como SOS ou como consulta agendada (usou um,
--    o outro fica indisponível até o mês seguinte).
-- 2. Repasse fixo por atendimento: consulta agendada R$ 85,00 (era R$ 90,00) e
--    SOS R$ 40,00 (era R$ 50,00). Vale para os atendimentos que entram no
--    livro a partir de agora; itens já registrados mantêm o valor da época.
-- 3. Plano Grátis: diário só leitura, até 3 hábitos, 1 plano de segurança,
--    chat só leitura (grupos de apoio já eram só leitura).

-- ===========================================================================
-- Funções de apoio
-- ===========================================================================

/** Nome do plano normalizado (aceita os nomes antigos Plus e Premium). */
CREATE OR REPLACE FUNCTION public.normalize_plan_tier(p_tier text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE lower(btrim(COALESCE(p_tier, '')))
    WHEN 'essencial' THEN 'Essencial'
    WHEN 'plus' THEN 'Essencial'
    WHEN 'flex' THEN 'Flex'
    WHEN 'completo' THEN 'Completo'
    WHEN 'premium' THEN 'Completo'
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.plan_tier_rank(p_tier text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE public.normalize_plan_tier(p_tier)
    WHEN 'Completo' THEN 3
    WHEN 'Flex' THEN 2
    WHEN 'Essencial' THEN 1
    ELSE 0
  END;
$function$;

/** Planos com consulta agendada: Flex e Completo. */
CREATE OR REPLACE FUNCTION public.plan_tier_has_appointments(p_tier text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT public.normalize_plan_tier(p_tier) IN ('Flex', 'Completo');
$function$;

CREATE OR REPLACE FUNCTION public.plan_tier_limits(p_tier text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE public.normalize_plan_tier(p_tier)
    WHEN 'Essencial' THEN '{"appointments": 0, "sos_uses": 1, "shared": false}'::jsonb
    WHEN 'Flex' THEN '{"appointments": 1, "sos_uses": 1, "shared": true}'::jsonb
    WHEN 'Completo' THEN '{"appointments": 1, "sos_uses": 1, "shared": false}'::jsonb
    ELSE '{"appointments": 0, "sos_uses": 0, "shared": false}'::jsonb
  END;
$function$;

-- ===========================================================================
-- Plano pago (Essencial, Flex ou Completo) — grupos de apoio, diário, chat
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.has_paid_plan(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.subscribers s
    WHERE s.user_id = p_user_id
      AND s.subscribed
      AND public.normalize_plan_tier(s.subscription_tier) IS NOT NULL
      AND (s.subscription_end IS NULL OR s.subscription_end > now())
  );
$function$;

CREATE OR REPLACE FUNCTION public.guard_group_paid_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF NOT public.current_user_has_paid_plan() THEN
    RAISE EXCEPTION 'Escrever depoimentos e reagir é dos planos Essencial, Flex e Completo.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

-- ===========================================================================
-- Gatilhos que dependem do plano (antes de renomear os dados, para a troca
-- Premium → Completo não ser lida como "perdeu o plano com consultas")
-- ===========================================================================
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

CREATE OR REPLACE FUNCTION public.cancel_appointments_on_plan_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.user_id IS NOT NULL
     AND OLD.subscribed AND public.plan_tier_has_appointments(OLD.subscription_tier)
     AND NOT (NEW.subscribed AND public.plan_tier_has_appointments(NEW.subscription_tier)) THEN
    PERFORM public.cancel_appointments_after_plan_loss(NEW.user_id, 'plan_ended');
  END IF;
  RETURN NEW;
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

CREATE OR REPLACE FUNCTION public.notify_plan_ended()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.user_id IS NULL OR NOT OLD.subscribed OR NEW.subscribed THEN
    RETURN NEW;
  END IF;
  -- Um aviso só, mesmo se várias rotinas encerrarem o plano no mesmo dia.
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE patient_id = NEW.user_id AND title = 'Seu plano terminou' AND created_at > now() - interval '1 day'
  ) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.notifications (patient_id, title, message, status, push, link)
  VALUES (
    NEW.user_id,
    'Seu plano terminou',
    'Seu plano ' || COALESCE(OLD.subscription_tier, '') || ' terminou e você está no Plano Grátis. '
      || 'Seu diário, seus hábitos e seus planos de segurança continuam salvos; os exercícios e os sons seguem liberados. Para voltar a escrever no diário e ter SOS e consultas, escolha um plano.',
    'unread',
    false,
    '/subscription-plans'
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_sos_used_on_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.started_at IS NULL AND NEW.started_at IS NOT NULL THEN
    UPDATE public.subscribers
    SET sos_used_this_month = true,
        sos_last_used = (now() AT TIME ZONE 'America/Sao_Paulo')::date,
        updated_at = now()
    WHERE user_id = NEW.patient_id
      AND subscribed = true
      AND public.normalize_plan_tier(subscription_tier) IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- ===========================================================================
-- SOS: Flex divide o atendimento do mês com a consulta agendada
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.can_use_sos(p_user_id uuid)
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

-- ===========================================================================
-- Empresas (B2B)
-- ===========================================================================
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_plan_tier_check;

CREATE OR REPLACE FUNCTION public.organization_entitlement_internal(p_user_id uuid)
RETURNS TABLE (tier text, organization_id uuid, organization_name text, ends_on date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.normalize_plan_tier(o.plan_tier), o.id, o.name,
         CASE
           WHEN m.status = 'removed' THEN LEAST(m.access_until, COALESCE(o.ends_on, m.access_until))
           ELSE o.ends_on
         END
  FROM public.organization_members m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = p_user_id
    AND m.role = 'member'
    AND (
      m.status = 'active'
      OR (m.status = 'removed' AND m.access_until IS NOT NULL
          AND m.access_until >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
    )
    AND o.status = 'active'
    AND o.starts_on <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
    AND (o.ends_on IS NULL OR o.ends_on >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
  ORDER BY public.plan_tier_rank(o.plan_tier) DESC, (m.status = 'active') DESC
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.apply_organization_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ent record;
  v_rank_stripe integer;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO ent FROM public.organization_entitlement_internal(NEW.user_id);

  -- Plano do Stripe nesta escrita. As funções do Stripe (check-subscription,
  -- stripe-webhook, cancel-subscription) gravam entitlement_source = 'stripe';
  -- linhas antigas, sem origem, também contam como Stripe.
  IF NEW.subscribed AND NEW.subscription_tier IS NOT NULL AND COALESCE(NEW.entitlement_source, 'stripe') = 'stripe' THEN
    v_rank_stripe := public.plan_tier_rank(NEW.subscription_tier);
  ELSE
    v_rank_stripe := 0;
  END IF;

  IF ent.tier IS NOT NULL AND public.plan_tier_rank(ent.tier) > v_rank_stripe THEN
    NEW.subscribed := true;
    NEW.subscription_tier := ent.tier;
    NEW.plan_limits := public.plan_tier_limits(ent.tier);
    NEW.subscription_end := CASE WHEN ent.ends_on IS NULL THEN NULL ELSE (ent.ends_on + 1)::timestamptz END;
    NEW.entitlement_source := 'organization';
    NEW.organization_id := ent.organization_id;
  ELSIF v_rank_stripe > 0 THEN
    NEW.entitlement_source := 'stripe';
    NEW.organization_id := NULL;
  ELSIF NEW.entitlement_source = 'organization' THEN
    -- Era da empresa e não é mais (saiu, contrato pausado ou vencido).
    NEW.subscribed := false;
    NEW.subscription_tier := NULL;
    NEW.plan_limits := public.plan_tier_limits(NULL);
    NEW.subscription_end := NULL;
    NEW.entitlement_source := NULL;
    NEW.organization_id := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- Dados: renomeia os planos das empresas e das assinaturas.
UPDATE public.organizations
SET plan_tier = public.normalize_plan_tier(plan_tier)
WHERE plan_tier IS DISTINCT FROM public.normalize_plan_tier(plan_tier);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_tier_check CHECK (plan_tier IN ('Essencial', 'Flex', 'Completo'));

UPDATE public.subscribers
SET subscription_tier = public.normalize_plan_tier(subscription_tier),
    plan_limits = public.plan_tier_limits(subscription_tier)
WHERE subscription_tier IS NOT NULL
  AND subscription_tier IS DISTINCT FROM public.normalize_plan_tier(subscription_tier);

-- ===========================================================================
-- Repasse: consulta R$ 85,00 e SOS R$ 40,00
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.sync_psychologist_payments()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Semanas fechadas (até a última segunda-feira, no horário de Brasília); o
  -- que ficou de fora de sincronizações anteriores também entra.
  v_cutoff timestamptz := (date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')) AT TIME ZONE 'America/Sao_Paulo';
  r record;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _new_payout_items (
    source_type text, psychologist_user_id uuid, amount numeric
  ) ON COMMIT DROP;
  TRUNCATE _new_payout_items;

  WITH inserted AS (
    INSERT INTO public.payout_items (source_type, source_id, psychologist_user_id, amount, occurred_at)
    SELECT 'appointment', a.id, a.psychologist_id, 85.00, a.scheduled_at
    FROM public.appointments a
    WHERE a.status = 'completed'
      AND a.appointment_type = 'regular'
      AND a.scheduled_at < v_cutoff
      AND public.appointment_call_connected(a.video_room_id)
    UNION ALL
    SELECT 'sos', e.id, e.accepted_by, 40.00, e.started_at
    FROM public.emergency_requests e
    WHERE e.status = 'completed'
      AND e.accepted_by IS NOT NULL
      AND e.started_at IS NOT NULL
      AND e.started_at < v_cutoff
      AND public.sos_call_payable(e.id)
    ON CONFLICT DO NOTHING
    RETURNING source_type, psychologist_user_id, amount
  )
  INSERT INTO _new_payout_items SELECT * FROM inserted;

  -- Pendente sempre a partir do livro (também corrige diferenças antigas).
  FOR r IN
    SELECT DISTINCT psychologist_user_id FROM public.payout_items WHERE paid_at IS NULL AND NOT backfilled
    UNION
    SELECT p.user_id FROM public.psychologist_payments pp JOIN public.psychologists p ON p.id = pp.psychologist_id
    WHERE COALESCE(pp.total_pending_amount, 0) <> 0
  LOOP
    PERFORM public.recompute_psychologist_pending(r.psychologist_user_id);
  END LOOP;

  FOR r IN
    SELECT p.id AS psychologist_id,
           count(*) FILTER (WHERE n.source_type = 'appointment')::int AS scheduled_count,
           count(*) FILTER (WHERE n.source_type = 'sos')::int AS emergency_count,
           sum(n.amount) AS total
    FROM _new_payout_items n
    JOIN public.psychologists p ON p.user_id = n.psychologist_user_id
    GROUP BY p.id
  LOOP
    INSERT INTO public.payment_logs (psychologist_id, admin_id, action, scheduled_count, emergency_count, details)
    VALUES (
      r.psychologist_id,
      '00000000-0000-0000-0000-000000000000',
      'sync_update',
      r.scheduled_count,
      r.emergency_count,
      jsonb_build_object(
        'week_end', v_cutoff,
        'scheduled_amount', r.scheduled_count * 85.00,
        'emergency_amount', r.emergency_count * 40.00,
        'total_amount', r.total
      )
    );
  END LOOP;
END;
$function$;


-- ===========================================================================
-- Plano Grátis
-- ===========================================================================

-- Diário: só leitura (pode apagar). Rotinas e o servidor seguem livres.
CREATE OR REPLACE FUNCTION public.guard_free_plan_journal_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF NOT public.current_user_has_paid_plan() THEN
    RAISE EXCEPTION 'No Plano Grátis o diário é só para leitura. Escolha um plano para escrever.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_free_plan_journal_write() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS a_guard_free_plan_journal_write ON public.private_journals;
CREATE TRIGGER a_guard_free_plan_journal_write
  BEFORE INSERT OR UPDATE ON public.private_journals
  FOR EACH ROW EXECUTE FUNCTION public.guard_free_plan_journal_write();

-- Hábitos: 3 na lista no Plano Grátis, 10 nos planos pagos. Quem já tinha
-- mais (plano que terminou) mantém, mas não adiciona novos.
CREATE OR REPLACE FUNCTION public.enforce_user_habit_limit()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY DEFINER: has_paid_plan não é liberada para o app.
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := CASE WHEN public.has_paid_plan(NEW.user_id) THEN 10 ELSE 3 END;
BEGIN
  IF NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Só conta quando o hábito entra na lista (novo ou volta do arquivo).
  IF TG_OP = 'UPDATE' AND OLD.archived_at IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('user_habits:' || NEW.user_id::text, 0));
  IF (
    SELECT count(*) FROM public.user_habits
    WHERE user_id = NEW.user_id AND archived_at IS NULL AND id <> NEW.id
  ) >= v_limit THEN
    IF v_limit = 3 THEN
      RAISE EXCEPTION 'No Plano Grátis cabem 3 hábitos na lista. Tire um da lista ou escolha um plano para ter até 10.' USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION 'Você já tem 10 hábitos na lista. Tire um da lista para adicionar outro.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- Plano de segurança: 1 no Plano Grátis, 10 nos planos pagos.
CREATE OR REPLACE FUNCTION public.enforce_safety_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY DEFINER: has_paid_plan não é liberada para o app.
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := CASE WHEN public.has_paid_plan(NEW.patient_id) THEN 10 ELSE 1 END;
BEGIN
  IF (SELECT count(*) FROM public.safety_plans WHERE patient_id = NEW.patient_id) >= v_limit THEN
    IF v_limit = 1 THEN
      RAISE EXCEPTION 'No Plano Grátis cabe 1 plano de segurança. Exclua o atual ou escolha um plano para ter até 10.'
        USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION 'Você já tem 10 planos de segurança. Exclua um para criar outro.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_user_habit_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_safety_plan_limit() FROM PUBLIC, anon, authenticated;

-- Chat: no Plano Grátis o paciente só lê. O psicólogo continua respondendo.
CREATE OR REPLACE FUNCTION public.guard_free_plan_chat_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.conversas c WHERE c.id = NEW.conversa_id AND c.paciente_id = NEW.autor_id)
     AND NOT public.has_paid_plan(NEW.autor_id) THEN
    RAISE EXCEPTION 'No Plano Grátis o chat é só para leitura. Escolha um plano para enviar mensagens.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_free_plan_chat_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_guard_free_plan_chat_write ON public.mensagens;
CREATE TRIGGER a_guard_free_plan_chat_write
  BEFORE INSERT ON public.mensagens
  FOR EACH ROW EXECUTE FUNCTION public.guard_free_plan_chat_write();
