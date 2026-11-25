-- Add total_appointments column to psychologists table
ALTER TABLE public.psychologists 
ADD COLUMN total_appointments INTEGER DEFAULT 0;

-- Create function to update total appointments count
CREATE OR REPLACE FUNCTION public.update_psychologist_appointment_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Update total_appointments when appointment status changes to completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE public.psychologists 
    SET total_appointments = total_appointments + 1
    WHERE user_id = NEW.psychologist_id;
  END IF;
  
  -- Decrease count if appointment was completed but now changed to another status
  IF OLD.status = 'completed' AND NEW.status != 'completed' THEN
    UPDATE public.psychologists 
    SET total_appointments = GREATEST(total_appointments - 1, 0)
    WHERE user_id = NEW.psychologist_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically update appointment count
CREATE TRIGGER update_psychologist_appointment_count_trigger
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_psychologist_appointment_count();

-- Populate existing data (count completed appointments for each psychologist)
UPDATE public.psychologists 
SET total_appointments = (
  SELECT COUNT(*)
  FROM public.appointments 
  WHERE psychologist_id = psychologists.user_id 
  AND status = 'completed'
);