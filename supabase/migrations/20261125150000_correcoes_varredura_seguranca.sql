-- Correções da varredura de segurança (2026-11-25)
--
-- 1. Verificação em duas etapas do admin sempre exigida. Antes ela seguia o
--    código de convite do cadastro: com o convite ligado (como estava em
--    produção), o admin entrava só com a senha e, com ela, lia transcrições,
--    planos de segurança e documentos, confirmava repasses e apagava contas.
-- 2. O paciente não consegue mais "devolver" a própria cota de SOS depois de
--    uma chamada que aconteceu: o motivo de encerramento vinha do app e
--    'connection_failure'/'abandoned' devolviam a cota mesmo com a chamada
--    paga ao psicólogo (SOS ilimitado; o avulso podia ser reusado sem fim).
-- 3. O paciente não marca o próprio SOS como aceito (só o psicólogo aceita).
-- 4. is_super_admin(<outra pessoa>) não diz mais a qualquer conta quem é admin.
-- 5. Rastro do SOS (sos_trace_events): só grava evento de atendimento do qual
--    a pessoa participa (ou, para psicólogo habilitado, da fila).

-- 1 ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_mfa_required()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT true;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_mfa_required() TO anon, authenticated, service_role;

-- 4 ---------------------------------------------------------------------------
-- Funções do servidor (sem login: service role, rotinas) continuam podendo
-- perguntar por qualquer conta. Uma conta logada só pergunta por si mesma, ou
-- por outra se ela própria for admin com o código de verificação.
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id_param uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE user_id = user_id_param
        AND is_active = true
    ),
    false
  )
  AND (
    auth.uid() IS NULL
    OR (
      user_id_param = auth.uid()
      AND (COALESCE(auth.jwt() ->> 'aal', '') = 'aal2' OR NOT public.admin_mfa_required())
    )
    OR (
      user_id_param IS DISTINCT FROM auth.uid()
      AND public.is_super_admin(auth.uid())
    )
  );
$function$;

-- 2 e 3 -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_emergency_request_client_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Edge functions, cron e funções do banco seguem livres.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.time_limit_seconds IS DISTINCT FROM OLD.time_limit_seconds
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.video_room_id IS DISTINCT FROM OLD.video_room_id
     OR NEW.channel IS DISTINCT FROM OLD.channel THEN
    RAISE EXCEPTION 'Alteração não permitida neste atendimento' USING ERRCODE = '42501';
  END IF;

  -- Psicólogo só pode assumir um chamado livre para si mesmo.
  IF NEW.accepted_by IS DISTINCT FROM OLD.accepted_by
     AND NOT (OLD.accepted_by IS NULL AND NEW.accepted_by = auth.uid()) THEN
    RAISE EXCEPTION 'Alteração não permitida neste atendimento' USING ERRCODE = '42501';
  END IF;

  -- Aceitar é do psicólogo que assume o chamado, nunca do paciente.
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted'
     AND NEW.accepted_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Alteração não permitida neste atendimento' USING ERRCODE = '42501';
  END IF;

  -- O início da chamada não pode ser apagado nem trocado.
  IF OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'Alteração não permitida neste atendimento' USING ERRCODE = '42501';
  END IF;

  -- Por mensagem, o início é a 1ª resposta do psicólogo (send_sos_message).
  IF OLD.channel = 'text' AND NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'Alteração não permitida neste atendimento' USING ERRCODE = '42501';
  END IF;

  -- "Psicólogo caiu" e "psicólogo indisponível" só o banco decide
  -- (claim_psychologist_dropped, rotinas): devolvem o SOS ao paciente.
  IF NEW.end_reason IS DISTINCT FROM OLD.end_reason
     AND NEW.end_reason IN ('psychologist_dropped', 'psychologist_unavailable') THEN
    RAISE EXCEPTION 'Alteração não permitida neste atendimento' USING ERRCODE = '42501';
  END IF;

  -- Chamado encerrado não volta a ficar ativo.
  IF OLD.status IN ('completed', 'cancelled', 'expired', 'abandoned')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Este atendimento já foi encerrado' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- Devolve o SOS quando o atendimento não aconteceu de fato. O motivo escrito
-- pelo app ('abandoned', 'connection_failure') só devolve se a chamada também
-- não conta para o repasse do psicólogo: antes devolvia sempre, e o mesmo SOS
-- era pago ao psicólogo e devolvido ao paciente.
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
       -- Decididos só pelo banco (o psicólogo sumiu ou caiu e não voltou).
       NEW.end_reason IN ('psychologist_unavailable', 'psychologist_dropped')
       -- Os dois lados não chegaram a se ver/ouvir.
       OR NOT public.sos_call_connected(NEW.id)
       -- Conexão que não se manteve e não chegou a contar para o repasse.
       OR (NEW.end_reason IN ('abandoned', 'connection_failure') AND NOT public.sos_call_payable(NEW.id))
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

-- 5 ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can log their own trace events" ON public.sos_trace_events;
CREATE POLICY "Authenticated users can log their own trace events"
  ON public.sos_trace_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = (SELECT auth.uid())
    AND (
      emergency_request_id IS NULL
      OR public.is_sos_participant(emergency_request_id)
      OR public.psychologist_can_attend((SELECT auth.uid()))
    )
  );
