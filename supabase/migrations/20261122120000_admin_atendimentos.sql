-- Painel do admin: consultas agendadas e SOS, com detalhes de cada atendimento.
--
-- O admin passa a ver, para cada consulta ou SOS: psicólogo, paciente, horários
-- e duração, as avaliações dos dois lados, e — num clique a mais — o plano de
-- segurança do paciente e a transcrição da chamada. Antes o admin nunca lia o
-- plano nem a transcrição; agora lê, e CADA leitura de detalhe, plano ou
-- transcrição fica na Auditoria (admin_audit_log), com o atendimento.
--
-- Tudo passa por funções SECURITY DEFINER que conferem is_super_admin(): as
-- tabelas continuam com as mesmas regras de acesso de antes.

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_target_type_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_target_type_check
  CHECK (target_type = ANY (ARRAY['patient', 'psychologist', 'group_testimonial', 'testimonial_report', 'organization',
                                  'organization_member', 'access_log', 'appointment', 'emergency_request']));

CREATE INDEX IF NOT EXISTS appointments_psychologist_scheduled_idx ON public.appointments (psychologist_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS appointments_patient_scheduled_idx ON public.appointments (patient_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS emergency_requests_accepted_by_created_idx ON public.emergency_requests (accepted_by, created_at DESC);
CREATE INDEX IF NOT EXISTS emergency_requests_patient_created_idx ON public.emergency_requests (patient_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 1) Listas (sem conteúdo clínico: só quem, quando, status e notas)
-- ---------------------------------------------------------------------------

-- Consultas agendadas, mais recentes primeiro. Filtros opcionais por
-- psicólogo e/ou paciente (ids de usuário).
CREATE OR REPLACE FUNCTION public.admin_list_appointments(
  p_psychologist_id uuid DEFAULT NULL,
  p_patient_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total integer;
  v_rows jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas administradores.';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.appointments a
  WHERE (p_psychologist_id IS NULL OR a.psychologist_id = p_psychologist_id)
    AND (p_patient_id IS NULL OR a.patient_id = p_patient_id);

  SELECT COALESCE(jsonb_agg(r ORDER BY r.scheduled_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT a.id,
           a.scheduled_at,
           a.status,
           a.duration AS planned_minutes,
           a.psychologist_id,
           COALESCE(ps.full_name, a.psychologist_name, 'Psicólogo') AS psychologist_name,
           a.patient_id,
           COALESCE(pa.full_name, 'Paciente') AS patient_name,
           ws.media_seconds AS call_seconds,
           (a.transcription_consent_at IS NOT NULL) AS transcription_consent,
           EXISTS (SELECT 1 FROM public.call_transcript_segments s WHERE s.webrtc_session_id = ws.id) AS has_transcript,
           (SELECT f.rating FROM public.session_feedback f
             WHERE f.appointment_id = a.id AND f.user_type = 'patient' ORDER BY f.created_at DESC LIMIT 1) AS patient_rating,
           (SELECT f.rating FROM public.session_feedback f
             WHERE f.appointment_id = a.id AND f.user_type = 'psychologist' ORDER BY f.created_at DESC LIMIT 1) AS psychologist_rating
    FROM public.appointments a
    LEFT JOIN public.psychologists ps ON ps.user_id = a.psychologist_id
    LEFT JOIN public.patients pa ON pa.user_id = a.patient_id
    LEFT JOIN public.webrtc_sessions ws ON a.video_room_id ~ '^[0-9a-f-]{36}$' AND ws.id = a.video_room_id::uuid
    WHERE (p_psychologist_id IS NULL OR a.psychologist_id = p_psychologist_id)
      AND (p_patient_id IS NULL OR a.patient_id = p_patient_id)
    ORDER BY a.scheduled_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0)
  ) r;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$function$;

-- SOS, mais recentes primeiro. Filtros opcionais por psicólogo que atendeu
-- e/ou paciente.
CREATE OR REPLACE FUNCTION public.admin_list_sos(
  p_psychologist_id uuid DEFAULT NULL,
  p_patient_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total integer;
  v_rows jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas administradores.';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.emergency_requests er
  WHERE (p_psychologist_id IS NULL OR er.accepted_by = p_psychologist_id)
    AND (p_patient_id IS NULL OR er.patient_id = p_patient_id);

  SELECT COALESCE(jsonb_agg(r ORDER BY r.created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT er.id,
           er.created_at,
           er.accepted_at,
           er.ended_at,
           er.status,
           er.channel,
           er.duration,
           er.end_reason,
           er.ended_by_type,
           er.crisis_resolved,
           er.accepted_by AS psychologist_id,
           ps.full_name AS psychologist_name,
           er.patient_id,
           COALESCE(pa.full_name, er.patient_details->>'full_name', er.patient_details->>'name', 'Paciente') AS patient_name,
           (er.transcription_consent_at IS NOT NULL) AS transcription_consent,
           EXISTS (
             SELECT 1 FROM public.call_transcript_segments s
             JOIN public.webrtc_sessions ws ON ws.id = s.webrtc_session_id
             WHERE ws.emergency_request_id = er.id
           ) AS has_transcript,
           (SELECT f.rating FROM public.session_feedback f
             WHERE f.emergency_request_id = er.id AND f.user_type = 'patient' ORDER BY f.created_at DESC LIMIT 1) AS patient_rating,
           (SELECT f.rating FROM public.session_feedback f
             WHERE f.emergency_request_id = er.id AND f.user_type = 'psychologist' ORDER BY f.created_at DESC LIMIT 1) AS psychologist_rating
    FROM public.emergency_requests er
    LEFT JOIN public.psychologists ps ON ps.user_id = er.accepted_by
    LEFT JOIN public.patients pa ON pa.user_id = er.patient_id
    WHERE (p_psychologist_id IS NULL OR er.accepted_by = p_psychologist_id)
      AND (p_patient_id IS NULL OR er.patient_id = p_patient_id)
    ORDER BY er.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0)
  ) r;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$function$;

-- Psicólogos ou pacientes que têm consultas (ou SOS), com quantos e o último.
-- p_role: 'psychologist' | 'patient'; p_kind: 'appointment' | 'sos'.
CREATE OR REPLACE FUNCTION public.admin_list_care_people(
  p_role text,
  p_kind text,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_total integer;
  v_rows jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas administradores.';
  END IF;
  IF p_role NOT IN ('psychologist', 'patient') OR p_kind NOT IN ('appointment', 'sos') THEN
    RAISE EXCEPTION 'Filtro inválido.';
  END IF;

  WITH care AS (
    SELECT CASE WHEN p_role = 'psychologist' THEN a.psychologist_id ELSE a.patient_id END AS user_id,
           a.scheduled_at AS at
    FROM public.appointments a
    WHERE p_kind = 'appointment'
    UNION ALL
    SELECT CASE WHEN p_role = 'psychologist' THEN er.accepted_by ELSE er.patient_id END,
           er.created_at
    FROM public.emergency_requests er
    WHERE p_kind = 'sos'
  ),
  grouped AS (
    SELECT c.user_id, count(*) AS care_count, max(c.at) AS last_at
    FROM care c
    WHERE c.user_id IS NOT NULL
    GROUP BY c.user_id
  ),
  people AS (
    SELECT g.user_id,
           COALESCE(CASE WHEN p_role = 'psychologist' THEN ps.full_name ELSE pa.full_name END,
                    CASE WHEN p_role = 'psychologist' THEN 'Psicólogo' ELSE 'Paciente' END) AS full_name,
           CASE WHEN p_role = 'psychologist' THEN ps.email ELSE pa.email END AS email,
           g.care_count,
           g.last_at
    FROM grouped g
    LEFT JOIN public.psychologists ps ON p_role = 'psychologist' AND ps.user_id = g.user_id
    LEFT JOIN public.patients pa ON p_role = 'patient' AND pa.user_id = g.user_id
  ),
  filtered AS (
    SELECT * FROM people p
    WHERE v_search IS NULL
       OR p.full_name ILIKE '%' || v_search || '%'
       OR p.email ILIKE '%' || v_search || '%'
  )
  SELECT (SELECT count(*) FROM filtered),
         COALESCE((
           SELECT jsonb_agg(to_jsonb(x) ORDER BY x.last_at DESC)
           FROM (
             SELECT * FROM filtered
             ORDER BY last_at DESC
             LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0)
           ) x
         ), '[]'::jsonb)
  INTO v_total, v_rows;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$function$;

-- Números das consultas agendadas (últimos p_days dias), para o topo da página.
CREATE OR REPLACE FUNCTION public.admin_appointment_metrics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz := now() - make_interval(days => GREATEST(p_days, 1));
  v_result jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas administradores.';
  END IF;

  SELECT jsonb_build_object(
    'total', count(*),
    'completed', count(*) FILTER (WHERE a.status = 'completed'),
    'cancelled', count(*) FILTER (WHERE a.status = 'cancelled'),
    'no_show', count(*) FILTER (WHERE a.status = 'no_show'),
    'upcoming', count(*) FILTER (WHERE a.status IN ('scheduled', 'confirmed') AND a.scheduled_at > now()),
    'avg_call_seconds', COALESCE(round(avg(ws.media_seconds) FILTER (WHERE a.status = 'completed' AND ws.media_seconds > 0)), 0),
    'transcribed', count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.call_transcript_segments s WHERE s.webrtc_session_id = ws.id)),
    'avg_patient_rating', COALESCE((
      SELECT round(avg(f.rating)::numeric, 1) FROM public.session_feedback f
      JOIN public.appointments a2 ON a2.id = f.appointment_id
      WHERE f.user_type = 'patient' AND a2.scheduled_at >= v_since AND a2.scheduled_at <= now()
    ), 0)
  )
  INTO v_result
  FROM public.appointments a
  LEFT JOIN public.webrtc_sessions ws ON a.video_room_id ~ '^[0-9a-f-]{36}$' AND ws.id = a.video_room_id::uuid
  WHERE a.scheduled_at >= v_since AND a.scheduled_at <= now() + interval '30 days';

  RETURN v_result;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2) Detalhe, plano de segurança e transcrição (cada leitura vai à Auditoria)
-- ---------------------------------------------------------------------------

-- Sala(s) de vídeo de um atendimento.
CREATE OR REPLACE FUNCTION public.admin_care_session_ids(p_kind text, p_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_kind = 'appointment' THEN (
      SELECT CASE WHEN a.video_room_id ~ '^[0-9a-f-]{36}$' THEN ARRAY[a.video_room_id::uuid] ELSE ARRAY[]::uuid[] END
      FROM public.appointments a WHERE a.id = p_id
    )
    ELSE (
      SELECT COALESCE(array_agg(ws.id), ARRAY[]::uuid[])
      FROM public.webrtc_sessions ws WHERE ws.emergency_request_id = p_id
    )
  END;
$function$;

REVOKE ALL ON FUNCTION public.admin_care_session_ids(text, uuid) FROM PUBLIC, anon, authenticated;

-- Registra a leitura e devolve o paciente do atendimento (erro se não existe).
CREATE OR REPLACE FUNCTION public.admin_log_care_read(p_kind text, p_id uuid, p_action text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_patient uuid;
  v_name text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas administradores.';
  END IF;
  IF p_kind = 'appointment' THEN
    SELECT a.patient_id INTO v_patient FROM public.appointments a WHERE a.id = p_id;
  ELSIF p_kind = 'sos' THEN
    SELECT er.patient_id INTO v_patient FROM public.emergency_requests er WHERE er.id = p_id;
  ELSE
    RAISE EXCEPTION 'Tipo de atendimento inválido.';
  END IF;
  IF v_patient IS NULL THEN
    RAISE EXCEPTION 'Atendimento não encontrado.';
  END IF;

  SELECT pa.full_name INTO v_name FROM public.patients pa WHERE pa.user_id = v_patient;
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, target_name, details)
  VALUES (auth.uid(), p_action,
          CASE WHEN p_kind = 'appointment' THEN 'appointment' ELSE 'emergency_request' END,
          p_id, v_name, jsonb_build_object('patient_id', v_patient));
  RETURN v_patient;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_log_care_read(text, uuid, text) FROM PUBLIC, anon, authenticated;

-- Detalhe de uma consulta ('appointment') ou SOS ('sos').
CREATE OR REPLACE FUNCTION public.admin_get_care_detail(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_patient uuid;
  v_psychologist uuid;
  v_sessions uuid[];
  v_care jsonb;
  v_feedback jsonb;
BEGIN
  v_patient := public.admin_log_care_read(p_kind, p_id, 'view_care_detail');
  v_sessions := public.admin_care_session_ids(p_kind, p_id);

  IF p_kind = 'appointment' THEN
    SELECT a.psychologist_id,
           jsonb_build_object(
             'kind', 'appointment',
             'id', a.id,
             'status', a.status,
             'appointment_type', a.appointment_type,
             'scheduled_at', a.scheduled_at,
             'planned_minutes', a.duration,
             'created_at', a.created_at,
             'cancelled_at', a.cancelled_at,
             'cancelled_by', a.cancelled_by,
             'cancellation_reason', a.cancellation_reason,
             'notes', a.notes,
             'session_summary', a.session_summary,
             'transcription_consent_at', a.transcription_consent_at,
             'connected_at', ws.connected_at,
             'ended_at', ws.ended_at,
             'ended_by_type', ws.ended_by_type,
             'end_reason', ws.end_reason,
             'call_seconds', ws.media_seconds,
             'psychologist_name_fallback', a.psychologist_name
           )
    INTO v_psychologist, v_care
    FROM public.appointments a
    LEFT JOIN public.webrtc_sessions ws ON a.video_room_id ~ '^[0-9a-f-]{36}$' AND ws.id = a.video_room_id::uuid
    WHERE a.id = p_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.created_at), '[]'::jsonb) INTO v_feedback
    FROM (
      SELECT f.user_type, f.rating, f.comment, f.felt_heard, f.resolution_status, f.problem_resolved,
             f.has_complaint, f.complaint_categories, f.complaint_description, f.requires_admin_review,
             f.symptoms, f.clinical_notes, f.created_at
      FROM public.session_feedback f WHERE f.appointment_id = p_id
    ) f;
  ELSE
    SELECT er.accepted_by,
           jsonb_build_object(
             'kind', 'sos',
             'id', er.id,
             'status', er.status,
             'channel', er.channel,
             'triage', to_jsonb(er.triage),
             'created_at', er.created_at,
             'accepted_at', er.accepted_at,
             'started_at', er.started_at,
             'ended_at', er.ended_at,
             'duration_seconds', er.duration,
             'time_limit_seconds', er.time_limit_seconds,
             'end_reason', er.end_reason,
             'ended_by_type', er.ended_by_type,
             'end_notes', er.end_notes,
             'crisis_resolved', er.crisis_resolved,
             'transcription_consent_at', er.transcription_consent_at,
             'patient_name_fallback', COALESCE(er.patient_details->>'full_name', er.patient_details->>'name')
           )
    INTO v_psychologist, v_care
    FROM public.emergency_requests er
    WHERE er.id = p_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.created_at), '[]'::jsonb) INTO v_feedback
    FROM (
      SELECT f.user_type, f.rating, f.comment, f.felt_heard, f.resolution_status, f.problem_resolved,
             f.has_complaint, f.complaint_categories, f.complaint_description, f.requires_admin_review,
             f.symptoms, f.clinical_notes, f.created_at
      FROM public.session_feedback f WHERE f.emergency_request_id = p_id
    ) f;
  END IF;

  RETURN jsonb_build_object(
    'care', v_care,
    'patient', (
      SELECT jsonb_build_object('user_id', v_patient, 'full_name', pa.full_name, 'email', pa.email, 'phone', pa.phone)
      FROM (SELECT 1) one LEFT JOIN public.patients pa ON pa.user_id = v_patient
    ),
    'psychologist', CASE WHEN v_psychologist IS NULL THEN NULL ELSE (
      SELECT jsonb_build_object('user_id', v_psychologist, 'full_name', ps.full_name, 'email', ps.email, 'crp_number', ps.crp_number)
      FROM (SELECT 1) one LEFT JOIN public.psychologists ps ON ps.user_id = v_psychologist
    ) END,
    'feedback', v_feedback,
    'safety_plan_count', (SELECT count(*) FROM public.safety_plans sp WHERE sp.patient_id = v_patient),
    'transcript_segments', (
      SELECT count(*) FROM public.call_transcript_segments s WHERE s.webrtc_session_id = ANY (v_sessions)
    )
  );
END;
$function$;

-- Plano(s) de segurança do paciente do atendimento (mesmo formato que o
-- psicólogo vê no SOS: get_sos_safety_plan).
CREATE OR REPLACE FUNCTION public.admin_get_care_safety_plan(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_patient uuid;
  v_result jsonb;
BEGIN
  v_patient := public.admin_log_care_read(p_kind, p_id, 'view_safety_plan');

  SELECT jsonb_build_object(
    'plans', COALESCE(jsonb_agg(jsonb_build_object(
      'title', sp.title,
      'warning_signs', sp.warning_signs,
      'coping_strategies', sp.coping_strategies,
      'distractions', sp.distractions,
      'safe_environment', sp.safe_environment,
      'reasons_to_live', sp.reasons_to_live,
      'updated_at', sp.updated_at,
      'contacts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'name', ec.name,
          'relationship', ec.relationship,
          'phone', ec.phone,
          'is_primary', ec.is_primary
        ) ORDER BY ec.is_primary DESC, ec.created_at)
        FROM public.emergency_contacts ec
        WHERE ec.plan_id = sp.id
      ), '[]'::jsonb)
    ) ORDER BY sp.updated_at DESC), '[]'::jsonb)
  )
  INTO v_result
  FROM public.safety_plans sp
  WHERE sp.patient_id = v_patient;

  RETURN v_result;
END;
$function$;

-- Transcrição da chamada, as falas dos dois lados em ordem.
CREATE OR REPLACE FUNCTION public.admin_get_call_transcript(p_kind text, p_id uuid)
RETURNS TABLE (speaker_role text, started_at timestamptz, content text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sessions uuid[];
BEGIN
  PERFORM public.admin_log_care_read(p_kind, p_id, 'view_call_transcript');
  v_sessions := public.admin_care_session_ids(p_kind, p_id);

  RETURN QUERY
  SELECT s.speaker_role, s.started_at, s.content
  FROM public.call_transcript_segments s
  WHERE s.webrtc_session_id = ANY (v_sessions)
  ORDER BY s.started_at, s.speaker_role;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_appointments(uuid, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_sos(uuid, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_care_people(text, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_appointment_metrics(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_care_detail(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_care_safety_plan(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_call_transcript(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_appointments(uuid, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_sos(uuid, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_care_people(text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_appointment_metrics(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_care_detail(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_care_safety_plan(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_call_transcript(text, uuid) TO authenticated;
