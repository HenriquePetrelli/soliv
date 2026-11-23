-- Verificação em duas etapas do admin segue o código de convite do cadastro
--
-- Enquanto o cadastro pede o código de convite (app em teste), o admin entra
-- só com a senha. Quando o cadastro abre para todos (signup_invite_code NULL,
-- no lançamento), o código do app autenticador passa a ser exigido sozinho:
--
--   UPDATE public.app_settings SET signup_invite_code = NULL, updated_at = now();
--
-- Antes dependia de app_settings.environment ('test' ou 'production'), que
-- precisava ser trocado à parte. A coluna fica, mas não decide mais nada.
--
-- Na dúvida (sem a linha de app_settings), signup_invite_required() é false
-- e o código continua sendo exigido.
--
-- Tudo passa por esta função: is_super_admin, get_login_state, a tela de
-- login e as funções de admin (supabase/functions/_shared/adminMfa.ts).

CREATE OR REPLACE FUNCTION public.admin_mfa_required()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT NOT COALESCE(public.signup_invite_required(), false);
$function$;

GRANT EXECUTE ON FUNCTION public.admin_mfa_required() TO anon, authenticated, service_role;

COMMENT ON COLUMN public.app_settings.environment IS
  'Sem uso desde 2026-11-23: a verificação em duas etapas do admin segue signup_invite_code (admin_mfa_required).';
