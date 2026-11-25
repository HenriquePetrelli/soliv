-- Enable realtime for emergency_requests table
ALTER TABLE public.emergency_requests REPLICA IDENTITY FULL;

-- Add the table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_requests;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_emergency_requests_status ON public.emergency_requests(status);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_created_at ON public.emergency_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_emergency_requests_accepted_by ON public.emergency_requests(accepted_by);