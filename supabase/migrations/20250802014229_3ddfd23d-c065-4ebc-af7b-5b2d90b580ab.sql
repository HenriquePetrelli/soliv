-- First, let's make user_id unique in psychologists table
ALTER TABLE public.psychologists 
ADD CONSTRAINT unique_psychologists_user_id UNIQUE (user_id);

-- Now add the foreign key constraint for appointments
ALTER TABLE public.appointments 
ADD CONSTRAINT fk_appointments_psychologist 
FOREIGN KEY (psychologist_id) REFERENCES public.psychologists(user_id);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_appointments_psychologist_id ON public.appointments(psychologist_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON public.appointments(patient_id);