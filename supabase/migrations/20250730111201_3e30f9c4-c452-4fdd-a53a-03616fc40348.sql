-- Add duration field to appointments table
ALTER TABLE public.appointments 
ADD COLUMN duration INTEGER DEFAULT 60;