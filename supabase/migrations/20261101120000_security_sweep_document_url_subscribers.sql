-- Varredura de segurança (2026-11-01).
--
-- 1) Link do documento do psicólogo só pode ser https:// (ou um caminho do
--    armazenamento, sem esquema). Antes do cadastro ser aprovado o psicólogo
--    edita a própria linha, e o painel do admin abre `document_url` em nova
--    aba: um valor `javascript:...` rodava script na sessão do admin (que tem
--    a verificação em duas etapas feita), ou seja, tomava a conta de admin.
--    Vale para qualquer caminho de escrita (app, RPC, edge function).
--
-- 2) `subscribers`: a leitura pelo e-mail do token só vale para linha ainda
--    sem dono. Um e-mail reaproveitado (a pessoa trocou de e-mail e outra se
--    cadastrou com o antigo) não mostra mais o plano e os contadores alheios.

CREATE OR REPLACE FUNCTION public.validate_psychologist_document_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_link text;
BEGIN
  IF NEW.document_url IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.document_url IS DISTINCT FROM OLD.document_url)
     AND NEW.document_url ~* '^\s*[a-z][a-z0-9+.-]*:'
     AND NEW.document_url !~* '^https://' THEN
    RAISE EXCEPTION 'Link do documento inválido: use o envio de arquivo do app.' USING ERRCODE = '22023';
  END IF;

  IF NEW.documents IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.documents IS DISTINCT FROM OLD.documents) THEN
    FOREACH v_link IN ARRAY NEW.documents LOOP
      IF v_link ~* '^\s*[a-z][a-z0-9+.-]*:' AND v_link !~* '^https://' THEN
        RAISE EXCEPTION 'Link do documento inválido: use o envio de arquivo do app.' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_psychologist_document_links ON public.psychologists;
CREATE TRIGGER validate_psychologist_document_links
  BEFORE INSERT OR UPDATE OF document_url, documents ON public.psychologists
  FOR EACH ROW EXECUTE FUNCTION public.validate_psychologist_document_links();

-- Valores antigos perigosos (se houver) deixam de ser clicáveis.
UPDATE public.psychologists
SET document_url = NULL
WHERE document_url ~* '^\s*[a-z][a-z0-9+.-]*:' AND document_url !~* '^https://';

DROP POLICY IF EXISTS select_own_subscription ON public.subscribers;
CREATE POLICY select_own_subscription ON public.subscribers
  FOR SELECT
  USING (user_id = auth.uid() OR (user_id IS NULL AND email = auth.email()));
