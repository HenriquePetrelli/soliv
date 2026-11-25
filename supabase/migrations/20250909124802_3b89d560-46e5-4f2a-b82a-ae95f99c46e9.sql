-- Fix appointments status constraint to include pending and declined
ALTER TABLE public.appointments 
DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments 
ADD CONSTRAINT appointments_status_check 
CHECK (status = ANY (ARRAY['pending'::text, 'scheduled'::text, 'confirmed'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'declined'::text]));

-- Update default status to pending for new appointments
ALTER TABLE public.appointments 
ALTER COLUMN status SET DEFAULT 'pending';