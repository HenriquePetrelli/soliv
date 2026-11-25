-- Fix appointments status constraint to include in_progress
ALTER TABLE public.appointments 
DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments 
ADD CONSTRAINT appointments_status_check 
CHECK (status IN ('pending', 'scheduled', 'declined', 'cancelled', 'completed', 'reschedule_proposed', 'in_progress'));

-- Add confirmed status as well for backward compatibility
ALTER TABLE public.appointments 
DROP CONSTRAINT appointments_status_check;

ALTER TABLE public.appointments 
ADD CONSTRAINT appointments_status_check 
CHECK (status IN ('pending', 'scheduled', 'confirmed', 'declined', 'cancelled', 'completed', 'reschedule_proposed', 'in_progress'));