-- Enable Realtime for patients table
ALTER TABLE public.patients REPLICA IDENTITY FULL;

-- Add patients table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.patients;

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule weekly goals reset every Monday at 01:00 AM BRT (04:00 AM UTC)
-- Cron expression: '0 4 * * 1' means: minute 0, hour 4 UTC (1 AM BRT), any day of month, any month, Monday (1)
SELECT cron.schedule(
  'reset-weekly-goals-monday',
  '0 4 * * 1',
  $$
  SELECT
    net.http_post(
      url:='https://ihrrgmmsfuvlasmzdmwf.supabase.co/functions/v1/reset-weekly-goals',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlocnJnbW1zZnV2bGFzbXpkbXdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1NDMzMDcsImV4cCI6MjA2OTExOTMwN30.6hRDCL5alu-Bs4kT4jKYJW3G3zmeBJDZB5udruQzOFU"}'::jsonb,
      body:=concat('{"timestamp": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);