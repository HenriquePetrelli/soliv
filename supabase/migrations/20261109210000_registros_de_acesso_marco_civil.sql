-- Registros de acesso (Marco Civil da Internet, Lei 12.965/2014, art. 15)
--
-- O provedor de aplicação precisa guardar, por 6 meses, a data e a hora de
-- uso do app a partir de cada endereço IP. Os logs do próprio Supabase duram
-- bem menos que isso (mesmo no plano Pro), então os acessos ficam numa tabela
-- nossa:
--
-- 1) Login: um gatilho em auth.sessions grava uma linha a cada sessão nova,
--    com o IP e o navegador que o servidor de autenticação registrou. Não
--    depende do app.
-- 2) Uso: o app chama register_access() ao abrir e ao voltar para a tela. O
--    IP vem dos cabeçalhos da requisição (o app não informa nada). No máximo
--    uma linha a cada 30 minutos por pessoa e IP.
-- 3) Guarda: 7 meses (os 6 da lei + 1 de folga); a rotina purge-access-logs
--    apaga o que passar disso todos os dias.
-- 4) Os registros ficam mesmo depois que a conta é excluída (obrigação legal,
--    LGPD art. 16, I): por isso user_id não tem chave estrangeira e o e-mail
--    do momento do acesso é copiado.
-- 5) Ninguém lê a tabela direto. O admin consulta e exporta pelo painel, com
--    MFA (is_super_admin), e cada consulta e exportação fica na Auditoria.
--
-- Limitação: o Supabase não informa a porta de origem da conexão, que os
-- tribunais pedem quando a operadora compartilha o IP (CGNAT).

CREATE TABLE IF NOT EXISTS public.access_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid,                -- sem FK: o registro sobrevive à exclusão da conta
  email text,                  -- e-mail no momento do acesso
  event text NOT NULL CHECK (event IN ('login', 'app_open')),
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON public.access_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_user ON public.access_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_email ON public.access_logs (lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_ip ON public.access_logs (ip_address, created_at DESC);

ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;
-- Sem nenhuma policy: pacientes, psicólogos e o próprio admin não leem nem
-- alteram a tabela pela API. Só as funções abaixo e o service role.
REVOKE ALL ON public.access_logs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.access_logs TO service_role;

-- Texto -> inet sem erro (valor inválido vira NULL).
CREATE OR REPLACE FUNCTION public.safe_inet(p_value text)
RETURNS inet
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN btrim(p_value)::inet;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$function$;

-- IP de quem fez a requisição à API. cf-connecting-ip e x-real-ip são
-- preenchidos pela infraestrutura (o valor enviado pelo cliente é
-- substituído); o primeiro item de x-forwarded-for fica por último porque o
-- cliente consegue pôr qualquer coisa ali.
CREATE OR REPLACE FUNCTION public.request_client_ip()
RETURNS inet
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_headers jsonb;
BEGIN
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  IF v_headers IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN COALESCE(
    public.safe_inet(v_headers ->> 'cf-connecting-ip'),
    public.safe_inet(v_headers ->> 'x-real-ip'),
    public.safe_inet(split_part(v_headers ->> 'x-forwarded-for', ',', 1))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.request_client_ip() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1) Uso do app (chamado pelo app ao abrir e ao voltar para a tela)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_access()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ip inet;
  v_agent text;
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  v_ip := public.request_client_ip();
  BEGIN
    v_agent := left(NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'user-agent', 500);
  EXCEPTION WHEN others THEN
    v_agent := NULL;
  END;

  -- Mesmo IP nos últimos 30 minutos, ou qualquer registro no último minuto:
  -- nada novo a guardar (e a tabela não enche com chamadas repetidas).
  IF EXISTS (
    SELECT 1 FROM public.access_logs l
    WHERE l.user_id = v_uid
      AND (
        (l.created_at > now() - interval '30 minutes' AND l.ip_address IS NOT DISTINCT FROM v_ip)
        OR l.created_at > now() - interval '1 minute'
      )
  ) THEN
    RETURN false;
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_uid;

  INSERT INTO public.access_logs (user_id, email, event, ip_address, user_agent)
  VALUES (v_uid, v_email, 'app_open', v_ip, v_agent);
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.register_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_access() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Login (gatilho em auth.sessions)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_session_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row jsonb;
BEGIN
  -- Nunca impede o login: qualquer erro aqui só vira aviso no log.
  BEGIN
    -- to_jsonb: ip e user_agent só existem nas versões mais novas do Auth.
    v_row := to_jsonb(NEW);
    INSERT INTO public.access_logs (user_id, email, event, ip_address, user_agent, created_at)
    SELECT NEW.user_id, u.email, 'login',
           public.safe_inet(v_row ->> 'ip'),
           left(v_row ->> 'user_agent', 500),
           COALESCE((v_row ->> 'created_at')::timestamptz, now())
    FROM auth.users u
    WHERE u.id = NEW.user_id;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'log_session_login: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.log_session_login() FROM PUBLIC, anon, authenticated;

DO $trigger$
BEGIN
  DROP TRIGGER IF EXISTS on_auth_session_access_log ON auth.sessions;
  CREATE TRIGGER on_auth_session_access_log
    AFTER INSERT ON auth.sessions
    FOR EACH ROW EXECUTE FUNCTION public.log_session_login();
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  -- Sem permissão no schema auth: o registro de uso pelo app continua
  -- valendo (ele também roda logo depois do login).
  RAISE NOTICE 'Gatilho de login em auth.sessions não criado: %', SQLERRM;
END
$trigger$;

-- ---------------------------------------------------------------------------
-- 3) Guarda de 7 meses
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_access_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total integer := 0;
  v_batch integer;
BEGIN
  -- Em lotes, para não travar a tabela por muito tempo.
  LOOP
    DELETE FROM public.access_logs
    WHERE id IN (
      SELECT id FROM public.access_logs
      WHERE created_at < now() - interval '7 months'
      LIMIT 10000
    );
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v_total := v_total + v_batch;
    EXIT WHEN v_batch < 10000;
  END LOOP;
  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_access_logs() FROM PUBLIC, anon, authenticated;

DO $cron$
BEGIN
  PERFORM cron.unschedule('purge-access-logs')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-access-logs');
  PERFORM cron.schedule('purge-access-logs', '43 4 * * *', 'SELECT public.purge_access_logs();');
END
$cron$;

-- ---------------------------------------------------------------------------
-- 4) Consulta e exportação pelo admin (cada uma fica na Auditoria)
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_target_type_check;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_target_type_check
  CHECK (target_type = ANY (ARRAY['patient', 'psychologist', 'group_testimonial', 'testimonial_report', 'organization', 'organization_member', 'access_log']));

-- Filtro comum: busca por e-mail (parte), ID da conta ou IP exatos; período
-- [p_from, p_to); tipo de evento.
CREATE OR REPLACE FUNCTION public.access_logs_filtered(
  p_search text,
  p_from timestamptz,
  p_to timestamptz,
  p_event text
)
RETURNS SETOF public.access_logs
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_uuid uuid;
  v_ip inet;
BEGIN
  IF v_search IS NOT NULL THEN
    BEGIN
      v_uuid := v_search::uuid;
    EXCEPTION WHEN others THEN
      v_uuid := NULL;
    END;
    v_ip := public.safe_inet(v_search);
  END IF;

  RETURN QUERY
  SELECT l.*
  FROM public.access_logs l
  WHERE (p_from IS NULL OR l.created_at >= p_from)
    AND (p_to IS NULL OR l.created_at < p_to)
    AND (NULLIF(p_event, '') IS NULL OR l.event = p_event)
    AND (
      v_search IS NULL
      OR (v_uuid IS NOT NULL AND l.user_id = v_uuid)
      OR (v_ip IS NOT NULL AND l.ip_address = v_ip)
      OR (v_uuid IS NULL AND v_ip IS NULL AND position(lower(v_search) IN lower(COALESCE(l.email, ''))) > 0)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.access_logs_filtered(text, timestamptz, timestamptz, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_access_logs(
  p_search text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_event text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id bigint,
  user_id uuid,
  email text,
  user_name text,
  event text,
  ip_address text,
  user_agent text,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.' USING ERRCODE = '42501';
  END IF;

  -- Cada busca nova (primeira página) fica registrada; "carregar mais" não.
  IF v_offset = 0 THEN
    INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_name, details)
    VALUES (
      auth.uid(), 'view_access_logs', 'access_log', NULLIF(btrim(COALESCE(p_search, '')), ''),
      jsonb_strip_nulls(jsonb_build_object('search', NULLIF(btrim(COALESCE(p_search, '')), ''), 'from', p_from, 'to', p_to, 'event', NULLIF(p_event, '')))
    );
  END IF;

  RETURN QUERY
  SELECT f.id, f.user_id, f.email, p.full_name, f.event, host(f.ip_address), f.user_agent, f.created_at,
         count(*) OVER ()
  FROM public.access_logs_filtered(p_search, p_from, p_to, p_event) f
  LEFT JOIN public.profiles p ON p.user_id = f.user_id
  ORDER BY f.created_at DESC, f.id DESC
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_access_logs(text, timestamptz, timestamptz, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_access_logs(text, timestamptz, timestamptz, text, int, int) TO authenticated;

-- Exportação: exige um motivo (ex.: "ordem judicial nº ...") e devolve no
-- máximo 50 mil linhas; acima disso o admin precisa estreitar a busca.
CREATE OR REPLACE FUNCTION public.admin_export_access_logs(
  p_reason text,
  p_search text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_event text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  user_id uuid,
  email text,
  user_name text,
  event text,
  ip_address text,
  user_agent text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_count bigint;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.' USING ERRCODE = '42501';
  END IF;
  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'EXPORT_REASON_REQUIRED' USING ERRCODE = '22023', HINT = 'Informe o motivo da exportação.';
  END IF;

  SELECT count(*) INTO v_count FROM public.access_logs_filtered(p_search, p_from, p_to, p_event);
  IF v_count > 50000 THEN
    RAISE EXCEPTION 'EXPORT_TOO_LARGE' USING ERRCODE = '22023', DETAIL = v_count::text,
      HINT = 'Mais de 50 mil registros: diminua o período ou filtre por pessoa.';
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_name, details)
  VALUES (
    auth.uid(), 'export_access_logs', 'access_log', NULLIF(btrim(COALESCE(p_search, '')), ''),
    jsonb_strip_nulls(jsonb_build_object(
      'reason', left(v_reason, 500), 'row_count', v_count,
      'search', NULLIF(btrim(COALESCE(p_search, '')), ''), 'from', p_from, 'to', p_to, 'event', NULLIF(p_event, '')
    ))
  );

  RETURN QUERY
  SELECT f.id, f.user_id, f.email, p.full_name, f.event, host(f.ip_address), f.user_agent, f.created_at
  FROM public.access_logs_filtered(p_search, p_from, p_to, p_event) f
  LEFT JOIN public.profiles p ON p.user_id = f.user_id
  ORDER BY f.created_at DESC, f.id DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_export_access_logs(text, text, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_export_access_logs(text, text, timestamptz, timestamptz, text) TO authenticated;
