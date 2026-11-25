-- Criar tabela de grupos de apoio
CREATE TABLE public.support_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de grupos favoritados pelos usuários
CREATE TABLE public.group_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  group_id UUID NOT NULL REFERENCES public.support_groups(id) ON DELETE CASCADE,
  favoritado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_id)
);

-- Criar tabela de depoimentos dos grupos
CREATE TABLE public.group_testimonials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.support_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  anonimo BOOLEAN NOT NULL DEFAULT false,
  sintoma_id UUID REFERENCES public.transtornos_sintomas(id),
  humor INTEGER NOT NULL CHECK (humor >= 0 AND humor <= 5),
  texto TEXT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.support_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_testimonials ENABLE ROW LEVEL SECURITY;

-- Políticas para support_groups
CREATE POLICY "Todos podem visualizar grupos de apoio" 
ON public.support_groups 
FOR SELECT 
USING (true);

-- Políticas para group_favorites
CREATE POLICY "Usuários podem visualizar seus próprios favoritos" 
ON public.group_favorites 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar seus próprios favoritos" 
ON public.group_favorites 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar seus próprios favoritos" 
ON public.group_favorites 
FOR DELETE 
USING (auth.uid() = user_id);

-- Políticas para group_testimonials
CREATE POLICY "Todos podem visualizar depoimentos" 
ON public.group_testimonials 
FOR SELECT 
USING (true);

CREATE POLICY "Usuários podem criar seus próprios depoimentos" 
ON public.group_testimonials 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem editar seus próprios depoimentos" 
ON public.group_testimonials 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar seus próprios depoimentos" 
ON public.group_testimonials 
FOR DELETE 
USING (auth.uid() = user_id);

-- Inserir os grupos de apoio baseados nos transtornos existentes
INSERT INTO public.support_groups (nome, descricao) VALUES
('Transtorno de Ansiedade Generalizada (TAG)', 'Grupo de apoio para pessoas que lidam com preocupações excessivas e persistentes sobre diversos aspectos da vida cotidiana.'),
('Ataque de Pânico', 'Espaço seguro para compartilhar experiências sobre episódios súbitos de medo intenso e sintomas físicos desconfortáveis.'),
('Ansiedade Social (Fobia Social)', 'Comunidade de apoio para quem enfrenta dificuldades em situações sociais e medo do julgamento de outras pessoas.'),
('Fobias Específicas', 'Grupo para pessoas que lidam com medos irracionais e intensos de objetos, situações ou atividades específicas.'),
('Transtorno de Ansiedade de Separação', 'Apoio para quem sente ansiedade excessiva quando separado de pessoas ou lugares importantes.'),
('Transtorno de Estresse Pós-Traumático (TEPT)', 'Comunidade para pessoas que enfrentam as consequências de experiências traumáticas.'),
('Transtorno Obsessivo-Compulsivo (TOC)', 'Grupo de apoio para quem lida com pensamentos obsessivos e comportamentos compulsivos.'),
('Ansiedade Induzida por Substâncias', 'Espaço para pessoas que experimentam ansiedade relacionada ao uso de substâncias.'),
('Ansiedade Noturna', 'Apoio para quem enfrenta ansiedade e dificuldades para dormir durante a noite.'),
('Ansiedade Antecipatória', 'Grupo para pessoas que sentem ansiedade intensa ao antecipar eventos ou situações futuras.'),
('Transtorno de Ansiedade Mista com Depressão', 'Comunidade de apoio para quem lida simultaneamente com sintomas de ansiedade e depressão.');

-- Triggers para atualizar timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;