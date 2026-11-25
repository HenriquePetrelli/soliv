-- Dropar tabelas existentes se existirem (ordem inversa por causa de foreign keys)
DROP TABLE IF EXISTS public.patient_weekly_goals CASCADE;
DROP TABLE IF EXISTS public.weekly_goals CASCADE;

-- Criar tabela weekly_goals (metas fixas globais)
CREATE TABLE public.weekly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target INTEGER NOT NULL DEFAULT 1,
  type TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar tabela patient_weekly_goals (metas do paciente para a semana)
CREATE TABLE public.patient_weekly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES public.weekly_goals(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  progress INTEGER DEFAULT 0,
  target INTEGER NOT NULL,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS nas novas tabelas
ALTER TABLE public.weekly_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_weekly_goals ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para weekly_goals (todos podem ver metas ativas)
CREATE POLICY "Anyone can view active weekly goals"
ON public.weekly_goals
FOR SELECT
USING (true);

-- Políticas RLS para patient_weekly_goals
CREATE POLICY "Users can view their own weekly goals"
ON public.patient_weekly_goals
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own weekly goals"
ON public.patient_weekly_goals
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own weekly goals"
ON public.patient_weekly_goals
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own weekly goals"
ON public.patient_weekly_goals
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_patient_weekly_goals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_patient_weekly_goals_updated_at
BEFORE UPDATE ON public.patient_weekly_goals
FOR EACH ROW
EXECUTE FUNCTION public.update_patient_weekly_goals_updated_at();

-- Popular weekly_goals com as metas padrão
INSERT INTO public.weekly_goals (category, title, description, target, type) VALUES
  ('breathing', 'Respiração Guiada', 'Respirar conscientemente 5x nesta semana', 5, 'count'),
  ('sound', 'Sons Terapêuticos', 'Ouvir sons relaxantes 15 minutos por dia', 7, 'daily'),
  ('support_group', 'Grupos de Apoio', 'Participar de 1 grupo de apoio esta semana', 1, 'count'),
  ('journal', 'Diário', 'Registrar 3 pensamentos positivos durante a semana', 3, 'count'),
  ('mood', 'Humor Diário', 'Registrar meu humor todos os dias desta semana', 7, 'daily'),
  ('appointment', 'Consultas', 'Concluir minha consulta agendada', 1, 'count');

-- Função para resetar metas semanais (chamada pelo cron)
CREATE OR REPLACE FUNCTION public.reset_patient_weekly_goals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Zerar as metas dos pacientes
  DELETE FROM public.patient_weekly_goals;
  
  -- Reativar modal de metas semanais para todos
  UPDATE public.patients
  SET show_weekly_goal_modal = true
  WHERE show_goal_modal = true;
END;
$$;