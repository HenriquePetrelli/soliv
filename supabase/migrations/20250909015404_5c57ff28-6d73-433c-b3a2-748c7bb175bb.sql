-- Fix foreign key constraint for notifications table
-- The patient_id should reference profiles.user_id, not profiles.id
ALTER TABLE notifications 
DROP CONSTRAINT IF EXISTS notifications_patient_id_fkey;

ALTER TABLE notifications 
ADD CONSTRAINT notifications_patient_id_fkey 
FOREIGN KEY (patient_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add missing appointment_id column if it doesn't exist
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS appointment_id UUID;

-- Update updated_at trigger
ALTER TABLE notifications ALTER COLUMN updated_at SET DEFAULT now();

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_notifications_patient_id_status ON notifications(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);