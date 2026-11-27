-- Escala (2026-11-27): varredura de muitas conexões ao mesmo tempo.
--
-- 1. SOS por mensagem: o sinal de presença (sos_chat_heartbeat) gravava em
--    sos_chat_state a cada chamada, e cada tela chamava o sinal de novo a cada
--    evento dessa tabela: um laço que dobrava a cada volta. O app agora aplica
--    a linha do evento sem chamar o servidor; aqui, o sinal só grava quando há
--    algo novo (presença com mais de 5 s ou mensagem não lida), protegendo
--    também abas abertas com a versão antiga.

CREATE OR REPLACE FUNCTION public.sos_chat_heartbeat(p_request_id uuid, p_read boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  r public.emergency_requests%ROWTYPE;
  v_type text;
  v_session uuid;
  s public.sos_chat_state;
BEGIN
  SELECT * INTO r FROM public.emergency_requests WHERE id = p_request_id;
  IF NOT FOUND OR v_uid IS NULL
     OR v_uid NOT IN (r.patient_id, COALESCE(r.accepted_by, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
    RAISE EXCEPTION 'Atendimento não encontrado' USING ERRCODE = '42501';
  END IF;
  v_type := CASE WHEN v_uid = r.accepted_by THEN 'psychologist' ELSE 'patient' END;

  IF r.status IN ('accepted', 'in_progress') AND r.channel = 'text' THEN
    INSERT INTO public.sos_chat_state (request_id, patient_id, psychologist_id)
    VALUES (r.id, r.patient_id, r.accepted_by)
    ON CONFLICT (request_id) DO NOTHING;

    UPDATE public.sos_chat_state
    SET patient_seen_at = CASE WHEN v_type = 'patient' THEN now() ELSE patient_seen_at END,
        psychologist_seen_at = CASE WHEN v_type = 'psychologist' THEN now() ELSE psychologist_seen_at END,
        patient_read_at = CASE WHEN v_type = 'patient' AND p_read THEN now() ELSE patient_read_at END,
        psychologist_read_at = CASE WHEN v_type = 'psychologist' AND p_read THEN now() ELSE psychologist_read_at END,
        psychologist_id = COALESCE(psychologist_id, r.accepted_by),
        updated_at = now()
    WHERE request_id = r.id
      -- Só grava quando muda algo que o outro lado precisa ver: presença com
      -- mais de 5 s ou mensagem do outro lado ainda não marcada como lida.
      -- Cada gravação vira um evento de tempo real para os dois lados.
      AND (
        psychologist_id IS NULL
        OR (v_type = 'patient' AND (
              COALESCE(patient_seen_at, '-infinity'::timestamptz) < now() - interval '5 seconds'
              OR (p_read AND COALESCE(patient_read_at, '-infinity'::timestamptz) < last_psychologist_message_at)))
        OR (v_type = 'psychologist' AND (
              COALESCE(psychologist_seen_at, '-infinity'::timestamptz) < now() - interval '5 seconds'
              OR (p_read AND COALESCE(psychologist_read_at, '-infinity'::timestamptz) < last_patient_message_at)))
      );

    -- A mesma presença da sala de vídeo: a rotina de abandono e "chamar outro
    -- psicólogo" leem daqui.
    SELECT id INTO v_session FROM public.webrtc_sessions WHERE emergency_request_id = r.id
    ORDER BY created_at DESC LIMIT 1;
    IF v_session IS NOT NULL THEN
      INSERT INTO public.participant_presence (session_id, user_id, user_type, last_seen)
      VALUES (v_session, v_uid, v_type, now())
      ON CONFLICT (session_id, user_id) DO UPDATE SET last_seen = now()
      WHERE participant_presence.last_seen < now() - interval '5 seconds';
    END IF;
  END IF;

  SELECT * INTO s FROM public.sos_chat_state WHERE request_id = r.id;
  RETURN jsonb_build_object(
    'server_now', now(),
    'status', r.status,
    'end_reason', r.end_reason,
    'ended_by_type', r.ended_by_type,
    'accepted_at', r.accepted_at,
    'started_at', r.started_at,
    'time_limit_seconds', r.time_limit_seconds,
    'patient_seen_at', s.patient_seen_at,
    'psychologist_seen_at', s.psychologist_seen_at,
    'patient_read_at', s.patient_read_at,
    'psychologist_read_at', s.psychologist_read_at,
    'last_patient_message_at', s.last_patient_message_at,
    'last_psychologist_message_at', s.last_psychologist_message_at,
    'first_reply_at', s.first_reply_at
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sos_chat_heartbeat(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sos_chat_heartbeat(uuid, boolean) TO authenticated;

-- ===========================================================================
-- 2. Push com muitos aparelhos
-- ===========================================================================
-- As edge functions buscavam psicólogos e aparelhos com .in(<lista de IDs>)
-- na URL: com algumas centenas de IDs o endereço fica longo demais e o pedido
-- é recusado; e cada busca para em 1000 linhas (max_rows). No SOS isso fazia
-- o push não chegar a ninguém justamente quando havia muitos psicólogos.
-- Agora a lista vai no corpo (RPC) e a resposta é um único valor (sem corte).

-- Aparelhos ativos dos psicólogos que podem atender um SOS agora: aprovados,
-- não bloqueados, fora de outro SOS e fora de consulta agendada.
CREATE OR REPLACE FUNCTION public.sos_push_tokens()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT t.token), ARRAY[]::text[])
  FROM public.psychologists p
  JOIN public.fcm_tokens t ON t.user_id = p.user_id AND t.is_active IS NOT FALSE
  LEFT JOIN public.psychologist_presence pp ON pp.psychologist_id = p.user_id
  WHERE p.approved = true
    AND p.approval_status = 'approved'
    AND (COALESCE(p.is_blocked, false) = false OR (p.blocked_until IS NOT NULL AND p.blocked_until < now()))
    AND pp.current_emergency_id IS NULL
    AND NOT public.psychologist_in_consultation(p.user_id);
$function$;
REVOKE ALL ON FUNCTION public.sos_push_tokens() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sos_push_tokens() TO service_role;

-- Aparelhos ativos de uma lista de contas: [{user_id, token}].
CREATE OR REPLACE FUNCTION public.fcm_tokens_for_users(p_user_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', t.user_id, 'token', t.token)), '[]'::jsonb)
  FROM public.fcm_tokens t
  WHERE t.user_id = ANY (p_user_ids)
    AND t.is_active IS NOT FALSE;
$function$;
REVOKE ALL ON FUNCTION public.fcm_tokens_for_users(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fcm_tokens_for_users(uuid[]) TO service_role;

-- Desativa os aparelhos que o Firebase diz que não existem mais.
CREATE OR REPLACE FUNCTION public.deactivate_fcm_tokens(p_tokens text[])
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH done AS (
    UPDATE public.fcm_tokens SET is_active = false
    WHERE token = ANY (p_tokens) AND is_active IS NOT FALSE
    RETURNING 1
  )
  SELECT count(*)::integer FROM done;
$function$;
REVOKE ALL ON FUNCTION public.deactivate_fcm_tokens(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_fcm_tokens(text[]) TO service_role;

-- ===========================================================================
-- 3. Lista de conversas sem escutar a tabela de mensagens inteira
-- ===========================================================================
-- A lista escutava toda a tabela mensagens: cada mensagem de qualquer pessoa
-- passava pela checagem de acesso de cada usuário com o chat aberto. Agora a
-- mensagem nova (ou lida) marca a própria conversa, e a lista escuta só as
-- conversas da pessoa (filtro por paciente_id / psicologo_id).
CREATE OR REPLACE FUNCTION public.marcar_atividade_conversa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.conversas SET updated_at = now() WHERE id = NEW.conversa_id;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.marcar_atividade_conversa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS marcar_atividade_conversa ON public.mensagens;
CREATE TRIGGER marcar_atividade_conversa
  AFTER INSERT ON public.mensagens
  FOR EACH ROW EXECUTE FUNCTION public.marcar_atividade_conversa();

CREATE OR REPLACE FUNCTION public.marcar_mensagens_como_lidas(p_conversa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.conversas c
    WHERE c.id = p_conversa_id
      AND (c.paciente_id = auth.uid() OR c.psicologo_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Conversa não encontrada ou acesso negado';
  END IF;

  UPDATE public.mensagens
  SET lida_em = now()
  WHERE conversa_id = p_conversa_id
    AND autor_id <> auth.uid()
    AND lida_em IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Uma marca só na conversa (não uma por mensagem): o "lido" e as não lidas
  -- da lista se atualizam nos dois lados.
  IF v_count > 0 THEN
    UPDATE public.conversas SET updated_at = now() WHERE id = p_conversa_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_mensagens_como_lidas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_mensagens_como_lidas(uuid) TO authenticated;

-- ===========================================================================
-- 4. Fila do SOS: o banco avisa (canal sos-queue)
-- ===========================================================================
-- Cada psicólogo online escutava a tabela emergency_requests inteira (checagem
-- de acesso por psicólogo a cada mudança) e cada aparelho ainda mandava avisos
-- no canal sos-queue. Agora um aviso só, do banco, a cada pedido novo,
-- mudança de status ou remoção. Falha no aviso nunca impede o SOS (a tela
-- confere a fila periodicamente).
CREATE OR REPLACE FUNCTION public.broadcast_sos_queue_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('request_id', COALESCE(NEW.id, OLD.id)),
      'queue-changed',
      'sos-queue',
      true  -- canal privado: só quem está logado ouve, ninguém do app envia
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sos-queue: aviso não enviado (%)', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.broadcast_sos_queue_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS broadcast_sos_queue_change ON public.emergency_requests;
CREATE TRIGGER broadcast_sos_queue_change
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.emergency_requests
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_sos_queue_change();

-- ===========================================================================
-- 5. Chamada: um aviso de mídia, uma gravação
-- ===========================================================================
-- report_call_media gravava a linha da sala duas vezes por aviso; cada
-- gravação vai inteira (com a negociação da chamada, ~10-15 KB) pelo tempo
-- real aos dois lados. Junto com o aviso a cada 30 s (era 20 s), o tráfego de
-- tempo real por chamada cai para cerca de um terço.
CREATE OR REPLACE FUNCTION public.report_call_media(p_session_id uuid, p_connected boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  s public.webrtc_sessions%ROWTYPE;
  v_type text;
  v_both boolean;
  v_limit integer;
BEGIN
  SELECT * INTO s FROM public.webrtc_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR v_uid IS NULL OR v_uid NOT IN (COALESCE(s.patient_id, '00000000-0000-0000-0000-000000000000'::uuid),
                                                 COALESCE(s.psychologist_id, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
    RAISE EXCEPTION 'Sala não encontrada' USING ERRCODE = '42501';
  END IF;
  v_type := CASE WHEN v_uid = s.psychologist_id THEN 'psychologist' ELSE 'patient' END;

  INSERT INTO public.participant_presence (session_id, user_id, user_type, last_seen, media_connected, media_changed_at)
  VALUES (p_session_id, v_uid, v_type, now(), p_connected, now())
  ON CONFLICT (session_id, user_id) DO UPDATE
  SET last_seen = now(),
      media_connected = EXCLUDED.media_connected,
      media_changed_at = CASE
        WHEN participant_presence.media_connected IS DISTINCT FROM EXCLUDED.media_connected THEN now()
        ELSE participant_presence.media_changed_at
      END;

  IF s.status IS DISTINCT FROM 'completed' THEN
    -- Os dois lados com mídia passando e com sinal recente.
    SELECT count(*) = 2 INTO v_both
    FROM public.participant_presence pp
    WHERE pp.session_id = p_session_id
      AND pp.user_id IN (s.patient_id, s.psychologist_id)
      AND pp.media_connected
      AND pp.last_seen > now() - interval '60 seconds';

    v_limit := public.call_time_limit_seconds(p_session_id);

    -- Uma gravação só (antes eram duas). Cada gravação desta linha vai
    -- inteira pelo tempo real aos dois lados da chamada.
    WITH tick AS (
      SELECT CASE
               WHEN s.media_tick_at IS NOT NULL
                 THEN LEAST(60, GREATEST(0, EXTRACT(EPOCH FROM (now() - s.media_tick_at))))::integer
               ELSE 0
             END AS seconds
    )
    UPDATE public.webrtc_sessions
    SET patient_media_at = CASE WHEN p_connected AND v_type = 'patient' THEN COALESCE(patient_media_at, now()) ELSE patient_media_at END,
        psychologist_media_at = CASE WHEN p_connected AND v_type = 'psychologist' THEN COALESCE(psychologist_media_at, now()) ELSE psychologist_media_at END,
        -- Soma o intervalo desde o último aviso com os dois conectados (no
        -- máximo 60 s, para uma lacuna sem avisos não contar como conversa).
        -- Soma também quando este aviso é de queda: o trecho até a queda foi
        -- conversa, e o cronômetro na tela não volta para trás ao pausar.
        media_seconds = media_seconds + tick.seconds,
        media_tick_at = CASE WHEN v_both THEN now() ELSE NULL END,
        -- Tempo restante (rotina de fim do SOS): sempre a partir da mesma conta.
        time_left_seconds = GREATEST(0, v_limit - (media_seconds + tick.seconds)),
        timer_paused = NOT v_both,
        timer_updated_at = now()
    FROM tick
    WHERE id = p_session_id;
  END IF;

  SELECT * INTO s FROM public.webrtc_sessions WHERE id = p_session_id;
  RETURN jsonb_build_object('connected', s.connected_at IS NOT NULL, 'media_seconds', s.media_seconds);
END;
$function$;

-- ===========================================================================
-- 6. Canais de aviso privados (só o servidor envia)
-- ===========================================================================
-- sos-queue e account-status:<id> eram canais públicos: qualquer aparelho
-- podia mandar avisos neles e fazer todos os psicólogos (ou a tela de uma
-- conta) consultarem o banco de novo, em massa. Agora são privados: ler exige
-- login (e, no account-status, ser a própria conta); enviar, só o servidor
-- (realtime.send e a API de broadcast com a chave de serviço ignoram estas
-- regras). Não há regra de INSERT: o app não envia nada nesses canais.
DROP POLICY IF EXISTS "Avisos do servidor: fila do SOS e estado da conta" ON realtime.messages;
CREATE POLICY "Avisos do servidor: fila do SOS e estado da conta" ON realtime.messages
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND (
      realtime.topic() = 'sos-queue'
      OR realtime.topic() = 'account-status:' || (SELECT auth.uid())::text
    )
  );

-- ===========================================================================
-- 7. Limpeza da tabela de limites de uso
-- ===========================================================================
-- Uma linha por ação e conta, nunca apagada. A maior janela usada é 1 hora;
-- linhas paradas há mais de 1 dia não valem mais nada.
CREATE OR REPLACE FUNCTION public.purge_stale_rate_limits()
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH gone AS (
    DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day' RETURNING 1
  )
  SELECT count(*)::integer FROM gone;
$function$;
REVOKE ALL ON FUNCTION public.purge_stale_rate_limits() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-rate-limits';
  PERFORM cron.schedule('purge-rate-limits', '55 5 * * *', 'SELECT public.purge_stale_rate_limits();');
END;
$$;
