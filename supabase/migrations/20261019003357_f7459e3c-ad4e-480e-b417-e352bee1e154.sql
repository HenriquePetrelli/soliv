-- ============================================================================
-- A rotina purge-expired-care-records quebrava em toda execução:
-- appointments.video_room_id é texto e webrtc_sessions.id é uuid
-- ("operator does not exist: text = uuid"). Nada era apagado e a rotina
-- aparecia com falha no painel do admin. Mesma regra, com a comparação certa.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.purge_expired_care_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff timestamptz := now() - interval '5 years';
  v_archive integer;
  v_feedback integer;
  v_appointments integer;
  v_sessions integer;
  v_requests integer;
BEGIN
  DELETE FROM public.care_record_archive WHERE retain_until < now();
  GET DIAGNOSTICS v_archive = ROW_COUNT;

  -- Ordem pensada para as chaves estrangeiras: primeiro o que aponta para
  -- pedidos de SOS e salas de vídeo, depois eles.
  DELETE FROM public.session_feedback WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_feedback = ROW_COUNT;

  DELETE FROM public.appointments
  WHERE scheduled_at < v_cutoff
    AND status NOT IN ('pending', 'scheduled', 'confirmed', 'in_progress');
  GET DIAGNOSTICS v_appointments = ROW_COUNT;

  DELETE FROM public.webrtc_sessions ws
  WHERE ws.created_at < v_cutoff
    AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.video_room_id = ws.id::text);
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  DELETE FROM public.emergency_requests
  WHERE created_at < v_cutoff
    AND status IN ('completed', 'cancelled');
  GET DIAGNOSTICS v_requests = ROW_COUNT;

  RETURN jsonb_build_object(
    'archive', v_archive,
    'session_feedback', v_feedback,
    'appointments', v_appointments,
    'webrtc_sessions', v_sessions,
    'emergency_requests', v_requests
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.purge_expired_care_records() FROM PUBLIC, anon, authenticated;