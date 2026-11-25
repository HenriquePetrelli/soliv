-- ================================================================
-- FIX REMAINING FUNCTION SEARCH_PATH ISSUES
-- ================================================================

-- Update all remaining functions to have proper search_path
CREATE OR REPLACE FUNCTION public.can_use_sos(p_user_id uuid)
RETURNS TABLE(can_use boolean, reason text, plan_type text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.calculate_psychologist_average_rating(psychologist_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  avg_rating NUMERIC;
BEGIN
  SELECT AVG(sf.rating)::NUMERIC(3,2)
  INTO avg_rating
  FROM public.session_feedback sf
  JOIN public.webrtc_sessions ws ON sf.session_id = ws.id
  WHERE ws.psychologist_id = psychologist_user_id
    AND sf.user_type = 'patient';
  RETURN COALESCE(avg_rating, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_patient_statistics(patient_user_id uuid)
RETURNS TABLE(consultation_count integer, sos_count integer, average_rating numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE((
      SELECT COUNT(*)::INTEGER 
      FROM public.appointments 
      WHERE patient_id = patient_user_id AND status = 'completed'
    ), 0) as consultation_count,
    COALESCE((
      SELECT COUNT(*)::INTEGER 
      FROM public.emergency_requests 
      WHERE patient_id = patient_user_id AND status = 'completed'
    ), 0) as sos_count,
    COALESCE((
      SELECT AVG(sf.rating)::NUMERIC(3,2)
      FROM public.session_feedback sf
      JOIN public.webrtc_sessions ws ON sf.session_id = ws.id
      WHERE ws.patient_id = patient_user_id
        AND sf.user_type = 'psychologist'
    ), 0) as average_rating;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_metrics()
RETURNS TABLE(total_patients bigint, active_psychologists bigint, pending_psychologists bigint, active_subscribers bigint, appointments_last_30_days bigint, sos_requests_last_30_days bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied. Super admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM public.profiles WHERE user_type = 'patient')::BIGINT,
    (SELECT COUNT(*) FROM public.psychologists WHERE approved = true AND approval_status = 'approved')::BIGINT,
    (SELECT COUNT(*) FROM public.psychologists WHERE approval_status = 'pending')::BIGINT,
    (SELECT COUNT(*) FROM public.subscribers WHERE subscribed = true)::BIGINT,
    (SELECT COUNT(*) FROM public.appointments WHERE created_at >= NOW() - INTERVAL '30 days')::BIGINT,
    (SELECT COUNT(*) FROM public.emergency_requests WHERE created_at >= NOW() - INTERVAL '30 days')::BIGINT;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_emergency_accepted(p_psychologist_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.psychologist_presence
  SET emergency_accepted_count = emergency_accepted_count + 1
  WHERE psychologist_id = p_psychologist_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_emergency_rejected(p_psychologist_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.psychologist_presence
  SET emergency_rejected_count = emergency_rejected_count + 1
  WHERE psychologist_id = p_psychologist_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pode_criar_conversa(p_paciente_id uuid, p_psicologo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.patient_id = p_paciente_id
    AND a.psychologist_id = p_psicologo_id
    AND a.status = 'completed'
    AND a.scheduled_at >= (CURRENT_DATE - INTERVAL '30 days')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.gerenciar_expiracao_conversas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.conversas 
  SET status = 'somente_leitura'
  WHERE status = 'ativa' 
  AND data_inicio <= (CURRENT_DATE - INTERVAL '1 month');
  
  DELETE FROM public.conversas 
  WHERE data_inicio <= (CURRENT_DATE - INTERVAL '3 months');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_psychologist_document_url(document_path text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem acessar documentos.';
  END IF;
  
  RETURN document_path;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_psychologist_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  psych_record RECORD;
  scheduled_count INTEGER;
  emergency_count INTEGER;
  scheduled_amount NUMERIC;
  emergency_amount NUMERIC;
  total_pending NUMERIC;
BEGIN
  FOR psych_record IN 
    SELECT DISTINCT 
      p.id as psychologist_id,
      p.user_id,
      p.full_name,
      p.cpf,
      p.crp_number,
      p.email,
      p.pix_key,
      p.pix_type
    FROM public.psychologists p
    WHERE p.approved = true
      AND EXISTS (
        SELECT 1 FROM public.appointments a 
        WHERE a.psychologist_id = p.user_id 
          AND a.status = 'completed'
          AND a.scheduled_at >= date_trunc('week', now() - interval '1 week')
          AND a.scheduled_at < date_trunc('week', now())
      )
  LOOP
    SELECT COUNT(*) INTO scheduled_count
    FROM public.appointments a
    WHERE a.psychologist_id = psych_record.user_id
      AND a.status = 'completed'
      AND a.appointment_type = 'regular'
      AND a.scheduled_at >= date_trunc('week', now() - interval '1 week')
      AND a.scheduled_at < date_trunc('week', now());

    SELECT COUNT(*) INTO emergency_count
    FROM public.appointments a
    WHERE a.psychologist_id = psych_record.user_id
      AND a.status = 'completed'
      AND a.appointment_type = 'emergency'
      AND a.scheduled_at >= date_trunc('week', now() - interval '1 week')
      AND a.scheduled_at < date_trunc('week', now());

    scheduled_amount := scheduled_count * 90.00;
    emergency_amount := emergency_count * 50.00;
    total_pending := scheduled_amount + emergency_amount;

    INSERT INTO public.psychologist_payments (
      psychologist_id,
      name,
      cpf,
      crp,
      email,
      pix_key,
      pix_type,
      scheduled_pending_count,
      emergency_pending_count,
      total_pending_amount
    ) VALUES (
      psych_record.psychologist_id,
      psych_record.full_name,
      psych_record.cpf,
      psych_record.crp_number,
      psych_record.email,
      psych_record.pix_key,
      psych_record.pix_type,
      scheduled_count,
      emergency_count,
      total_pending
    )
    ON CONFLICT (psychologist_id) DO UPDATE SET
      name = EXCLUDED.name,
      cpf = EXCLUDED.cpf,
      crp = EXCLUDED.crp,
      email = EXCLUDED.email,
      pix_key = EXCLUDED.pix_key,
      pix_type = EXCLUDED.pix_type,
      scheduled_pending_count = psychologist_payments.scheduled_pending_count + EXCLUDED.scheduled_pending_count,
      emergency_pending_count = psychologist_payments.emergency_pending_count + EXCLUDED.emergency_pending_count,
      total_pending_amount = psychologist_payments.total_pending_amount + EXCLUDED.total_pending_amount,
      updated_at = now();

    INSERT INTO public.payment_logs (
      psychologist_id,
      admin_id,
      action,
      scheduled_count,
      emergency_count,
      details
    ) VALUES (
      psych_record.psychologist_id,
      '00000000-0000-0000-0000-000000000000',
      'sync_update',
      scheduled_count,
      emergency_count,
      jsonb_build_object(
        'week_start', date_trunc('week', now() - interval '1 week'),
        'week_end', date_trunc('week', now()),
        'scheduled_amount', scheduled_amount,
        'emergency_amount', emergency_amount
      )
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_psychologist_rejection_status(p_user_id uuid)
RETURNS TABLE(is_rejected boolean, rejected_at timestamp with time zone, rejection_reason text, should_show_rejection_message boolean, should_cleanup boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rejection_data RECORD;
  days_since_rejection integer;
BEGIN
  SELECT 
    r.status = 'rejected' as is_rejected,
    r.rejected_at,
    r.rejection_reason
  INTO rejection_data
  FROM public.psychologist_registrations r
  WHERE r.user_id = p_user_id;

  IF NOT FOUND OR NOT rejection_data.is_rejected THEN
    RETURN QUERY SELECT false, NULL::timestamp with time zone, NULL::text, false, false;
    RETURN;
  END IF;

  days_since_rejection := EXTRACT(days FROM (now() - rejection_data.rejected_at));

  RETURN QUERY SELECT 
    true,
    rejection_data.rejected_at,
    rejection_data.rejection_reason,
    days_since_rejection <= 3,
    days_since_rejection > 3;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_rejected_psychologist(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  doc_path text;
BEGIN
  SELECT document_url INTO doc_path
  FROM public.psychologists
  WHERE user_id = p_user_id AND approval_status = 'rejected';

  DELETE FROM public.psychologist_registrations WHERE user_id = p_user_id;
  DELETE FROM public.psychologists WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE user_id = p_user_id AND user_type = 'psychologist';
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error cleaning up psychologist %: %', p_user_id, SQLERRM;
    RETURN false;
END;
$$;