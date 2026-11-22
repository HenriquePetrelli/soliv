-- Regras de leitura que deixavam qualquer conta logada (qualquer pessoa pode
-- criar uma conta de paciente) ler TODAS as linhas destas tabelas. Apontado
-- como crítico pela revisão de segurança do Lovable.

-- 1. Presença do psicólogo: guarda quantos SOS cada um aceitou e recusou e o
--    SOS em andamento. Só o app do próprio psicólogo lê esta tabela (as
--    funções do SOS no banco leem como servidor, sem passar por esta regra).
--    A regra "Psychologists can manage their own presence" (ALL, a própria
--    linha) continua valendo para a leitura dele.
DROP POLICY IF EXISTS "psychologist_presence: select (2 regras unificadas)" ON public.psychologist_presence;

-- 2. Agenda (horários, exceções, férias e regras de agendamento): o paciente
--    precisa dela para ver os horários livres, mas só de psicólogos aprovados.
--    Antes valia para qualquer linha, inclusive de cadastros em análise ou
--    recusados.
CREATE OR REPLACE FUNCTION public.can_view_psychologist_schedule(p_psychologist_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_psychologist_id = (SELECT auth.uid())
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.psychologists ps
      WHERE ps.user_id = p_psychologist_id AND ps.approved IS TRUE
    );
$function$;

REVOKE ALL ON FUNCTION public.can_view_psychologist_schedule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_psychologist_schedule(uuid) TO authenticated;

DROP POLICY IF EXISTS "Everyone can view psychologist availability" ON public.psychologist_availability;
CREATE POLICY "Agenda visível de psicólogos aprovados" ON public.psychologist_availability
  FOR SELECT TO authenticated USING (public.can_view_psychologist_schedule(psychologist_id));

DROP POLICY IF EXISTS "Everyone can view availability overrides" ON public.psychologist_availability_overrides;
CREATE POLICY "Exceções visíveis de psicólogos aprovados" ON public.psychologist_availability_overrides
  FOR SELECT TO authenticated USING (public.can_view_psychologist_schedule(psychologist_id));

DROP POLICY IF EXISTS "Everyone can view vacations" ON public.psychologist_vacations;
CREATE POLICY "Férias visíveis de psicólogos aprovados" ON public.psychologist_vacations
  FOR SELECT TO authenticated USING (public.can_view_psychologist_schedule(psychologist_id));

DROP POLICY IF EXISTS "Authenticated users can read booking rules" ON public.psychologist_booking_rules;
CREATE POLICY "Regras de agendamento de psicólogos aprovados" ON public.psychologist_booking_rules
  FOR SELECT TO authenticated USING (public.can_view_psychologist_schedule(psychologist_id));

-- 3. Catálogo de metas da semana: só as ativas (como o nome da regra já
--    dizia), mais as que o paciente já escolheu, para o histórico não perder o
--    nome de uma meta desativada depois.
DROP POLICY IF EXISTS "Anyone can view active weekly goals" ON public.weekly_goals;
CREATE POLICY "Metas ativas ou já escolhidas pelo paciente" ON public.weekly_goals
  FOR SELECT TO authenticated USING (
    active IS TRUE
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.patient_weekly_goals pwg
      WHERE pwg.goal_id = weekly_goals.id AND pwg.user_id = (SELECT auth.uid())
    )
  );

-- Ficam abertas de propósito (listas de referência, sem dado pessoal):
-- brazilian_cities, brazilian_states e transtornos_sintomas (usadas também no
-- cadastro, antes do login) e support_groups (nome e descrição dos grupos).
