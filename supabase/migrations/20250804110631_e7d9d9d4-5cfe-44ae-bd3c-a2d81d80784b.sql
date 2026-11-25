-- Adicionar novos campos à tabela psychologists
ALTER TABLE public.psychologists
ADD COLUMN state TEXT,
ADD COLUMN city TEXT,
ADD COLUMN accepts_presential BOOLEAN DEFAULT FALSE,
ADD COLUMN address TEXT,
ADD COLUMN document_url TEXT;

-- Adicionar comentários para documentar os novos campos
COMMENT ON COLUMN public.psychologists.state IS 'Estado onde o psicólogo atua';
COMMENT ON COLUMN public.psychologists.city IS 'Cidade onde o psicólogo atua';
COMMENT ON COLUMN public.psychologists.accepts_presential IS 'Indica se o psicólogo aceita atendimento presencial';
COMMENT ON COLUMN public.psychologists.address IS 'Endereço do consultório (obrigatório se accepts_presential = true)';
COMMENT ON COLUMN public.psychologists.document_url IS 'URL do documento comprobatório (CRP/Identidade/CNH) enviado pelo psicólogo';