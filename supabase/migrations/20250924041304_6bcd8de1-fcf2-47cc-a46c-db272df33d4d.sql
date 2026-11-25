-- Corrigir função para ter search_path seguro
CREATE OR REPLACE FUNCTION public.update_testimonial_like_counts()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Para INSERT ou UPDATE, recalcular contadores para o depoimento
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
    
    -- Auto-delete testimonial if it reaches 10 negative likes
    DELETE FROM public.group_testimonials 
    WHERE id = NEW.testimonial_id 
    AND likes_negativos >= 10;
    
    RETURN NEW;
  END IF;
  
  -- Para DELETE, recalcular contadores para o depoimento
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