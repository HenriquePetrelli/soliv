-- Add call tracking columns to emergency_requests
ALTER TABLE public.emergency_requests
ADD COLUMN IF NOT EXISTS room_url text,
ADD COLUMN IF NOT EXISTS started_at timestamptz,
ADD COLUMN IF NOT EXISTS ended_at timestamptz,
ADD COLUMN IF NOT EXISTS duration integer;

-- Helpful index for queue and status lookups
CREATE INDEX IF NOT EXISTS idx_emergency_requests_status_created_at 
ON public.emergency_requests (status, created_at);

-- Helpful index for accepted_by lookups
CREATE INDEX IF NOT EXISTS idx_emergency_requests_accepted_by 
ON public.emergency_requests (accepted_by);
