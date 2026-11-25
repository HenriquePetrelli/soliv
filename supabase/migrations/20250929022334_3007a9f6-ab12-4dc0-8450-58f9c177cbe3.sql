-- Add last_mood_value column to patients table
ALTER TABLE public.patients 
ADD COLUMN last_mood_value integer;