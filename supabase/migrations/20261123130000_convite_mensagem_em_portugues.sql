-- Recusa do cadastro sem convite em português
--
-- O Supabase Auth devolve ao app a mensagem do `raise exception` (código P0001),
-- e o app mostra para a pessoa as mensagens escritas em português
-- (src/utils/errorMessage.ts). Antes a mensagem era `signup_invite_code_required`
-- e a tela caía no aviso genérico. O identificador fica no HINT.

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
    RAISE EXCEPTION 'Código de convite inválido. Confira com quem te convidou.'
      USING HINT = 'signup_invite_code_required';
  END IF;
  IF NEW.raw_user_meta_data ? 'signup_invite_code' THEN
    NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'signup_invite_code';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_signup_invite_code() FROM PUBLIC, anon, authenticated;
