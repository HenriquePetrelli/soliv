-- Adicionar colunas PIX na tabela psychologists
ALTER TABLE public.psychologists 
ADD COLUMN pix_key text,
ADD COLUMN pix_type text;