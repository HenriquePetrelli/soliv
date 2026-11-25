-- Add foreign key constraint between appointments and psychologists
ALTER TABLE public.appointments 
ADD CONSTRAINT fk_appointments_psychologist_id 
FOREIGN KEY (psychologist_id) 
REFERENCES public.psychologists(user_id) 
ON DELETE CASCADE;