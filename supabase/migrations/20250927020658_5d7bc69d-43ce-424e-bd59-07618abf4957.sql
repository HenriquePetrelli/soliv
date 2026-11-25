-- Add mood tracking columns to patients table
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS daily_mood_count INTEGER DEFAULT 0;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS daily_mood_sum INTEGER DEFAULT 0;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS last_mood_date DATE DEFAULT NULL;