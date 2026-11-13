-- Verificação do CRP no Cadastro Nacional do CFP.
--
-- O admin consulta o site do CFP (que tem reCAPTCHA, então a busca é feita
-- por uma pessoa) e o painel guarda o que foi visto:
-- - antes de aprovar um cadastro, o CRP tem de estar ATIVO numa consulta
--   recente (a função psychologist-management confere);
-- - de rotina, a cada 6 meses, o painel lista quem precisa ser conferido.
--
-- Só a função psychologist-management (service role) grava esses dados.

-- 1. Situação atual, na própria linha do psicólogo.
ALTER TABLE public.psychologists
  ADD COLUMN IF NOT EXISTS crp_status text,
  ADD COLUMN IF NOT EXISTS crp_situacao text,
  ADD COLUMN IF NOT EXISTS crp_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS crp_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.psychologists DROP CONSTRAINT IF EXISTS psychologists_crp_status_check;
ALTER TABLE public.psychologists
  ADD CONSTRAINT psychologists_crp_status_check
  CHECK (crp_status IS NULL OR crp_status IN ('ativo', 'irregular', 'nao_encontrado'));

COMMENT ON COLUMN public.psychologists.crp_status IS
  'Última consulta ao CFP: ativo, irregular (cancelado, suspenso etc.) ou nao_encontrado. NULL = nunca conferido.';
COMMENT ON COLUMN public.psychologists.crp_situacao IS 'Situação exatamente como o CFP mostrou (ex.: ATIVO, CANCELADO).';

CREATE INDEX IF NOT EXISTS idx_psychologists_crp_verified_at ON public.psychologists (crp_verified_at);

-- 2. Histórico de todas as consultas (quem conferiu, quando e o que o CFP mostrou).
CREATE TABLE IF NOT EXISTS public.crp_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  psychologist_id uuid NOT NULL REFERENCES public.psychologists(id) ON DELETE CASCADE,
  crp_number text NOT NULL,
  status text NOT NULL CHECK (status IN ('ativo', 'irregular', 'nao_encontrado')),
  context text NOT NULL CHECK (context IN ('aprovacao', 'rotina')),
  cfp_situacao text,
  cfp_nome text,
  cfp_regiao text,
  cfp_registro text,
  cfp_inscricao text,
  notes text CHECK (notes IS NULL OR length(notes) <= 1000),
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crp_verifications_psychologist
  ON public.crp_verifications (psychologist_id, verified_at DESC);

ALTER TABLE public.crp_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins leem verificações de CRP" ON public.crp_verifications;
CREATE POLICY "Admins leem verificações de CRP"
  ON public.crp_verifications FOR SELECT TO authenticated
  USING (public.is_super_admin());

REVOKE ALL ON public.crp_verifications FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.crp_verifications FROM authenticated;

-- 3. O psicólogo não marca o próprio CRP como conferido, e trocar o número
--    do CRP apaga a verificação anterior (ela era de outro número).
CREATE OR REPLACE FUNCTION public.guard_psychologist_crp_verification()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user = 'authenticated' AND NOT public.is_super_admin() THEN
      NEW.crp_status := NULL;
      NEW.crp_situacao := NULL;
      NEW.crp_verified_at := NULL;
      NEW.crp_verified_by := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF current_user = 'authenticated' AND NOT public.is_super_admin() THEN
    NEW.crp_status := OLD.crp_status;
    NEW.crp_situacao := OLD.crp_situacao;
    NEW.crp_verified_at := OLD.crp_verified_at;
    NEW.crp_verified_by := OLD.crp_verified_by;
  END IF;

  IF NEW.crp_number IS DISTINCT FROM OLD.crp_number THEN
    NEW.crp_status := NULL;
    NEW.crp_situacao := NULL;
    NEW.crp_verified_at := NULL;
    NEW.crp_verified_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_psychologist_crp_verification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_psychologist_crp_verification() TO service_role;

-- Nome com "b_": roda depois de a_guard_psychologist_client_write.
DROP TRIGGER IF EXISTS b_guard_psychologist_crp_verification ON public.psychologists;
CREATE TRIGGER b_guard_psychologist_crp_verification
  BEFORE INSERT OR UPDATE ON public.psychologists
  FOR EACH ROW EXECUTE FUNCTION public.guard_psychologist_crp_verification();
