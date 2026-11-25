-- Create psychologist_payments table
CREATE TABLE public.psychologist_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  psychologist_id UUID NOT NULL REFERENCES public.psychologists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cpf TEXT,
  crp TEXT,
  email TEXT NOT NULL,
  pix_key TEXT,
  pix_type TEXT,
  total_paid_amount NUMERIC DEFAULT 0,
  total_pending_amount NUMERIC DEFAULT 0,
  scheduled_pending_count INTEGER DEFAULT 0,
  scheduled_paid_count INTEGER DEFAULT 0,
  emergency_pending_count INTEGER DEFAULT 0,
  emergency_paid_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(psychologist_id)
);

-- Create payment_logs table for audit
CREATE TABLE public.payment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  psychologist_id UUID NOT NULL REFERENCES public.psychologists(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'payment_confirmed', 'sync_update'
  amount_paid NUMERIC DEFAULT 0,
  scheduled_count INTEGER DEFAULT 0,
  emergency_count INTEGER DEFAULT 0,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.psychologist_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for psychologist_payments
CREATE POLICY "Super admins can manage all payments"
ON public.psychologist_payments
FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Psychologists can view their own payments"
ON public.psychologist_payments
FOR SELECT
TO authenticated
USING (psychologist_id IN (
  SELECT id FROM public.psychologists WHERE user_id = auth.uid()
));

-- RLS Policies for payment_logs
CREATE POLICY "Super admins can manage all payment logs"
ON public.payment_logs
FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Trigger to update updated_at
CREATE TRIGGER update_psychologist_payments_updated_at
  BEFORE UPDATE ON public.psychologist_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to synchronize payments data
CREATE OR REPLACE FUNCTION public.sync_psychologist_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  psych_record RECORD;
  scheduled_count INTEGER;
  emergency_count INTEGER;
  scheduled_amount NUMERIC;
  emergency_amount NUMERIC;
  total_pending NUMERIC;
BEGIN
  -- Get all psychologists with completed appointments from last week
  FOR psych_record IN 
    SELECT DISTINCT 
      p.id as psychologist_id,
      p.user_id,
      p.full_name,
      p.cpf,
      p.crp_number,
      p.email,
      p.pix_key,
      p.pix_type
    FROM public.psychologists p
    WHERE p.approved = true
      AND EXISTS (
        SELECT 1 FROM public.appointments a 
        WHERE a.psychologist_id = p.user_id 
          AND a.status = 'completed'
          AND a.scheduled_at >= date_trunc('week', now() - interval '1 week')
          AND a.scheduled_at < date_trunc('week', now())
      )
  LOOP
    -- Count scheduled appointments (regular appointments)
    SELECT COUNT(*) INTO scheduled_count
    FROM public.appointments a
    WHERE a.psychologist_id = psych_record.user_id
      AND a.status = 'completed'
      AND a.appointment_type = 'regular'
      AND a.scheduled_at >= date_trunc('week', now() - interval '1 week')
      AND a.scheduled_at < date_trunc('week', now());

    -- Count emergency appointments
    SELECT COUNT(*) INTO emergency_count
    FROM public.appointments a
    WHERE a.psychologist_id = psych_record.user_id
      AND a.status = 'completed'
      AND a.appointment_type = 'emergency'
      AND a.scheduled_at >= date_trunc('week', now() - interval '1 week')
      AND a.scheduled_at < date_trunc('week', now());

    -- Calculate amounts
    scheduled_amount := scheduled_count * 90.00; -- R$ 90 per scheduled appointment
    emergency_amount := emergency_count * 50.00;  -- R$ 50 per emergency appointment
    total_pending := scheduled_amount + emergency_amount;

    -- Insert or update psychologist_payments
    INSERT INTO public.psychologist_payments (
      psychologist_id,
      name,
      cpf,
      crp,
      email,
      pix_key,
      pix_type,
      scheduled_pending_count,
      emergency_pending_count,
      total_pending_amount
    ) VALUES (
      psych_record.psychologist_id,
      psych_record.full_name,
      psych_record.cpf,
      psych_record.crp_number,
      psych_record.email,
      psych_record.pix_key,
      psych_record.pix_type,
      scheduled_count,
      emergency_count,
      total_pending
    )
    ON CONFLICT (psychologist_id) DO UPDATE SET
      name = EXCLUDED.name,
      cpf = EXCLUDED.cpf,
      crp = EXCLUDED.crp,
      email = EXCLUDED.email,
      pix_key = EXCLUDED.pix_key,
      pix_type = EXCLUDED.pix_type,
      scheduled_pending_count = psychologist_payments.scheduled_pending_count + EXCLUDED.scheduled_pending_count,
      emergency_pending_count = psychologist_payments.emergency_pending_count + EXCLUDED.emergency_pending_count,
      total_pending_amount = psychologist_payments.total_pending_amount + EXCLUDED.total_pending_amount,
      updated_at = now();

    -- Log the sync update
    INSERT INTO public.payment_logs (
      psychologist_id,
      admin_id,
      action,
      scheduled_count,
      emergency_count,
      details
    ) VALUES (
      psych_record.psychologist_id,
      '00000000-0000-0000-0000-000000000000', -- System user
      'sync_update',
      scheduled_count,
      emergency_count,
      jsonb_build_object(
        'week_start', date_trunc('week', now() - interval '1 week'),
        'week_end', date_trunc('week', now()),
        'scheduled_amount', scheduled_amount,
        'emergency_amount', emergency_amount
      )
    );
  END LOOP;
END;
$$;