-- Retry: Update psychologist_presence schema and policies

-- 1) Add current_emergency_id column with FK to emergency_requests
ALTER TABLE public.psychologist_presence
ADD COLUMN IF NOT EXISTS current_emergency_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'psychologist_presence_current_emergency_id_fkey'
  ) THEN
    ALTER TABLE public.psychologist_presence
    ADD CONSTRAINT psychologist_presence_current_emergency_id_fkey
    FOREIGN KEY (current_emergency_id)
    REFERENCES public.emergency_requests (id)
    ON DELETE SET NULL;
  END IF;
END$$;

-- 2) Ensure uniqueness on psychologist_id (one row per psychologist)
CREATE UNIQUE INDEX IF NOT EXISTS idx_psychologist_presence_unique
ON public.psychologist_presence (psychologist_id);

-- 3) Public read access for online-only status (patients/SOS page)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'psychologist_presence' 
      AND policyname = 'Public can view online psychologists'
  ) THEN
    CREATE POLICY "Public can view online psychologists"
    ON public.psychologist_presence
    FOR SELECT
    USING (is_online = true);
  END IF;
END$$;
