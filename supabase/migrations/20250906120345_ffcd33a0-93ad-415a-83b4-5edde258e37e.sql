-- Add RLS policy to allow authenticated users to view approved psychologists
CREATE POLICY "Approved psychologists are visible to all authenticated users"
ON public.psychologists
FOR SELECT
USING (approved = true AND approval_status = 'approved' AND auth.role() = 'authenticated');