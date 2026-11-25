-- Limpar todos os dados mantendo apenas admin@admin.com

-- Primeiro, obter o user_id do admin@admin.com da tabela auth.users
DO $$
DECLARE
  admin_user_id uuid;
BEGIN
  -- Buscar o user_id do admin
  SELECT id INTO admin_user_id 
  FROM auth.users 
  WHERE email = 'admin@admin.com' OR email = 'admin@soliv.com';
  
  IF admin_user_id IS NOT NULL THEN
    -- Deletar dados das tabelas relacionadas, preservando apenas o admin
    
    -- Limpar emergency_requests
    DELETE FROM public.emergency_requests 
    WHERE patient_id != admin_user_id;
    
    -- Limpar appointments
    DELETE FROM public.appointments 
    WHERE patient_id != admin_user_id AND psychologist_id != admin_user_id;
    
    -- Limpar patient_progress
    DELETE FROM public.patient_progress 
    WHERE patient_id != admin_user_id;
    
    -- Limpar subscribers
    DELETE FROM public.subscribers 
    WHERE user_id != admin_user_id;
    
    -- Limpar fcm_tokens
    DELETE FROM public.fcm_tokens 
    WHERE user_id != admin_user_id;
    
    -- Limpar notification_logs
    DELETE FROM public.notification_logs 
    WHERE user_id != admin_user_id;
    
    -- Limpar psychologist_presence
    DELETE FROM public.psychologist_presence 
    WHERE psychologist_id != admin_user_id;
    
    -- Limpar psychologist_availability
    DELETE FROM public.psychologist_availability 
    WHERE psychologist_id != admin_user_id;
    
    -- Limpar webrtc_sessions
    DELETE FROM public.webrtc_sessions 
    WHERE patient_id != admin_user_id AND psychologist_id != admin_user_id;
    
    -- Limpar psychologist_registrations
    DELETE FROM public.psychologist_registrations 
    WHERE user_id != admin_user_id;
    
    -- Limpar psychologists
    DELETE FROM public.psychologists 
    WHERE user_id != admin_user_id;
    
    -- Limpar patients
    DELETE FROM public.patients 
    WHERE user_id != admin_user_id;
    
    -- Limpar profiles (exceto admin)
    DELETE FROM public.profiles 
    WHERE user_id != admin_user_id;
    
    -- Por último, deletar users da auth (exceto admin)
    DELETE FROM auth.users 
    WHERE id != admin_user_id;
    
    RAISE NOTICE 'Dados limpos com sucesso. Mantido apenas admin com ID: %', admin_user_id;
  ELSE
    RAISE NOTICE 'Admin não encontrado. Nenhum dado foi deletado.';
  END IF;
END $$;