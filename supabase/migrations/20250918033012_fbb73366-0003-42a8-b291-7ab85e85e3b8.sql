-- Add ended and updated tracking columns to webrtc_sessions
ALTER TABLE public.webrtc_sessions
  ADD COLUMN IF NOT EXISTS ended_by uuid,
  ADD COLUMN IF NOT EXISTS ended_by_type text,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Ensure updated_at is maintained automatically
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_webrtc_sessions_updated_at'
  ) THEN
    CREATE TRIGGER update_webrtc_sessions_updated_at
    BEFORE UPDATE ON public.webrtc_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Improve realtime payload completeness
ALTER TABLE public.webrtc_sessions REPLICA IDENTITY FULL;

-- Add table to realtime publication (idempotent)
DO $$
BEGIN
  -- This will error if already added; catch and ignore
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.webrtc_sessions;
  EXCEPTION WHEN duplicate_object THEN
    -- already added, ignore
    NULL;
  END;
END $$;
