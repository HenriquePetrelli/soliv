-- Corrigir warnings de segurança adicionando search_path
CREATE OR REPLACE FUNCTION public.get_psychologist_document_url(document_path text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar se é admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem acessar documentos.';
  END IF;
  
  -- Esta função será chamada pelo frontend que então criará a URL assinada
  RETURN document_path;
END;
$$;

-- Adicionar a coluna rejection_reason que estava faltando na tabela psychologists
ALTER TABLE public.psychologists 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;