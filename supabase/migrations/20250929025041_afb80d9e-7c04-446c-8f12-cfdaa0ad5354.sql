-- Add daily_mood_enabled column to patients table
ALTER TABLE public.patients 
ADD COLUMN daily_mood_enabled boolean NOT NULL DEFAULT true;