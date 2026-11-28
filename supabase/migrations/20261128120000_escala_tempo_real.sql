-- Escala (2026-11-28): o que o teste de carga de 2026-11-27 mostrou.
--
-- No banco, 72% do tempo foi do tempo real lendo e conferindo mudanças para o
-- postgres_changes; e, com muita gente conectando ao mesmo tempo, as entradas
-- nas escutas postgres_changes davam "Too many database timeouts".
--
-- 1. Lista de conversas: aviso do banco no canal privado conversas:<id> (como
--    a fila do SOS), em vez de cada pessoa escutar a tabela conversas.
-- 2. Presença da chamada (participant_presence) e conversas saem do tempo
--    real: a presença é a tabela que mais muda (cada participante a cada 15 s)
--    e a tela já lê o outro lado a cada sinal.
-- 3. count_available_psychologists sem uma consulta por psicólogo (era a
--    consulta do app mais cara: 4 ms, crescendo com os psicólogos online).

-- ===========================================================================
-- 1. Conversas: aviso do banco
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.broadcast_conversa_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.conversas%ROWTYPE := COALESCE(NEW, OLD);
BEGIN
  BEGIN
    PERFORM realtime.send(jsonb_build_object('conversa_id', r.id), 'changed', 'conversas:' || r.paciente_id::text, true);
    PERFORM realtime.send(jsonb_build_object('conversa_id', r.id), 'changed', 'conversas:' || r.psicologo_id::text, true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'conversas: aviso não enviado (%)', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.broadcast_conversa_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS broadcast_conversa_change ON public.conversas;
CREATE TRIGGER broadcast_conversa_change
  AFTER INSERT OR UPDATE OR DELETE ON public.conversas
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_conversa_change();

DROP POLICY IF EXISTS "Avisos do servidor: fila do SOS e estado da conta" ON realtime.messages;
DROP POLICY IF EXISTS "Avisos do servidor: fila do SOS, estado da conta e conversas" ON realtime.messages;
CREATE POLICY "Avisos do servidor: fila do SOS, estado da conta e conversas" ON realtime.messages
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND (
      realtime.topic() = 'sos-queue'
      OR realtime.topic() = 'account-status:' || (SELECT auth.uid())::text
      OR realtime.topic() = 'conversas:' || (SELECT auth.uid())::text
    )
  );

-- ===========================================================================
-- 2. Tabelas que saem do postgres_changes
-- ===========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'participant_presence') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.participant_presence;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversas') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.conversas;
  END IF;
END;
$$;

-- ===========================================================================
-- 3. Psicólogos disponíveis para o SOS
-- ===========================================================================
-- Mesma regra de antes (sinal recente, fora de outro SOS e de consulta
-- agendada em andamento, aprovado e não bloqueado), numa consulta só.
CREATE OR REPLACE FUNCTION public.count_available_psychologists()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::int
  FROM public.psychologist_presence pp
  JOIN public.psychologists p ON p.user_id = pp.psychologist_id
  WHERE pp.last_online > now() - interval '3 minutes'
    AND pp.current_emergency_id IS NULL
    AND p.approved = true
    AND p.approval_status = 'approved'
    AND (
      COALESCE(p.is_blocked, false) = false
      OR (p.blocked_until IS NOT NULL AND p.blocked_until < now())
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.psychologist_id = pp.psychologist_id
        AND a.status = 'in_progress'
        AND now() BETWEEN a.scheduled_at - interval '10 minutes'
                      AND a.scheduled_at + make_interval(mins => COALESCE(a.duration, 50) + 15)
    );
$function$;
