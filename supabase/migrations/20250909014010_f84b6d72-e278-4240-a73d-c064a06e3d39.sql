-- Add reschedule_proposed status to appointments table
ALTER TABLE public.appointments 
DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments 
ADD CONSTRAINT appointments_status_check 
CHECK (status IN ('pending', 'scheduled', 'declined', 'cancelled', 'completed', 'reschedule_proposed'));

-- Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  status text CHECK (status IN ('unread', 'read')) DEFAULT 'unread',
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on notifications table
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Create policy for patients to view their own notifications
CREATE POLICY "Patients can view their own notifications" 
ON public.notifications 
FOR SELECT 
USING (patient_id = auth.uid());

-- Create policy for patients to update their own notifications
CREATE POLICY "Patients can update their own notifications" 
ON public.notifications 
FOR UPDATE 
USING (patient_id = auth.uid());

-- Create policy for inserting notifications
CREATE POLICY "System can create notifications" 
ON public.notifications 
FOR INSERT 
WITH CHECK (true);

-- Add trigger to update updated_at
CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add new columns to appointments for reschedule proposals
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS proposed_scheduled_at timestamptz,
ADD COLUMN IF NOT EXISTS proposal_notes text;