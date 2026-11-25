-- ================================================================
-- FIX REMAINING TRIGGER FUNCTIONS SEARCH_PATH
-- ================================================================

-- Update all trigger functions to have proper search_path
CREATE OR REPLACE FUNCTION public.prevent_user_type_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_psychologist_appointment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE public.psychologists 
    SET total_appointments = total_appointments + 1
    WHERE user_id = NEW.psychologist_id;
  END IF;
  
  IF OLD.status = 'completed' AND NEW.status != 'completed' THEN
    UPDATE public.psychologists 
    SET total_appointments = GREATEST(total_appointments - 1, 0)
    WHERE user_id = NEW.psychologist_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_sensitive_operations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_TABLE_NAME = 'admin_users' THEN
    INSERT INTO public.security_audit_log (
      user_id, action, table_name, record_id,
      old_values, new_values
    ) VALUES (
      auth.uid(), TG_OP, TG_TABLE_NAME, 
      COALESCE(NEW.id, OLD.id),
      CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
      CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END
    );
  END IF;
  
  IF TG_TABLE_NAME = 'emergency_requests' AND TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status THEN
      INSERT INTO public.security_audit_log (
        user_id, action, table_name, record_id,
        old_values, new_values
      ) VALUES (
        auth.uid(), 'emergency_status_change', TG_TABLE_NAME, NEW.id,
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status)
      );
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_testimonial_like_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.group_testimonials 
    SET 
      likes_positivos = (
        SELECT COUNT(*) 
        FROM public.group_testimonial_likes 
        WHERE testimonial_id = NEW.testimonial_id 
        AND tipo = 'positivo'
      ),
      likes_negativos = (
        SELECT COUNT(*) 
        FROM public.group_testimonial_likes 
        WHERE testimonial_id = NEW.testimonial_id 
        AND tipo = 'negativo'
      )
    WHERE id = NEW.testimonial_id;
    
    DELETE FROM public.group_testimonials 
    WHERE id = NEW.testimonial_id 
    AND likes_negativos >= 10;
    
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    UPDATE public.group_testimonials 
    SET 
      likes_positivos = (
        SELECT COUNT(*) 
        FROM public.group_testimonial_likes 
        WHERE testimonial_id = OLD.testimonial_id 
        AND tipo = 'positivo'
      ),
      likes_negativos = (
        SELECT COUNT(*) 
        FROM public.group_testimonial_likes 
        WHERE testimonial_id = OLD.testimonial_id 
        AND tipo = 'negativo'
      )
    WHERE id = OLD.testimonial_id;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_psychologists_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_psychologist_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.update_private_journals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, user_type, full_name, crp)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'user_type', 'patient')::public.user_type,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'crp'
  );
  RETURN NEW;
END;
$$;