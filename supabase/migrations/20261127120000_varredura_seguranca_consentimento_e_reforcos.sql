-- Varredura de segurança de 2026-11-27: consentimento da transcrição, Pix,
-- presença do psicólogo, conquistas, trilha do SOS, motivos de bloqueio e
-- limpeza das regras repetidas do armazenamento.
--
-- O código do autenticador do admin continua como está: exigido só com
-- app_settings.environment = 'production' (no teste, não). No lançamento,
-- mudar o valor para 'production' (docs/pendencias-antes-do-lancamento.md).

-- 1. Consentimento da transcrição só pelo caminho certo ----------------------
-- Antes, o psicólogo da consulta (ou do SOS aceito) gravava
-- transcription_consent_at direto pela API e a transcrição passava a valer
-- sem o paciente ter aceitado. Agora: na consulta, só por
-- give_appointment_transcription_consent (o paciente); no SOS, só pela edge
-- function emergency-sos (no pedido do paciente). Também fica travado o nome
-- do psicólogo gravado na consulta.

CREATE OR REPLACE FUNCTION public.guard_appointment_client_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_duration integer := COALESCE(NEW.duration, 50);
BEGIN
  -- Edge functions (service_role), cron e funções SECURITY DEFINER (dono
  -- postgres) seguem livres; a regra vale só para chamadas diretas do app.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.psychologist_id IS DISTINCT FROM OLD.psychologist_id
     OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     OR NEW.duration IS DISTINCT FROM OLD.duration
     OR NEW.appointment_type IS DISTINCT FROM OLD.appointment_type
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.session_summary IS DISTINCT FROM OLD.session_summary
     OR NEW.proposed_scheduled_at IS DISTINCT FROM OLD.proposed_scheduled_at
     OR NEW.proposal_notes IS DISTINCT FROM OLD.proposal_notes
     OR NEW.video_room_id IS DISTINCT FROM OLD.video_room_id
     OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
     OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
     OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.psychologist_name IS DISTINCT FROM OLD.psychologist_name
     OR NEW.transcription_consent_at IS DISTINCT FROM OLD.transcription_consent_at
     OR NEW.transcription_consent_version IS DISTINCT FROM OLD.transcription_consent_version THEN
    RAISE EXCEPTION 'Alteração não permitida nesta consulta' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Entrar na chamada: só de consulta confirmada e dentro da janela
    -- (10 min antes do início até 15 min depois do fim).
    IF OLD.status IN ('scheduled', 'confirmed') AND NEW.status = 'in_progress' THEN
      IF now() < OLD.scheduled_at - interval '10 minutes'
         OR now() > OLD.scheduled_at + make_interval(mins => v_duration + 15) THEN
        RAISE EXCEPTION 'A sala da consulta ainda não está aberta' USING ERRCODE = '42501';
      END IF;
    -- Encerrar a chamada. Se a outra pessoa nunca entrou, a consulta continua
    -- "em andamento" (ela ainda pode entrar); a rotina fecha depois como
    -- "não realizada" e devolve a consulta do mês ao paciente.
    ELSIF OLD.status = 'in_progress' AND NEW.status = 'completed' THEN
      IF NOT public.appointment_call_connected(OLD.video_room_id) THEN
        NEW.status := OLD.status;
      END IF;
    ELSE
      RAISE EXCEPTION 'Mudança de status não permitida (% → %)', OLD.status, NEW.status USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

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
     OR NEW.channel IS DISTINCT FROM OLD.channel
     -- O consentimento da transcrição vem só do pedido do paciente (emergency-sos).
     OR NEW.transcription_consent_at IS DISTINCT FROM OLD.transcription_consent_at
     OR NEW.transcription_consent_version IS DISTINCT FROM OLD.transcription_consent_version THEN
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

-- 2. Aviso quando a chave Pix muda ---------------------------------------------
-- Quem tomar a conta de um psicólogo poderia trocar o Pix e desviar o repasse
-- sem que ninguém percebesse. Agora toda troca vira aviso no app do próprio
-- psicólogo (com push) e entra no registro de segurança que o admin consulta.

CREATE OR REPLACE FUNCTION public.notify_psychologist_pix_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.pix_key IS NOT DISTINCT FROM OLD.pix_key AND NEW.pix_type IS NOT DISTINCT FROM OLD.pix_type THEN
    RETURN NEW;
  END IF;
  -- Primeiro cadastro da chave não é troca.
  IF OLD.pix_key IS NULL OR btrim(OLD.pix_key) = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.security_audit_log (user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    auth.uid(), 'pix_key_changed', 'psychologists', NEW.id,
    jsonb_build_object('pix_type', OLD.pix_type, 'pix_key_end', right(OLD.pix_key, 4)),
    jsonb_build_object('pix_type', NEW.pix_type, 'pix_key_end', right(COALESCE(NEW.pix_key, ''), 4))
  );

  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (patient_id, title, message, status, push, link)
    VALUES (
      NEW.user_id,
      'Sua chave Pix foi alterada',
      'A chave Pix dos seus repasses foi alterada agora. Se não foi você, troque sua senha e fale com o suporte do Soliv.',
      'unread', true, '/psychologist-payments'
    );
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_psychologist_pix_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_psychologist_pix_change ON public.psychologists;
CREATE TRIGGER notify_psychologist_pix_change
  AFTER UPDATE OF pix_key, pix_type ON public.psychologists
  FOR EACH ROW EXECUTE FUNCTION public.notify_psychologist_pix_change();

-- 3. Motivos de bloqueio e recusa não ficam visíveis a todos -------------------
-- psychologists é legível por qualquer conta (perfil público do psicólogo
-- aprovado), e isso incluía o motivo que o admin escreveu ao bloquear ou
-- recusar. O próprio psicólogo lê os dele por get_login_state(); o admin,
-- pelas edge functions (service role).
REVOKE SELECT (blocked_reason, rejection_reason) ON public.psychologists FROM anon, authenticated;

-- 4. Contadores e SOS atual do psicólogo só pelo servidor ----------------------
-- O app grava só o "estou online" (last_online). Contadores de aceite/recusa
-- e o SOS em andamento vêm das funções do banco (increment_emergency_*,
-- gatilhos), que rodam como dono e não passam por esta regra.

CREATE OR REPLACE FUNCTION public.guard_psychologist_presence_client_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.emergency_accepted_count := 0;
    NEW.emergency_rejected_count := 0;
    NEW.current_emergency_id := NULL;
    RETURN NEW;
  END IF;
  NEW.psychologist_id := OLD.psychologist_id;
  NEW.emergency_accepted_count := OLD.emergency_accepted_count;
  NEW.emergency_rejected_count := OLD.emergency_rejected_count;
  NEW.current_emergency_id := OLD.current_emergency_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_psychologist_presence_client_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_guard_psychologist_presence_client_write ON public.psychologist_presence;
CREATE TRIGGER a_guard_psychologist_presence_client_write
  BEFORE INSERT OR UPDATE ON public.psychologist_presence
  FOR EACH ROW EXECUTE FUNCTION public.guard_psychologist_presence_client_write();

-- 5. Conquistas: o app só marca as que já existem ------------------------------
-- As conquistas nascem por initialize_patient_achievements (SECURITY
-- DEFINER). Pelo app, o paciente só marca "conquistada"; título, texto e
-- ícone não mudam e não dá para inventar conquista nova.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT polname FROM pg_policy
           WHERE polrelid = 'public.patient_achievements'::regclass AND polcmd = 'a'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.patient_achievements', r.polname);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.guard_patient_achievement_client_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.user_id := OLD.user_id;
  NEW.title := OLD.title;
  NEW.description := OLD.description;
  NEW.icon := OLD.icon;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_patient_achievement_client_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_guard_patient_achievement_client_update ON public.patient_achievements;
CREATE TRIGGER a_guard_patient_achievement_client_update
  BEFORE UPDATE ON public.patient_achievements
  FOR EACH ROW EXECUTE FUNCTION public.guard_patient_achievement_client_update();

-- 6. Trilha do SOS: psicólogo fora do chamado só registra na fila -------------
-- Antes, qualquer psicólogo aprovado gravava eventos em qualquer SOS
-- (inclusive de outro colega ou já encerrado). Agora, fora dos participantes,
-- só em chamado ainda livre na fila (ver, recusar).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT polname FROM pg_policy
           WHERE polrelid = 'public.sos_trace_events'::regclass AND polcmd = 'a'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.sos_trace_events', r.polname);
  END LOOP;
END $$;

CREATE POLICY "Participantes registram eventos do SOS"
  ON public.sos_trace_events FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = (SELECT auth.uid())
    AND (
      emergency_request_id IS NULL
      OR public.is_sos_participant(emergency_request_id)
      OR (
        public.psychologist_can_attend((SELECT auth.uid()))
        AND EXISTS (
          SELECT 1 FROM public.emergency_requests er
          WHERE er.id = sos_trace_events.emergency_request_id
            AND er.status = 'pending'
            AND er.accepted_by IS NULL
        )
      )
    )
  );

-- 7. Armazenamento: uma regra por ação no bucket dos documentos do psicólogo --
-- Havia regras repetidas, algumas abertas a "public" (visitante). Todas
-- conferiam o mesmo (dono pela pasta ou admin), então o acesso não muda; só
-- fica uma regra de cada, para o login.
DROP POLICY IF EXISTS "Allow admins to view all psychologist documents" ON storage.objects;
DROP POLICY IF EXISTS "Enable psychologist document access" ON storage.objects;
DROP POLICY IF EXISTS "Read access to psychologist documents" ON storage.objects;
DROP POLICY IF EXISTS "Super admins can view psychologist documents" ON storage.objects;
DROP POLICY IF EXISTS "Enable psychologist document uploads during registration" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to psychologist documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Super admins can manage all psychologist documents" ON storage.objects;

DROP POLICY IF EXISTS "Admins gerenciam documentos de psicólogos" ON storage.objects;
CREATE POLICY "Admins gerenciam documentos de psicólogos"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'psychologist-documents' AND public.is_super_admin())
  WITH CHECK (bucket_id = 'psychologist-documents' AND public.is_super_admin());
