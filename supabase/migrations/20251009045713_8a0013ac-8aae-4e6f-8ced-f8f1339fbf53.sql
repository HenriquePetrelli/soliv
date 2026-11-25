-- Parte 1: Remover colunas da tabela weekly_goals e adicionar na tabela patients

-- Remover colunas da weekly_goals
ALTER TABLE public.weekly_goals DROP COLUMN IF EXISTS show_weekly_goal_modal;
ALTER TABLE public.weekly_goals DROP COLUMN IF EXISTS show_goal_modal;

-- Adicionar colunas na tabela patients
ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS show_weekly_goal_modal boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS show_goal_modal boolean DEFAULT true;

-- Parte 5: Seed de metas padrão
-- Criar uma tabela para armazenar as metas padrões disponíveis
CREATE TABLE IF NOT EXISTS public.default_weekly_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  target integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT now()
);

-- Inserir as metas padrão
INSERT INTO public.default_weekly_goals (category, title, description, icon, target)
VALUES
  ('breathing', 'Respiração Consciente', 'Respirar conscientemente 5x nesta semana', '🧘', 5),
  ('sound', 'Sons Terapêuticos', 'Ouvir sons relaxantes 15 minutos por dia', '🎵', 7),
  ('support_group', 'Grupos de Apoio', 'Participar de 1 grupo de apoio esta semana', '🤝', 1),
  ('journal', 'Diário Positivo', 'Registrar 3 pensamentos positivos durante a semana', '📔', 3),
  ('mood', 'Humor Diário', 'Registrar meu humor todos os dias desta semana', '😊', 7),
  ('appointment', 'Consultas', 'Concluir minha consulta agendada', '💬', 1)
ON CONFLICT DO NOTHING;

-- Habilitar RLS na tabela default_weekly_goals
ALTER TABLE public.default_weekly_goals ENABLE ROW LEVEL SECURITY;

-- Política para permitir que todos os usuários autenticados vejam as metas padrão
CREATE POLICY "Authenticated users can view default goals"
ON public.default_weekly_goals FOR SELECT
TO authenticated
USING (true);

-- Parte 6: Atualizar a função reset_weekly_goals para usar a tabela patients
CREATE OR REPLACE FUNCTION public.reset_weekly_goals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Reset progress e completed para todas as metas
  UPDATE public.weekly_goals
  SET 
    progress = 0,
    completed = false,
    start_date = date_trunc('week', CURRENT_DATE)::date,
    end_date = (date_trunc('week', CURRENT_DATE) + interval '6 days')::date,
    updated_at = now()
  WHERE show_goal_modal = true;
  
  -- Atualizar show_weekly_goal_modal para true em todos os pacientes ativos que têm show_goal_modal ativo
  UPDATE public.patients
  SET show_weekly_goal_modal = true
  WHERE show_goal_modal = true;
END;
$function$;