-- Remover o trigger problemático que está causando erro
DROP TRIGGER IF EXISTS update_private_journals_updated_at ON public.private_journals;

-- Criar trigger correto usando o nome da coluna atual (atualizado_em)
CREATE OR REPLACE FUNCTION public.update_private_journals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar novo trigger com o nome correto da coluna
CREATE TRIGGER update_private_journals_updated_at
BEFORE UPDATE ON public.private_journals
FOR EACH ROW
EXECUTE FUNCTION public.update_private_journals_updated_at();