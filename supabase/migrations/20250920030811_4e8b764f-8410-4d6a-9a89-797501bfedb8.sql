-- Corrigir funções com search_path mutable
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

CREATE OR REPLACE FUNCTION public.pode_criar_conversa(p_paciente_id UUID, p_psicologo_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Verificar se existe consulta finalizada nos últimos 30 dias
  RETURN EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.patient_id = p_paciente_id
    AND a.psychologist_id = p_psicologo_id
    AND a.status = 'completed'
    AND a.scheduled_at >= (CURRENT_DATE - INTERVAL '30 days')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

CREATE OR REPLACE FUNCTION public.gerenciar_expiracao_conversas()
RETURNS VOID AS $$
BEGIN
  -- Marcar conversas como somente leitura após 1 mês
  UPDATE public.conversas 
  SET status = 'somente_leitura'
  WHERE status = 'ativa' 
  AND data_inicio <= (CURRENT_DATE - INTERVAL '1 month');
  
  -- Deletar conversas após 3 meses
  DELETE FROM public.conversas 
  WHERE data_inicio <= (CURRENT_DATE - INTERVAL '3 months');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';