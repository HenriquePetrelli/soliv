-- Garantir que existe apenas um trigger para atualizar contadores de likes
DROP TRIGGER IF EXISTS update_testimonial_like_counts ON public.group_testimonial_likes;

-- Recriar a função de atualização de contadores de forma mais robusta
CREATE OR REPLACE FUNCTION public.update_testimonial_like_counts()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Criar trigger que funciona para INSERT, UPDATE e DELETE
CREATE TRIGGER update_testimonial_like_counts
AFTER INSERT OR UPDATE OR DELETE ON public.group_testimonial_likes
FOR EACH ROW
EXECUTE FUNCTION public.update_testimonial_like_counts();

-- Garantir que as tabelas têm REPLICA IDENTITY FULL para real-time updates
ALTER TABLE public.group_testimonials REPLICA IDENTITY FULL;
ALTER TABLE public.group_testimonial_likes REPLICA IDENTITY FULL;