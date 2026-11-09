-- 1) Ambiente do app (teste ou produção) e verificação em duas etapas do admin
--
-- Enquanto o app está em teste (Stripe no modo de teste, sem usuários reais),
-- o admin entra só com a senha: o código do app autenticador é pedido apenas
-- em produção. A troca é uma linha só, no lançamento:
--
--   UPDATE public.app_settings SET environment = 'production', updated_at = now();
--
-- Sem a linha (ou com qualquer erro na leitura), vale produção: na dúvida,
-- o código continua sendo exigido.

CREATE TABLE IF NOT EXISTS public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  environment text NOT NULL DEFAULT 'test' CHECK (environment IN ('test', 'production')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (id, environment) VALUES (true, 'test')
ON CONFLICT (id) DO NOTHING;

-- Ninguém lê nem altera pela API: só as funções abaixo e o service role.
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_settings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_mfa_required()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT environment FROM public.app_settings WHERE id = true), 'production') <> 'test';
$function$;

GRANT EXECUTE ON FUNCTION public.admin_mfa_required() TO anon, authenticated, service_role;

-- Mesmo is_super_admin de antes; em teste, o token sem o código (aal1) também vale.
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id_param uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE user_id = user_id_param
        AND is_active = true
    ),
    false
  )
  AND (
    user_id_param IS DISTINCT FROM auth.uid()
    OR COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'
    OR NOT public.admin_mfa_required()
  );
$function$;

-- get_login_state passa a dizer também se o código é exigido.
CREATE OR REPLACE FUNCTION public.get_login_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'is_admin', EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = v_uid AND au.is_active = true),
    'admin_verified', public.is_super_admin(v_uid),
    'admin_mfa_required', public.admin_mfa_required(),
    'profile', (
      SELECT jsonb_build_object('user_type', p.user_type::text, 'full_name', p.full_name)
      FROM public.profiles p WHERE p.user_id = v_uid LIMIT 1
    ),
    'patient', (
      SELECT jsonb_build_object('is_blocked', pt.is_blocked, 'blocked_until', pt.blocked_until, 'blocked_reason', pt.blocked_reason, 'blocked_at', pt.blocked_at)
      FROM public.patients pt WHERE pt.user_id = v_uid LIMIT 1
    ),
    'psychologist', (
      SELECT jsonb_build_object(
        'approved', ps.approved, 'approval_status', ps.approval_status,
        'is_blocked', ps.is_blocked, 'blocked_until', ps.blocked_until, 'blocked_reason', ps.blocked_reason, 'blocked_at', ps.blocked_at)
      FROM public.psychologists ps WHERE ps.user_id = v_uid LIMIT 1
    ),
    'registration', (
      SELECT jsonb_build_object('status', r.status, 'rejected_at', r.rejected_at, 'rejection_reason', r.rejection_reason)
      FROM public.psychologist_registrations r WHERE r.user_id = v_uid LIMIT 1
    ),
    'rejection', (
      SELECT to_jsonb(x) FROM public.get_psychologist_rejection_status_unchecked(v_uid) x LIMIT 1
    )
  );
END;
$function$;

-- 2) Bloqueio de conta: aviso na tela de login e saída imediata
--
-- Conta bloqueada não consegue entrar (o login do Supabase recusa), então a
-- tela de login não tinha como mostrar o motivo e o tempo. Esta função, usada
-- só pela edge function account-block-status (service role), confere e-mail e
-- senha e devolve o bloqueio, se houver. Senha errada ou conta sem bloqueio:
-- nada (não revela se o e-mail existe nem o motivo para quem não é o dono).

CREATE OR REPLACE FUNCTION public.account_block_status(p_email text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user auth.users%ROWTYPE;
  v_block jsonb;
BEGIN
  IF p_email IS NULL OR p_password IS NULL OR length(p_password) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_user FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;

  IF v_user.id IS NULL OR v_user.encrypted_password IS NULL OR v_user.encrypted_password = '' THEN
    RETURN NULL;
  END IF;
  IF extensions.crypt(p_password, v_user.encrypted_password) <> v_user.encrypted_password THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object('is_blocked', b.is_blocked, 'blocked_until', b.blocked_until, 'blocked_reason', b.blocked_reason, 'blocked_at', b.blocked_at)
  INTO v_block
  FROM (
    SELECT is_blocked, blocked_until, blocked_reason, blocked_at FROM public.patients WHERE user_id = v_user.id
    UNION ALL
    SELECT is_blocked, blocked_until, blocked_reason, blocked_at FROM public.psychologists WHERE user_id = v_user.id
  ) b
  WHERE b.is_blocked = true AND (b.blocked_until IS NULL OR b.blocked_until > now())
  LIMIT 1;

  RETURN v_block;
END;
$function$;

REVOKE ALL ON FUNCTION public.account_block_status(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_block_status(text, text) TO service_role;

-- Encerra todas as sessões da conta (o token de renovação deixa de valer).
-- Usada pelas funções de bloqueio do admin, junto com a suspensão do login.
CREATE OR REPLACE FUNCTION public.admin_revoke_user_sessions(p_user_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
$function$;

REVOKE ALL ON FUNCTION public.admin_revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user_sessions(uuid) TO service_role;
