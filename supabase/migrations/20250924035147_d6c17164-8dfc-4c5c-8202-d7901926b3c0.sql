-- Criar tabela para o diário privado
CREATE TABLE public.private_journals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  texto TEXT NOT NULL,
  humor INTEGER NOT NULL CHECK (humor >= 0 AND humor <= 5),
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.private_journals ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - usuário só pode acessar suas próprias entradas
CREATE POLICY "Usuários podem criar suas próprias entradas" 
ON public.private_journals 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem ver suas próprias entradas" 
ON public.private_journals 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem editar suas próprias entradas" 
ON public.private_journals 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas próprias entradas" 
ON public.private_journals 
FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger para atualizar automaticamente o campo atualizado_em
CREATE TRIGGER update_private_journals_updated_at
BEFORE UPDATE ON public.private_journals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para melhor performance
CREATE INDEX idx_private_journals_user_id ON public.private_journals(user_id);
CREATE INDEX idx_private_journals_criado_em ON public.private_journals(criado_em DESC);
CREATE INDEX idx_private_journals_humor ON public.private_journals(humor);