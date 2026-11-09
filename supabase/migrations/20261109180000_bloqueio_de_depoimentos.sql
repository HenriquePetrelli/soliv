-- Bloqueio de depoimentos nos grupos de apoio
--
-- 1) O admin vê de quem é cada depoimento, inclusive os anônimos (o
--    anonimato vale só para os outros pacientes).
-- 2) O admin pode impedir um paciente de criar (e editar) depoimentos por
--    um período (horas, dias, semanas, meses, anos) ou por tempo
--    indeterminado. O paciente continua vendo os depoimentos; ao tentar
--    criar, vê um aviso genérico com a data do fim do bloqueio.
--    A trava é no banco: vale mesmo chamando a API direto.

CREATE TABLE IF NOT EXISTS public.testimonial_bans (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_until timestamptz,            -- NULL = tempo indeterminado
  reason text,
  blocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.testimonial_bans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.testimonial_bans FROM anon, authenticated;

-- Até quando a pessoa está bloqueada (NULL também quando não está: use
-- testimonial_ban_active para saber se há bloqueio).
CREATE OR REPLACE FUNCTION public.testimonial_ban_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.testimonial_bans b
    WHERE b.user_id = p_user_id AND (b.blocked_until IS NULL OR b.blocked_until > now())
  );
$function$;

REVOKE ALL ON FUNCTION public.testimonial_ban_active(uuid) FROM PUBLIC, anon, authenticated;

-- Para o app do paciente: o próprio bloqueio, sem o motivo interno do admin.
CREATE OR REPLACE FUNCTION public.get_my_testimonial_block()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.testimonial_ban_active(auth.uid()) THEN
      jsonb_build_object('blocked', true, 'blocked_until', (SELECT blocked_until FROM public.testimonial_bans WHERE user_id = auth.uid()))
    ELSE jsonb_build_object('blocked', false, 'blocked_until', NULL)
  END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_testimonial_block() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_testimonial_block() TO authenticated;

-- Trava no banco: paciente bloqueado não cria nem edita depoimento.
CREATE OR REPLACE FUNCTION public.guard_testimonial_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_until timestamptz;
BEGIN
  -- Só o próprio autor é barrado: admin (editando pela moderação), rotinas
  -- e o service role seguem livres.
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;
  IF NOT public.testimonial_ban_active(NEW.user_id) THEN
    RETURN NEW;
  END IF;
  SELECT blocked_until INTO v_until FROM public.testimonial_bans WHERE user_id = NEW.user_id;
  RAISE EXCEPTION 'TESTIMONIAL_BLOCKED'
    USING ERRCODE = '42501',
          DETAIL = COALESCE(to_char(v_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'indefinite'),
          HINT = 'Seu depoimento foge dos padrões do Soliv e a criação de depoimentos está bloqueada.';
END;
$function$;

DROP TRIGGER IF EXISTS a_guard_testimonial_ban ON public.group_testimonials;
CREATE TRIGGER a_guard_testimonial_ban
  BEFORE INSERT OR UPDATE OF texto, anonimo, humor, sintoma_id, sintoma_texto ON public.group_testimonials
  FOR EACH ROW EXECUTE FUNCTION public.guard_testimonial_ban();

-- Admin: bloquear. p_unit: hours | days | weeks | months | years, ou
-- 'indefinite' (p_amount ignorado).
CREATE OR REPLACE FUNCTION public.admin_block_testimonials(
  p_user_id uuid,
  p_unit text,
  p_amount integer DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_until timestamptz;
  v_max integer;
  v_name text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied. Super admin privileges required.';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Paciente não encontrado';
  END IF;

  IF p_unit = 'indefinite' THEN
    v_until := NULL;
  ELSE
    v_max := CASE p_unit WHEN 'hours' THEN 8760 WHEN 'days' THEN 3650 WHEN 'weeks' THEN 520
                         WHEN 'months' THEN 120 WHEN 'years' THEN 10 END;
    IF v_max IS NULL THEN
      RAISE EXCEPTION 'Período de bloqueio inválido';
    END IF;
    IF p_amount IS NULL OR p_amount < 1 OR p_amount > v_max THEN
      RAISE EXCEPTION 'Quantidade inválida (de 1 a %)', v_max;
    END IF;
    v_until := now() + make_interval(
      hours  => CASE WHEN p_unit = 'hours'  THEN p_amount ELSE 0 END,
      days   => CASE WHEN p_unit = 'days'   THEN p_amount WHEN p_unit = 'weeks' THEN p_amount * 7 ELSE 0 END,
      months => CASE WHEN p_unit = 'months' THEN p_amount ELSE 0 END,
      years  => CASE WHEN p_unit = 'years'  THEN p_amount ELSE 0 END
    );
  END IF;

  INSERT INTO public.testimonial_bans (user_id, blocked_until, reason, blocked_by, created_at)
  VALUES (p_user_id, v_until, NULLIF(left(trim(COALESCE(p_reason, '')), 2000), ''), auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET blocked_until = EXCLUDED.blocked_until, reason = EXCLUDED.reason,
        blocked_by = EXCLUDED.blocked_by, created_at = EXCLUDED.created_at;

  SELECT full_name INTO v_name FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  BEGIN
    INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, target_name, details)
    VALUES (auth.uid(), 'block_testimonials', 'patient', p_user_id, v_name,
            jsonb_build_object('unit', p_unit, 'amount', p_amount, 'blocked_until', v_until, 'reason', p_reason));
  EXCEPTION WHEN others THEN
    RAISE WARNING 'admin_block_testimonials audit: %', SQLERRM;
  END;

  RETURN jsonb_build_object('blocked', true, 'blocked_until', v_until);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_unblock_testimonials(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied. Super admin privileges required.';
  END IF;
  DELETE FROM public.testimonial_bans WHERE user_id = p_user_id;
  SELECT full_name INTO v_name FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  BEGIN
    INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, target_name, details)
    VALUES (auth.uid(), 'unblock_testimonials', 'patient', p_user_id, v_name, '{}'::jsonb);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'admin_unblock_testimonials audit: %', SQLERRM;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_block_testimonials(uuid, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_unblock_testimonials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_block_testimonials(uuid, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unblock_testimonials(uuid) TO authenticated;

-- Lista do admin: passa a trazer o autor real (também dos anônimos), o
-- e-mail e o bloqueio de depoimentos dele.
DROP FUNCTION IF EXISTS public.get_admin_group_testimonials();
CREATE FUNCTION public.get_admin_group_testimonials()
RETURNS TABLE(
  testimonial_id uuid, group_id uuid, group_nome text, autor_nome text, anonimo boolean, texto text,
  humor integer, likes_positivos integer, likes_negativos integer, flagged boolean, criado_em timestamp with time zone,
  pending_reports integer, report_reasons text[],
  autor_user_id uuid, autor_email text, autor_bloqueado boolean, autor_bloqueado_ate timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied. Super admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.group_id,
    g.nome,
    COALESCE(p.full_name, pt.full_name),
    t.anonimo,
    t.texto,
    t.humor::integer,
    t.likes_positivos::integer,
    t.likes_negativos::integer,
    (t.likes_negativos >= 10 OR COALESCE(r.cnt, 0) > 0),
    t.criado_em,
    COALESCE(r.cnt, 0)::integer,
    COALESCE(r.reasons, ARRAY[]::text[]),
    t.user_id,
    COALESCE(pt.email, u.email)::text,
    public.testimonial_ban_active(t.user_id),
    CASE WHEN public.testimonial_ban_active(t.user_id) THEN b.blocked_until END
  FROM public.group_testimonials t
  JOIN public.support_groups g ON g.id = t.group_id
  LEFT JOIN public.profiles p ON p.user_id = t.user_id
  LEFT JOIN public.patients pt ON pt.user_id = t.user_id
  LEFT JOIN auth.users u ON u.id = t.user_id
  LEFT JOIN public.testimonial_bans b ON b.user_id = t.user_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt, array_agg(DISTINCT gr.reason) AS reasons
    FROM public.group_testimonial_reports gr
    WHERE gr.testimonial_id = t.id AND gr.status = 'pending'
  ) r ON true
  ORDER BY COALESCE(r.cnt, 0) DESC, (t.likes_negativos >= 10) DESC, t.likes_negativos DESC, t.criado_em DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_group_testimonials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_group_testimonials() TO authenticated;
