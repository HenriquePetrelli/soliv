-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule cron job to auto-decline expired pending appointments (runs every hour)
SELECT cron.schedule(
  'auto-decline-expired-appointments',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT
    net.http_post(
        url:='https://ihrrgmmsfuvlasmzdmwf.supabase.co/functions/v1/auto-decline-appointments',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlocnJnbW1zZnV2bGFzbXpkbXdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1NDMzMDcsImV4cCI6MjA2OTExOTMwN30.6hRDCL5alu-Bs4kT4jKYJW3G3zmeBJDZB5udruQzOFU"}'::jsonb,
        body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);

-- Add indexes for better performance on appointment queries
CREATE INDEX IF NOT EXISTS idx_appointments_status_created ON appointments(status, created_at);
CREATE INDEX IF NOT EXISTS idx_appointments_psychologist_status ON appointments(psychologist_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_status ON appointments(patient_id, status);