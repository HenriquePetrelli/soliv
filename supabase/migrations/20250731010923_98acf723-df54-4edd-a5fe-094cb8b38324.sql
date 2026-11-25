-- Corrigir problemas de segurança: adicionar search_path às funções

-- Recriar função para atualizar updated_at com search_path
CREATE OR REPLACE FUNCTION public.update_psychologists_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Recriar função para notificar mudanças de status com search_path
CREATE OR REPLACE FUNCTION public.notify_psychologist_status_change()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.approval_status <> OLD.approval_status THEN
    PERFORM pg_notify('psychologist_status_changed', 
      json_build_object(
        'psychologist_id', NEW.id,
        'new_status', NEW.approval_status,
        'email', NEW.email,
        'user_id', NEW.user_id
      )::text);
  END IF;
  RETURN NEW;
END;
$$;

-- Recriar função para validar CRP único com search_path
CREATE OR REPLACE FUNCTION public.validate_unique_crp(crp_input TEXT, exclude_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.psychologists 
    WHERE crp_number = crp_input 
    AND (exclude_id IS NULL OR id != exclude_id)
  );
END;
$$;