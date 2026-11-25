-- Add RLS policy for patients to delete their own emergency requests
CREATE POLICY "Patients can delete their own emergency requests"
ON emergency_requests
FOR DELETE 
USING (
  auth.uid() = patient_id 
  AND status IN ('pending', 'waiting')
);

-- Add expires_at column for automatic timeout (optional)
ALTER TABLE emergency_requests
ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE 
DEFAULT (NOW() + INTERVAL '30 minutes');