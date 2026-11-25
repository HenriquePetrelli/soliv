-- Parte 1: Ajustar defaults das colunas na tabela patients
ALTER TABLE public.patients 
ALTER COLUMN show_weekly_goal_modal SET DEFAULT true,
ALTER COLUMN show_goal_modal SET DEFAULT true;

-- Atualizar registros existentes para true (caso algum esteja null ou false)
UPDATE public.patients
SET 
  show_weekly_goal_modal = COALESCE(show_weekly_goal_modal, true),
  show_goal_modal = COALESCE(show_goal_modal, true);