-- Cadastro só com código de convite (até o lançamento)
--
-- Enquanto o app está em teste, só quem tem o código de convite cria conta
-- (paciente ou psicólogo). O código fica em app_settings, que o app não lê;
-- o app só pergunta se o cadastro está fechado e se um código vale.
--
-- Fechar o cadastro (ou trocar o código):
--   UPDATE public.app_settings SET signup_invite_code = 'SOLIV-XXXX', updated_at = now();
-- Abrir o cadastro para todos (lançamento):
--   UPDATE public.app_settings SET signup_invite_code = NULL, updated_at = now();
--
-- Sem código (NULL, o padrão desta migration) o cadastro fica aberto como antes;
-- o Supabase local e os testes não mudam.
--
-- Quem confere de verdade é o gatilho antes de criar a conta em auth.users:
-- sem o código certo, a conta não é criada. Vale também para contas criadas
-- pelo painel do Supabase ou pela API de admin (passar o código nos dados do
-- usuário, `signup_invite_code`, ou abrir o cadastro por um momento).

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS signup_invite_code text;

-- Mesma forma de comparar em todo lugar: sem espaços e em maiúsculas.
CREATE OR REPLACE FUNCTION public.normalize_signup_invite_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT NULLIF(upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g')), '');
$function$;

-- O cadastro está fechado? (o app mostra o campo do código só quando está)
CREATE OR REPLACE FUNCTION public.signup_invite_required()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.normalize_signup_invite_code(
    (SELECT signup_invite_code FROM public.app_settings WHERE id = true)
  ) IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.signup_invite_required() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_invite_required() TO anon, authenticated, service_role;

-- Tentativas por IP (ou por conta): 10 a cada 15 min, contra quem tenta adivinhar.
CREATE OR REPLACE FUNCTION public.signup_invite_attempt_allowed()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_who text := auth.uid()::text;
BEGIN
  IF v_who IS NULL THEN
    BEGIN
      v_who := split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1);
    EXCEPTION WHEN others THEN
      v_who := NULL;
    END;
  END IF;
  RETURN public.check_rate_limit('codigo-convite:' || COALESCE(NULLIF(btrim(v_who), ''), 'anon'), 10, 900);
END;
$function$;

REVOKE ALL ON FUNCTION public.signup_invite_attempt_allowed() FROM PUBLIC, anon, authenticated;

-- O código digitado vale? {valid: true} ou {valid: false, error: 'invalid' | 'too_many_attempts'}.
CREATE OR REPLACE FUNCTION public.check_signup_invite_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_expected text := public.normalize_signup_invite_code(
    (SELECT signup_invite_code FROM public.app_settings WHERE id = true)
  );
BEGIN
  IF v_expected IS NULL THEN
    RETURN jsonb_build_object('valid', true);
  END IF;
  IF NOT public.signup_invite_attempt_allowed() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'too_many_attempts');
  END IF;
  IF public.normalize_signup_invite_code(p_code) = v_expected THEN
    RETURN jsonb_build_object('valid', true);
  END IF;
  RETURN jsonb_build_object('valid', false, 'error', 'invalid');
END;
$function$;

REVOKE ALL ON FUNCTION public.check_signup_invite_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_signup_invite_code(text) TO anon, authenticated, service_role;

-- Antes de criar a conta: sem o código certo, recusa. O código não fica
-- guardado nos dados do usuário.
CREATE OR REPLACE FUNCTION public.enforce_signup_invite_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_expected text := public.normalize_signup_invite_code(
    (SELECT signup_invite_code FROM public.app_settings WHERE id = true)
  );
  v_given text := public.normalize_signup_invite_code(NEW.raw_user_meta_data ->> 'signup_invite_code');
BEGIN
  IF v_expected IS NOT NULL AND v_given IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'signup_invite_code_required'
      USING HINT = 'O cadastro está fechado: só com o código de convite.';
  END IF;
  IF NEW.raw_user_meta_data ? 'signup_invite_code' THEN
    NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'signup_invite_code';
  END IF;
  RETURN NEW;
END;
$function$;

-- Só o gatilho usa (o app não chama).
REVOKE ALL ON FUNCTION public.enforce_signup_invite_code() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_signup_invite ON auth.users;
CREATE TRIGGER on_auth_user_signup_invite
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_signup_invite_code();
