-- Create a cron job to run cleanup daily at 3 AM
-- First enable the pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the cleanup job to run daily at 3 AM
SELECT cron.schedule(
  'psychologist-cleanup-daily',
  '0 3 * * *', -- Every day at 3:00 AM
  $$
  SELECT net.http_post(
    url := 'https://ihrrgmmsfuvlasmzdmwf.supabase.co/functions/v1/psychologist-cleanup',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlocnJnbW1zZnV2bGFzbXpkbXdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1NDMzMDcsImV4cCI6MjA2OTExOTMwN30.6hRDCL5alu-Bs4kT4jKYJW3G3zmeBJDZB5udruQzOFU"}'::jsonb,
    body := '{"source": "cron"}'::jsonb
  );
  $$
);