-- Criar tabela de transtornos e sintomas
CREATE TABLE public.transtornos_sintomas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transtorno text NOT NULL,
  sintomas text[] NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transtornos_sintomas ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Enable read access for everyone on transtornos_sintomas" 
ON public.transtornos_sintomas FOR SELECT 
USING (true);

-- Insert the disorder-symptom mappings
INSERT INTO public.transtornos_sintomas (transtorno, sintomas) VALUES
('Transtorno de Ansiedade Generalizada (TAG)', ARRAY[
  'Preocupação excessiva e incontrolável',
  'Inquietação ou sensação de nervosismo',
  'Fadiga fácil',
  'Dificuldade de concentração ou mente em branco',
  'Irritabilidade',
  'Tensão muscular',
  'Perturbação do sono (dificuldade para dormir ou sono inquieto)'
]),
('Ataque de Pânico', ARRAY[
  'Palpitações ou coração acelerado',
  'Sudorese',
  'Tremores ou abalos',
  'Sensação de falta de ar ou asfixia',
  'Dor ou desconforto no peito',
  'Náusea ou desconforto abdominal',
  'Tontura ou sensação de desmaio',
  'Calafrios ou ondas de calor',
  'Formigamento (parestesias)',
  'Sensação de irrealidade (desrealização) ou de distanciamento de si (despersonalização)',
  'Medo de perder o controle ou enlouquecer',
  'Medo de morrer'
]),
('Ansiedade Social (Fobia Social)', ARRAY[
  'Medo intenso de situações sociais ou de desempenho',
  'Medo de ser julgado, humilhado ou envergonhado',
  'Ansiedade extrema ao interagir com estranhos',
  'Evitação de situações sociais (reuniões, festas, falar em público)',
  'Ansiedade antecipatória antes de eventos sociais'
]),
('Fobias Específicas', ARRAY[
  'Medo irracional e excessivo de um objeto ou situação específica (alturas, animais, sangue, etc.)',
  'Resposta de ansiedade imediata ao encontrar o objeto do medo',
  'Evitação ativa do objeto ou situação temida',
  'Reconhecimento de que o medo é excessivo (em adultos)'
]),
('Transtorno de Ansiedade de Separação', ARRAY[
  'Ansiedade excessiva ao se separar de figuras de apego',
  'Preocupação com perda ou dano às figuras de apego',
  'Relutância ou recusa em sair de casa (para escola, trabalho)',
  'Medo excessivo de ficar sozinho',
  'Pesadelos sobre separação',
  'Sintomas físicos ao se separar (dores de cabeça, barriga, náusea)'
]),
('Transtorno de Estresse Pós-Traumático (TEPT)', ARRAY[
  'Revivência do trauma (flashbacks, pesadelos, memórias intrusivas)',
  'Evitação de lembretes do trauma (pensamentos, lugares, conversas)',
  'Pensamentos e humor negativos (culpa, medo, raiva, vergonha)',
  'Hiper-reatividade (irritabilidade, hipervigilância, susto fácil, problemas de sono)'
]),
('Transtorno Obsessivo-Compulsivo (TOC)', ARRAY[
  'Obsessões: Pensamentos, impulsos ou imagens intrusivos e indesejados (medo de contaminação, dúvidas, pensamentos tabu)',
  'Compulsões: Comportamentos ou actos mentais repetitivos (lavar, verificar, organizar, contar) para reduzir a ansiedade'
]),
('Ansiedade Induzida por Substâncias', ARRAY[
  'Sintomas de ansiedade durante ou após o uso de substâncias (álcool, cafeína, cannabis, etc.)',
  'Sintomas de ansiedade durante a abstinência de substâncias'
]),
('Ansiedade Noturna', ARRAY[
  'Ataques de pânico ou crises de ansiedade durante a noite',
  'Dificuldade em adormecer devido a preocupações',
  'Despertar noturno com angústia ou apreensão',
  'Pensamentos catastróficos ao deitar ou acordar'
]),
('Ansiedade Antecipatória', ARRAY[
  'Preocupação excessiva sobre um evento ou situação futura',
  '"Catastrofização" (prever o pior resultado possível)',
  'Sintomas físicos de ansiedade ao pensar no futuro',
  'Evitação de planejamento ou pensamento sobre o futuro'
]),
('Transtorno de Ansiedade Mista com Depressão', ARRAY[
  'Sintomas de ansiedade persistentes (preocupação, tensão, nervosismo)',
  'Sintomas depressivos persistentes (humor deprimido, falta de prazer, falta de energia)',
  'Sofrimento clinicamente significativo / Prejuízo no funcionamento social, profissional ou outras áreas importantes'
]);

-- Alter psychologists table to add area_atendimento
ALTER TABLE public.psychologists 
ADD COLUMN area_atendimento text;

-- Alter patients table to replace reason with sintomas_selecionados
ALTER TABLE public.patients 
DROP COLUMN reason,
ADD COLUMN sintomas_selecionados text[] DEFAULT ARRAY[]::text[];