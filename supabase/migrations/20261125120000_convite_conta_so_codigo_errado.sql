-- Código de convite e código da empresa: a trava conta só código ERRADO
--
-- O problema: check_signup_invite_code chamava check_rate_limit em toda
-- conferência, inclusive com o código certo. O app confere ao sair do campo e
-- de novo ao enviar o formulário (e a cada envio que volta por outro campo
-- errado), então cada cadastro gastava 2 a 4 das 10 tentativas de 15 minutos.
-- Quem cria várias contas na mesma rede (Wi-Fi da casa, do escritório, ou o
-- 4G, em que muita gente sai pelo mesmo IP) via "Espere 15 minutos" depois de
-- 3 ou 4 cadastros, com o código certo.
--
-- Agora:
--   * código certo nunca conta; cadastros ilimitados com o código certo;
--   * código errado conta: 10 erros em 15 min por IP bloqueiam (contra quem
--     tenta adivinhar), igual a antes;
--   * o IP vem de x-forwarded-for, x-real-ip ou cf-connecting-ip (antes só do
--     primeiro; sem nenhum, todo mundo dividia a mesma conta "anon").
-- O mesmo vale para o código da empresa (20 erros em 15 min).

-- Quem está pedindo: a conta (se logada) ou o IP.
CREATE OR REPLACE FUNCTION public.request_client_key()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_headers json;
  v_ip text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN auth.uid()::text;
  END IF;
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  v_ip := COALESCE(
    NULLIF(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
    NULLIF(btrim(v_headers ->> 'x-real-ip'), ''),
    NULLIF(btrim(v_headers ->> 'cf-connecting-ip'), '')
  );
  RETURN COALESCE(v_ip, 'anon');
END;
$function$;

REVOKE ALL ON FUNCTION public.request_client_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_client_key() TO service_role;

-- O limite já foi atingido? Só lê, não conta.
CREATE OR REPLACE FUNCTION public.rate_limit_reached(p_key text, p_max_requests int, p_window_seconds int)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.rate_limits
    WHERE key = p_key
      AND window_start > now() - make_interval(secs => p_window_seconds)
      AND count >= p_max_requests
  );
$function$;

REVOKE ALL ON FUNCTION public.rate_limit_reached(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_reached(text, int, int) TO service_role;

-- Ainda pode tentar? (só lê; o erro é contado em check_signup_invite_code)
CREATE OR REPLACE FUNCTION public.signup_invite_attempt_allowed()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT NOT public.rate_limit_reached('codigo-convite:' || public.request_client_key(), 10, 900);
$function$;

REVOKE ALL ON FUNCTION public.signup_invite_attempt_allowed() FROM PUBLIC, anon, authenticated;

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
  v_key text;
BEGIN
  IF v_expected IS NULL THEN
    RETURN jsonb_build_object('valid', true);
  END IF;
  v_key := 'codigo-convite:' || public.request_client_key();
  IF public.rate_limit_reached(v_key, 10, 900) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'too_many_attempts');
  END IF;
  IF public.normalize_signup_invite_code(p_code) = v_expected THEN
    RETURN jsonb_build_object('valid', true);
  END IF;
  PERFORM public.check_rate_limit(v_key, 10, 900);
  RETURN jsonb_build_object('valid', false, 'error', 'invalid');
END;
$function$;

REVOKE ALL ON FUNCTION public.check_signup_invite_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_signup_invite_code(text) TO anon, authenticated, service_role;

-- Código da empresa: mesma regra.
CREATE OR REPLACE FUNCTION public.organization_code_attempt_allowed()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT NOT public.rate_limit_reached('codigo-empresa:' || public.request_client_key(), 20, 900);
$function$;

REVOKE ALL ON FUNCTION public.organization_code_attempt_allowed() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_organization_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_key text := 'codigo-empresa:' || public.request_client_key();
BEGIN
  IF public.rate_limit_reached(v_key, 20, 900) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'too_many_attempts');
  END IF;
  SELECT * INTO v_org FROM public.organizations WHERE invite_code = public.normalize_invite_code(p_code);
  IF NOT FOUND THEN
    PERFORM public.check_rate_limit(v_key, 20, 900);
    RETURN jsonb_build_object('valid', false, 'error', 'invalid_code');
  END IF;
  IF v_org.status <> 'active' OR v_org.starts_on > v_today OR (v_org.ends_on IS NOT NULL AND v_org.ends_on < v_today) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'inactive');
  END IF;
  RETURN jsonb_build_object('valid', true, 'organization', v_org.name, 'tier', v_org.plan_tier, 'domain', v_org.allowed_email_domain);
END;
$function$;

REVOKE ALL ON FUNCTION public.check_organization_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_organization_code(text) TO anon, authenticated, service_role;

-- Destrava agora quem ficou preso pela regra antiga.
DELETE FROM public.rate_limits WHERE key LIKE 'codigo-convite:%' OR key LIKE 'codigo-empresa:%';
