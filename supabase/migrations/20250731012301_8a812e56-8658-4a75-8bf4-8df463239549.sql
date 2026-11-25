-- Atualizar função de métricas para usar a nova tabela psychologists
CREATE OR REPLACE FUNCTION public.get_admin_metrics()
RETURNS TABLE(total_patients bigint, active_psychologists bigint, pending_psychologists bigint, active_subscribers bigint, appointments_last_30_days bigint, sos_requests_last_30_days bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only allow super admins to access this function
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