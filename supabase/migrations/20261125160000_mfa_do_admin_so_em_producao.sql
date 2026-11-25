-- Verificação em duas etapas do admin só em produção
--
-- O código do app autenticador é pedido ao admin quando
-- app_settings.environment = 'production'. Em 'test' (fase de teste), o admin
-- entra só com a senha. No lançamento:
--
--   UPDATE public.app_settings SET environment = 'production', updated_at = now();
--
-- Não depende mais do código de convite do cadastro (que pode continuar
-- ligado em produção sem desligar o código do admin).
--
-- Na dúvida (sem a linha de app_settings ou valor vazio), vale produção e o
-- código é exigido.
--
-- Tudo passa por esta função: is_super_admin, get_login_state, a tela de
-- login e as funções de admin (supabase/functions/_shared/adminMfa.ts).

CREATE OR REPLACE FUNCTION public.admin_mfa_required()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(environment), '') FROM public.app_settings WHERE id = true),
    'production'
  ) <> 'test';
$function$;

GRANT EXECUTE ON FUNCTION public.admin_mfa_required() TO anon, authenticated, service_role;

COMMENT ON COLUMN public.app_settings.environment IS
  '''test'' ou ''production''. Em ''production'' o admin precisa do código do app autenticador (admin_mfa_required).';
