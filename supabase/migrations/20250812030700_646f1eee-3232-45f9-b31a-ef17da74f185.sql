-- Create online presence table separate from existing availability schedules
CREATE TABLE IF NOT EXISTS public.psychologist_presence (
  psychologist_id uuid PRIMARY KEY REFERENCES public.psychologists(user_id) ON DELETE CASCADE,
  is_online boolean NOT NULL DEFAULT false,
  last_online timestamptz,
  emergency_accepted_count integer NOT NULL DEFAULT 0,
  emergency_rejected_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS and policies for presence table
ALTER TABLE public.psychologist_presence ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'psychologist_presence' AND policyname = 'Psychologists can select their own presence'
  ) THEN
    CREATE POLICY "Psychologists can select their own presence"
    ON public.psychologist_presence
    FOR SELECT
    USING (psychologist_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'psychologist_presence' AND policyname = 'Psychologists can insert their own presence'
  ) THEN
    CREATE POLICY "Psychologists can insert their own presence"
    ON public.psychologist_presence
    FOR INSERT
    WITH CHECK (psychologist_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'psychologist_presence' AND policyname = 'Psychologists can update their own presence'
  ) THEN
    CREATE POLICY "Psychologists can update their own presence"
    ON public.psychologist_presence
    FOR UPDATE
    USING (psychologist_id = auth.uid());
  END IF;
END $$;

-- Add trigger to keep updated_at fresh
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_psychologist_presence_updated_at'
  ) THEN
    CREATE TRIGGER trg_psychologist_presence_updated_at
    BEFORE UPDATE ON public.psychologist_presence
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Ensure emergency_requests has patient_details JSONB
ALTER TABLE public.emergency_requests 
ADD COLUMN IF NOT EXISTS patient_details jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Functions to increment accepted/rejected counters
CREATE OR REPLACE FUNCTION public.increment_emergency_accepted(p_psychologist_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.psychologist_presence
  SET emergency_accepted_count = emergency_accepted_count + 1
  WHERE psychologist_id = p_psychologist_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_emergency_rejected(p_psychologist_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.psychologist_presence
  SET emergency_rejected_count = emergency_rejected_count + 1
  WHERE psychologist_id = p_psychologist_id;
END;
$$;