-- Fix the remaining functions with missing or empty search_path

CREATE OR REPLACE FUNCTION public.can_use_sos(p_user_id uuid)
RETURNS TABLE(can_use boolean, reason text, plan_type text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  same_month boolean;
BEGIN
  SELECT subscribed, subscription_tier, sos_used_this_month, sos_last_used
  INTO rec
  FROM public.subscribers
  WHERE user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND OR rec.subscribed IS FALSE THEN
    RETURN QUERY SELECT false, 'Usuário não possui assinatura ativa', COALESCE(rec.subscription_tier, NULL);
    RETURN;
  END IF;

  -- Normalize plan type
  rec.subscription_tier := COALESCE(rec.subscription_tier, '');

  same_month := CASE 
    WHEN rec.sos_last_used IS NULL THEN FALSE
    ELSE (date_part('year', rec.sos_last_used) = date_part('year', CURRENT_DATE))
      AND (date_part('month', rec.sos_last_used) = date_part('month', CURRENT_DATE))
  END;

  IF lower(rec.subscription_tier) = 'plus' THEN
    IF rec.sos_used_this_month AND same_month THEN
      RETURN QUERY SELECT false, 'Limite mensal de SOS já utilizado (PLUS: 1x/mês)', 'Plus';
    ELSE
      RETURN QUERY SELECT true, 'Pode usar SOS (PLUS: 1x/mês)', 'Plus';
    END IF;
  ELSIF lower(rec.subscription_tier) = 'premium' THEN
    RETURN QUERY SELECT true, 'Pode usar SOS (PREMIUM: ilimitado)', 'Premium';
  ELSE
    RETURN QUERY SELECT false, 'Plano não permite uso de SOS', rec.subscription_tier;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;