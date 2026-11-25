-- Criar tabela de conversas
CREATE TABLE public.conversas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  paciente_id UUID NOT NULL,
  psicologo_id UUID NOT NULL,
  data_inicio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  data_fim TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'somente_leitura', 'expirada')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(paciente_id, psicologo_id)
);

-- Criar tabela de mensagens
CREATE TABLE public.mensagens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversa_id UUID NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  autor_id UUID NOT NULL,
  conteudo TEXT,
  tipo TEXT NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'imagem')),
  imagem_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

-- Políticas para conversas
CREATE POLICY "Pacientes podem ver suas conversas" ON public.conversas
  FOR SELECT USING (paciente_id = auth.uid());

CREATE POLICY "Psicólogos podem ver suas conversas" ON public.conversas
  FOR SELECT USING (psicologo_id = auth.uid());

CREATE POLICY "Pacientes podem criar conversas" ON public.conversas
  FOR INSERT WITH CHECK (paciente_id = auth.uid());

CREATE POLICY "Pacientes podem atualizar suas conversas" ON public.conversas
  FOR UPDATE USING (paciente_id = auth.uid());

CREATE POLICY "Psicólogos podem atualizar suas conversas" ON public.conversas
  FOR UPDATE USING (psicologo_id = auth.uid());

CREATE POLICY "Pacientes podem deletar suas conversas" ON public.conversas
  FOR DELETE USING (paciente_id = auth.uid());

-- Políticas para mensagens
CREATE POLICY "Usuários podem ver mensagens das suas conversas" ON public.mensagens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversas c 
      WHERE c.id = conversa_id 
      AND (c.paciente_id = auth.uid() OR c.psicologo_id = auth.uid())
    )
  );

CREATE POLICY "Usuários podem criar mensagens nas suas conversas" ON public.mensagens
  FOR INSERT WITH CHECK (
    autor_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.conversas c 
      WHERE c.id = conversa_id 
      AND (c.paciente_id = auth.uid() OR c.psicologo_id = auth.uid())
      AND c.status = 'ativa'
    )
  );

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversas_updated_at
  BEFORE UPDATE ON public.conversas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mensagens_updated_at
  BEFORE UPDATE ON public.mensagens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Função para verificar se paciente pode criar conversa com psicólogo
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para gerenciar expiração de conversas
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Habilitar Realtime para as tabelas
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens;