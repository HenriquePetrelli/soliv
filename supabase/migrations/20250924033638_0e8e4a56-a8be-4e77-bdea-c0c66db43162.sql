-- Create enum for like types
CREATE TYPE like_type AS ENUM ('positivo', 'negativo');

-- Create table for testimonial likes
CREATE TABLE public.group_testimonial_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  testimonial_id UUID NOT NULL REFERENCES public.group_testimonials(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  tipo like_type NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(testimonial_id, user_id)
);

-- Add like counters to group_testimonials table
ALTER TABLE public.group_testimonials 
ADD COLUMN likes_positivos INTEGER NOT NULL DEFAULT 0,
ADD COLUMN likes_negativos INTEGER NOT NULL DEFAULT 0;

-- Enable RLS on the new table
ALTER TABLE public.group_testimonial_likes ENABLE ROW LEVEL SECURITY;

-- RLS policies for group_testimonial_likes
CREATE POLICY "Usuários podem criar seus próprios likes" 
ON public.group_testimonial_likes 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem visualizar likes de depoimentos" 
ON public.group_testimonial_likes 
FOR SELECT 
USING (true);

CREATE POLICY "Usuários podem deletar seus próprios likes" 
ON public.group_testimonial_likes 
FOR DELETE 
USING (auth.uid() = user_id);

-- Function to update like counters
CREATE OR REPLACE FUNCTION public.update_testimonial_like_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment the appropriate counter
    IF NEW.tipo = 'positivo' THEN
      UPDATE public.group_testimonials 
      SET likes_positivos = likes_positivos + 1
      WHERE id = NEW.testimonial_id;
    ELSE
      UPDATE public.group_testimonials 
      SET likes_negativos = likes_negativos + 1
      WHERE id = NEW.testimonial_id;
      
      -- Check if testimonial should be deleted (10 negative likes)
      DELETE FROM public.group_testimonials 
      WHERE id = NEW.testimonial_id 
      AND likes_negativos >= 10;
    END IF;
    
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    -- Decrement the appropriate counter
    IF OLD.tipo = 'positivo' THEN
      UPDATE public.group_testimonials 
      SET likes_positivos = GREATEST(likes_positivos - 1, 0)
      WHERE id = OLD.testimonial_id;
    ELSE
      UPDATE public.group_testimonials 
      SET likes_negativos = GREATEST(likes_negativos - 1, 0)
      WHERE id = OLD.testimonial_id;
    END IF;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to automatically update counters
CREATE TRIGGER update_testimonial_like_counts_trigger
  AFTER INSERT OR DELETE ON public.group_testimonial_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_testimonial_like_counts();