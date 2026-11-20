-- Transcrição das chamadas de vídeo (SOS e consulta agendada).
--
-- O paciente consente antes de entrar: no SOS, na tela de confirmação (só no
-- SOS por vídeo; o SOS por mensagem já é texto); na consulta, numa tela antes
-- de abrir a sala. O consentimento fica gravado no próprio atendimento, com a
-- versão do texto aceito. Sem ele, nada é transcrito (a edge function
-- `transcribe-call-chunk` confere aqui antes de aceitar qualquer áudio).
--
-- O áudio nunca é guardado: cada lado envia trechos do próprio microfone, a
-- função transcreve e grava só o texto em `call_transcript_segments`.

ALTER TABLE public.emergency_requests
  ADD COLUMN IF NOT EXISTS transcription_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS transcription_consent_version text;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS transcription_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS transcription_consent_version text;

CREATE TABLE IF NOT EXISTS public.call_transcript_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webrtc_session_id uuid NOT NULL REFERENCES public.webrtc_sessions(id) ON DELETE CASCADE,
  speaker_id uuid NOT NULL,
  speaker_role text NOT NULL CHECK (speaker_role IN ('patient', 'psychologist')),
  started_at timestamptz NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms > 0),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Reenvio do mesmo trecho (rede caiu na resposta) não duplica o texto: o
  -- trecho é identificado pelo horário em que começou.
  UNIQUE (webrtc_session_id, speaker_role, started_at)
);

CREATE INDEX IF NOT EXISTS call_transcript_segments_session_idx
  ON public.call_transcript_segments (webrtc_session_id, started_at);

-- Sem políticas: só as edge functions (service role) gravam, e a leitura passa
-- pela RPC abaixo, que confere quem pede.
ALTER TABLE public.call_transcript_segments ENABLE ROW LEVEL SECURITY;

-- Consulta: o paciente consente antes de abrir a sala.
CREATE OR REPLACE FUNCTION public.give_appointment_transcription_consent(p_appointment_id uuid, p_version text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_at timestamptz;
BEGIN
  IF p_version IS NULL OR length(p_version) = 0 OR length(p_version) > 20 THEN
    RAISE EXCEPTION 'Versão do consentimento inválida';
  END IF;

  UPDATE public.appointments
  SET transcription_consent_at = COALESCE(transcription_consent_at, now()),
      transcription_consent_version = COALESCE(transcription_consent_version, p_version)
  WHERE id = p_appointment_id
    AND patient_id = auth.uid()
    AND status IN ('scheduled', 'confirmed', 'in_progress')
  RETURNING transcription_consent_at INTO v_at;

  IF v_at IS NULL THEN
    RAISE EXCEPTION 'Consulta não encontrada';
  END IF;
  RETURN v_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.give_appointment_transcription_consent(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.give_appointment_transcription_consent(uuid, text) TO authenticated;

-- A sala sabe se a transcrição está ligada (para os dois lados enviarem o
-- áudio e mostrarem o aviso). Só participantes da sala.
CREATE OR REPLACE FUNCTION public.get_call_transcription_status(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session record;
  v_consent timestamptz;
BEGIN
  SELECT id, patient_id, psychologist_id, emergency_request_id
  INTO v_session
  FROM public.webrtc_sessions
  WHERE id = p_session_id;

  IF NOT FOUND OR auth.uid() IS NULL OR auth.uid() NOT IN (v_session.patient_id, v_session.psychologist_id) THEN
    RETURN false;
  END IF;

  IF v_session.emergency_request_id IS NOT NULL THEN
    SELECT er.transcription_consent_at INTO v_consent
    FROM public.emergency_requests er
    WHERE er.id = v_session.emergency_request_id;
  ELSE
    SELECT a.transcription_consent_at INTO v_consent
    FROM public.appointments a
    WHERE a.video_room_id = p_session_id::text
    LIMIT 1;
  END IF;

  RETURN v_consent IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_call_transcription_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_call_transcription_status(uuid) TO authenticated;

-- Transcrição de um atendimento, para o psicólogo que atendeu ou o paciente.
-- Admin não lê (mesma regra do plano de segurança).
CREATE OR REPLACE FUNCTION public.get_call_transcript(p_appointment_id uuid DEFAULT NULL, p_emergency_request_id uuid DEFAULT NULL)
RETURNS TABLE (speaker_role text, started_at timestamptz, content text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_patient uuid;
  v_psychologist uuid;
  v_session_ids uuid[];
BEGIN
  IF (p_appointment_id IS NULL) = (p_emergency_request_id IS NULL) THEN
    RAISE EXCEPTION 'Informe a consulta ou o SOS';
  END IF;

  IF p_appointment_id IS NOT NULL THEN
    SELECT a.patient_id, a.psychologist_id,
           CASE WHEN a.video_room_id ~ '^[0-9a-f-]{36}$' THEN ARRAY[a.video_room_id::uuid] ELSE ARRAY[]::uuid[] END
    INTO v_patient, v_psychologist, v_session_ids
    FROM public.appointments a
    WHERE a.id = p_appointment_id;
  ELSE
    SELECT er.patient_id, er.accepted_by INTO v_patient, v_psychologist
    FROM public.emergency_requests er
    WHERE er.id = p_emergency_request_id;
    -- Uma sala por pedido de SOS; o psicólogo da sala também pode ler.
    SELECT COALESCE(array_agg(ws.id), ARRAY[]::uuid[]) INTO v_session_ids
    FROM public.webrtc_sessions ws
    WHERE ws.emergency_request_id = p_emergency_request_id
      AND (auth.uid() = v_patient OR ws.psychologist_id = auth.uid());
  END IF;

  IF auth.uid() IS NULL OR v_patient IS NULL THEN
    RAISE EXCEPTION 'Atendimento não encontrado';
  END IF;

  IF auth.uid() <> v_patient AND auth.uid() IS DISTINCT FROM v_psychologist
     AND NOT EXISTS (
       SELECT 1 FROM public.webrtc_sessions ws
       WHERE ws.id = ANY (v_session_ids) AND ws.psychologist_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT s.speaker_role, s.started_at, s.content
  FROM public.call_transcript_segments s
  WHERE s.webrtc_session_id = ANY (v_session_ids)
  ORDER BY s.started_at, s.speaker_role;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_call_transcript(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_call_transcript(uuid, uuid) TO authenticated;

-- "Excluir minha conta": a transcrição vai para o arquivo dos registros de
-- atendimento junto com o SOS e a consulta (retida por 5 anos, sem login).
ALTER TABLE public.care_record_archive DROP CONSTRAINT IF EXISTS care_record_archive_record_type_check;
ALTER TABLE public.care_record_archive
  ADD CONSTRAINT care_record_archive_record_type_check
  CHECK (record_type IN ('sos', 'consultation', 'feedback', 'transcript'));

CREATE OR REPLACE FUNCTION public.archive_patient_care_records(p_patient_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
  v_email text;
  v_count integer := 0;
  v_rows integer;
BEGIN
  SELECT p.full_name INTO v_name FROM public.profiles p WHERE p.user_id = p_patient_id LIMIT 1;
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_patient_id;

  INSERT INTO public.care_record_archive
    (record_type, source_id, former_patient_id, patient_name, patient_email, psychologist_id, occurred_at, data, retain_until)
  SELECT 'sos', er.id, p_patient_id, v_name, v_email, er.accepted_by, er.created_at, to_jsonb(er),
         er.created_at + interval '5 years'
  FROM public.emergency_requests er
  WHERE er.patient_id = p_patient_id
  ON CONFLICT (record_type, source_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_count := v_count + v_rows;

  INSERT INTO public.care_record_archive
    (record_type, source_id, former_patient_id, patient_name, patient_email, psychologist_id, occurred_at, data, retain_until)
  SELECT 'consultation', a.id, p_patient_id, v_name, v_email, a.psychologist_id, a.scheduled_at, to_jsonb(a),
         a.scheduled_at + interval '5 years'
  FROM public.appointments a
  WHERE a.patient_id = p_patient_id
  ON CONFLICT (record_type, source_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_count := v_count + v_rows;

  -- Avaliações e anotações clínicas dos atendimentos desse paciente, inclusive
  -- as registradas pelo psicólogo.
  INSERT INTO public.care_record_archive
    (record_type, source_id, former_patient_id, patient_name, patient_email, psychologist_id, occurred_at, data, retain_until)
  SELECT 'feedback', sf.id, p_patient_id, v_name, v_email, sf.psychologist_id,
         COALESCE(sf.created_at, now()), to_jsonb(sf),
         COALESCE(sf.created_at, now()) + interval '5 years'
  FROM public.session_feedback sf
  WHERE sf.user_id = p_patient_id
     OR sf.emergency_request_id IN (SELECT er.id FROM public.emergency_requests er WHERE er.patient_id = p_patient_id)
  ON CONFLICT (record_type, source_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_count := v_count + v_rows;

  -- Transcrições: uma linha por sala, com as falas em ordem.
  INSERT INTO public.care_record_archive
    (record_type, source_id, former_patient_id, patient_name, patient_email, psychologist_id, occurred_at, data, retain_until)
  SELECT 'transcript', ws.id, p_patient_id, v_name, v_email, ws.psychologist_id, ws.created_at,
         jsonb_build_object(
           'webrtc_session_id', ws.id,
           'emergency_request_id', ws.emergency_request_id,
           'segments', (
             SELECT jsonb_agg(jsonb_build_object('speaker_role', s.speaker_role, 'started_at', s.started_at, 'content', s.content)
                              ORDER BY s.started_at)
             FROM public.call_transcript_segments s
             WHERE s.webrtc_session_id = ws.id
           )
         ),
         ws.created_at + interval '5 years'
  FROM public.webrtc_sessions ws
  WHERE ws.patient_id = p_patient_id
    AND EXISTS (SELECT 1 FROM public.call_transcript_segments s WHERE s.webrtc_session_id = ws.id)
  ON CONFLICT (record_type, source_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_count := v_count + v_rows;

  RETURN v_count;
END;
$function$;
