-- Teste dos registros de acesso (Marco Civil, art. 15) — migration
-- 20261109210000_registros_de_acesso_marco_civil.sql.
--
-- Roda contra um Postgres com o schema aplicado:
--   supabase start
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -f supabase/tests/access_logs.sql
-- Tudo roda numa transação desfeita no final; qualquer falha interrompe com
-- "FALHOU: ...".

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'paciente@teste.local'),
  ('b0000000-0000-0000-0000-00000000000b', 'admin@teste.local');
INSERT INTO public.admin_users (user_id) VALUES ('b0000000-0000-0000-0000-00000000000b');

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_uid uuid, p_ip text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  PERFORM set_config('request.headers', json_build_object('x-forwarded-for', '6.6.6.6, ' || p_ip, 'cf-connecting-ip', p_ip, 'user-agent', 'Teste/1.0')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.check(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT p_ok THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
  RAISE NOTICE 'ok: %', p_msg;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.log_count() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.access_logs WHERE user_id = 'a0000000-0000-0000-0000-00000000000a'
$$;

-- 1. Login pelo servidor de autenticação vira registro
INSERT INTO auth.sessions (user_id, ip, user_agent) VALUES ('a0000000-0000-0000-0000-00000000000a', '200.10.20.30', 'Android');
SELECT pg_temp.check(
  (SELECT count(*) FROM public.access_logs WHERE event = 'login' AND email = 'paciente@teste.local' AND ip_address = '200.10.20.30') = 1,
  'login grava data, e-mail e IP');

-- 2. Logo depois do login não repete (menos de 1 minuto); depois disso, uso
--    do app grava com o IP do cabeçalho, não o que o cliente pôs em x-forwarded-for
SELECT pg_temp.act_as('a0000000-0000-0000-0000-00000000000a', '187.1.2.3');
SELECT pg_temp.check(NOT public.register_access(), 'logo após o login não duplica');
RESET role;
UPDATE public.access_logs SET created_at = now() - interval '2 minutes' WHERE event = 'login';
SELECT pg_temp.act_as('a0000000-0000-0000-0000-00000000000a', '187.1.2.3');
SELECT pg_temp.check(public.register_access(), 'abrir o app grava registro');
RESET role;
SELECT pg_temp.check(
  (SELECT ip_address FROM public.access_logs WHERE event = 'app_open') = '187.1.2.3'::inet,
  'IP vem de cf-connecting-ip');

-- 3. Repetição em menos de 30 min (mesmo IP) não grava de novo
SELECT pg_temp.act_as('a0000000-0000-0000-0000-00000000000a', '187.1.2.3');
SELECT pg_temp.check(NOT public.register_access(), 'mesmo IP em 30 min não repete');
RESET role;
SELECT pg_temp.check(pg_temp.log_count() = 2, 'continua com 2 registros');

-- 4. IP novo grava (passado o limite de 1 minuto)
UPDATE public.access_logs SET created_at = now() - interval '2 minutes' WHERE event = 'app_open';
SELECT pg_temp.act_as('a0000000-0000-0000-0000-00000000000a', '187.9.9.9');
SELECT pg_temp.check(public.register_access(), 'IP diferente grava');

-- 5. Usuário comum não lê a tabela nem a consulta do admin
DO $$
BEGIN
  PERFORM 1 FROM public.access_logs;
  RAISE EXCEPTION 'FALHOU: paciente leu access_logs';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok: paciente não lê access_logs';
END $$;
DO $$
BEGIN
  PERFORM 1 FROM public.admin_get_access_logs();
  RAISE EXCEPTION 'FALHOU: paciente usou a consulta do admin';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'ok: paciente não usa a consulta do admin';
END $$;

-- 6. Admin busca por e-mail, ID e IP; cada busca nova vai para a Auditoria
SELECT pg_temp.act_as('b0000000-0000-0000-0000-00000000000b', '10.0.0.1');
SELECT pg_temp.check((SELECT count(*) FROM public.admin_get_access_logs('PACIENTE@teste')) = 3, 'busca por parte do e-mail');
SELECT pg_temp.check((SELECT count(*) FROM public.admin_get_access_logs('a0000000-0000-0000-0000-00000000000a')) = 3, 'busca por ID');
SELECT pg_temp.check((SELECT count(*) FROM public.admin_get_access_logs('187.9.9.9')) = 1, 'busca por IP');
SELECT pg_temp.check((SELECT max(total_count) FROM public.admin_get_access_logs('paciente', p_limit => 1)) = 3, 'total vem junto da página');
SELECT pg_temp.check((SELECT count(*) FROM public.admin_get_access_logs('paciente', p_offset => 50)) = 0, 'carregar mais');

-- 7. Exportação exige motivo e fica registrada com o número de linhas
DO $$
BEGIN
  PERFORM 1 FROM public.admin_export_access_logs('');
  RAISE EXCEPTION 'FALHOU: exportou sem motivo';
EXCEPTION WHEN invalid_parameter_value THEN
  RAISE NOTICE 'ok: exportação sem motivo é recusada';
END $$;
SELECT pg_temp.check((SELECT count(*) FROM public.admin_export_access_logs('Ordem judicial 123', 'paciente')) = 3, 'exporta as linhas da busca');
RESET role;
SELECT pg_temp.check((SELECT count(*) FROM public.admin_audit_log WHERE action = 'view_access_logs') = 4, 'buscas novas auditadas (carregar mais não)');
SELECT pg_temp.check(
  (SELECT details ->> 'row_count' FROM public.admin_audit_log WHERE action = 'export_access_logs') = '3'
  AND (SELECT details ->> 'reason' FROM public.admin_audit_log WHERE action = 'export_access_logs') = 'Ordem judicial 123',
  'exportação auditada com motivo e número de linhas');

-- 8. Excluir a conta não apaga os registros; a limpeza apaga só o que passou de 7 meses
DELETE FROM auth.users WHERE id = 'a0000000-0000-0000-0000-00000000000a';
SELECT pg_temp.check(pg_temp.log_count() = 3, 'registros ficam após excluir a conta');
UPDATE public.access_logs SET created_at = now() - interval '7 months 1 day' WHERE event = 'login' AND email = 'paciente@teste.local';
UPDATE public.access_logs SET created_at = now() - interval '6 months 20 days' WHERE ip_address = '187.1.2.3';
SELECT pg_temp.check(public.purge_access_logs() = 1, 'limpeza apaga só o que passou de 7 meses');
SELECT pg_temp.check(pg_temp.log_count() = 2, 'registros de menos de 7 meses ficam');

ROLLBACK;
