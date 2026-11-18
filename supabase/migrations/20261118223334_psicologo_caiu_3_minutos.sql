-- Psicólogo caiu e não voltou em 3 minutos (SOS por vídeo e consulta agendada).
--
-- Regra de produto (novembro de 2026): se a chamada já tinha conectado e o
-- psicólogo some (sem sinal de presença) por 3 minutos enquanto o paciente
-- continua na sala, o psicólogo perde a chamada:
--   * a chamada é encerrada pelo sistema (o psicólogo não consegue reconectar);
--   * não entra no repasse dele;
--   * o paciente recebe de volta, na hora, o SOS ou a consulta (do mês ou avulso).
--
-- Quem dispara: a rotina de minuto em minuto e o próprio app do paciente, que
-- pede a verificação assim que os 3 minutos passam (as condições são sempre
-- conferidas aqui no banco).

-- ============================================================================
-- 1. Devolução do SOS: o novo motivo também devolve o SOS ao paciente.
-- ============================================================================
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
        -- Psicólogo sumiu (ou caiu e não voltou), os dois perderam o sinal ou a
       -- conexão não se manteve: devolve mesmo que a chamada tenha conectado.
       NEW.end_reason IN ('abandoned', 'psychologist_unavailable', 'connection_failure', 'psychologist_dropped')
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

-- ============================================================================
-- 2. Verifica e encerra uma sala (uso interno).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.forfeit_call_if_psychologist_dropped(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_absence constant interval := interval '3 minutes';
  -- O paciente precisa estar na sala (o app grava presença a cada 15 s).
  v_patient_fresh constant interval := interval '60 seconds';
  s public.webrtc_sessions%ROWTYPE;
  er public.emergency_requests%ROWTYPE;
  a public.appointments%ROWTYPE;
  v_psychologist uuid;
  v_patient uuid;
  v_psy_seen timestamptz;
  v_patient_seen timestamptz;
  v_refunded boolean;
BEGIN
  SELECT * INTO s FROM public.webrtc_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR s.status = 'completed' OR s.connected_at IS NULL THEN
    RETURN NULL;
  END IF;

  IF s.emergency_request_id IS NOT NULL THEN
    SELECT * INTO er FROM public.emergency_requests WHERE id = s.emergency_request_id FOR UPDATE;
    IF NOT FOUND OR er.status NOT IN ('accepted', 'in_progress') OR er.accepted_by IS NULL THEN
      RETURN NULL;
    END IF;
    v_psychologist := er.accepted_by;
    v_patient := er.patient_id;
  ELSE
    SELECT * INTO a FROM public.appointments WHERE video_room_id = s.id::text FOR UPDATE;
    IF NOT FOUND OR a.status NOT IN ('scheduled', 'confirmed', 'in_progress') THEN
      RETURN NULL;
    END IF;
    -- Consulta que já cumpriu o tempo todo: não é queda, é fim.
    IF s.media_seconds >= COALESCE(a.duration, 50) * 60 THEN
      RETURN NULL;
    END IF;
    v_psychologist := a.psychologist_id;
    v_patient := a.patient_id;
  END IF;

  SELECT max(pp.last_seen) INTO v_psy_seen
  FROM public.participant_presence pp
  WHERE pp.session_id = s.id AND pp.user_id = v_psychologist;

  SELECT max(pp.last_seen) INTO v_patient_seen
  FROM public.participant_presence pp
  WHERE pp.session_id = s.id AND pp.user_id = v_patient;

  IF v_psy_seen IS NULL OR v_psy_seen > now() - v_absence
     OR v_patient_seen IS NULL OR v_patient_seen < now() - v_patient_fresh THEN
    RETURN NULL;
  END IF;

  -- Fecha a sala primeiro: o psicólogo não consegue mais reabrir.
  UPDATE public.webrtc_sessions
  SET status = 'completed',
      ended_at = COALESCE(ended_at, now()),
      ended_by = NULL,
      ended_by_type = 'system',
      end_reason = 'psychologist_dropped',
      updated_at = now()
  WHERE id = s.id;

  IF s.emergency_request_id IS NOT NULL THEN
    -- Cancelado: fora do repasse. O gatilho de devolução devolve o SOS.
    UPDATE public.emergency_requests
    SET status = 'cancelled',
        ended_at = now(),
        ended_by = NULL,
        ended_by_type = 'system',
        end_reason = 'psychologist_dropped',
        duration = CASE WHEN started_at IS NOT NULL
                        THEN GREATEST(0, EXTRACT(EPOCH FROM (now() - started_at))::integer) END,
        updated_at = now()
    WHERE id = er.id;

    INSERT INTO public.sos_trace_events (trace_id, emergency_request_id, event_type, actor_type, message)
    VALUES ('req:' || er.id::text, er.id, 'call_finalized_by_system', 'system', 'psychologist_dropped');

    INSERT INTO public.notifications (patient_id, title, message, status, push, link)
    VALUES
      (v_patient,
       'Seu SOS foi devolvido',
       'O psicólogo perdeu a conexão e não voltou em 3 minutos. O atendimento foi encerrado e o SOS voltou para você: você pode pedir ajuda de novo agora.',
       'unread', true, '/sos'),
      (v_psychologist,
       'Você perdeu o atendimento de SOS',
       'Sua conexão ficou fora por mais de 3 minutos e o atendimento foi encerrado. Ele não entra no seu repasse e o SOS foi devolvido ao paciente.',
       'unread', true, '/psychologist-dashboard');

    RETURN 'sos';
  END IF;

  -- Já entrou no repasse e ainda não foi pago? Sai.
  IF EXISTS (SELECT 1 FROM public.payout_items WHERE source_type = 'appointment' AND source_id = a.id AND paid_at IS NULL) THEN
    DELETE FROM public.payout_items WHERE source_type = 'appointment' AND source_id = a.id AND paid_at IS NULL;
    PERFORM public.recompute_psychologist_pending(a.psychologist_id);
  END IF;

  UPDATE public.appointments
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = NULL,
      cancellation_reason = 'Interrompida: o psicólogo perdeu a conexão e não voltou em 3 minutos'
  WHERE id = a.id;

  v_refunded := false;
  IF a.appointment_type = 'regular' THEN
    v_refunded := public.release_appointment_quota(a.id);
  END IF;

  INSERT INTO public.notifications (patient_id, appointment_id, title, message, status, push, link)
  VALUES
    (v_patient, a.id,
     'Sua consulta foi devolvida',
     'O psicólogo perdeu a conexão na consulta de ' || public.format_br_datetime(a.scheduled_at)
       || ' e não voltou em 3 minutos. A consulta foi encerrada'
       || CASE WHEN a.appointment_type = 'regular' THEN ' e voltou para você: você pode agendar outro horário.' ELSE '.' END,
     'unread', true, '/appointments'),
    (v_psychologist, a.id,
     'Você perdeu a consulta',
     'Sua conexão ficou fora por mais de 3 minutos na consulta de ' || public.format_br_datetime(a.scheduled_at)
       || '. A consulta foi encerrada, não entra no seu repasse e foi devolvida ao paciente.',
     'unread', true, '/psicologo/consultas');

  RETURN 'appointment';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.forfeit_call_if_psychologist_dropped(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. Pedido do app do paciente (na hora em que os 3 minutos passam).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_psychologist_dropped(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.webrtc_sessions s
    WHERE s.id = p_session_id
      AND (
        s.patient_id = v_uid
        OR EXISTS (SELECT 1 FROM public.emergency_requests er WHERE er.id = s.emergency_request_id AND er.patient_id = v_uid)
        OR EXISTS (SELECT 1 FROM public.appointments ap WHERE ap.video_room_id = s.id::text AND ap.patient_id = v_uid)
      )
  ) THEN
    RAISE EXCEPTION 'Sala não encontrada' USING ERRCODE = '42501';
  END IF;

  v_kind := public.forfeit_call_if_psychologist_dropped(p_session_id);
  RETURN jsonb_build_object('forfeited', v_kind IS NOT NULL, 'kind', v_kind);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_psychologist_dropped(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_psychologist_dropped(uuid) TO authenticated;

-- ============================================================================
-- 4. Rotina de minuto em minuto (vale mesmo com o app do paciente fechado
--    por alguns segundos: ele precisa ter sinal no último minuto).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.forfeit_dropped_psychologist_calls()
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
    SELECT s.id
    FROM public.webrtc_sessions s
    WHERE s.status <> 'completed'
      AND s.connected_at IS NOT NULL
      AND s.connected_at > now() - interval '6 hours'
  LOOP
    IF public.forfeit_call_if_psychologist_dropped(r.id) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.forfeit_dropped_psychologist_calls() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('forfeit-dropped-psychologist-calls')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'forfeit-dropped-psychologist-calls');

SELECT cron.schedule(
  'forfeit-dropped-psychologist-calls',
  '* * * * *',
  $cron$SELECT public.forfeit_dropped_psychologist_calls();$cron$
);
