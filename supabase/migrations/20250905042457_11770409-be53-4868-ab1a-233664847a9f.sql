-- Create weekly payment sync cron job
-- This will run every Monday at 9:00 AM to sync previous week's payments
SELECT cron.schedule(
  'weekly-payment-sync',
  '0 9 * * 1', -- Every Monday at 9:00 AM
  $$
  SELECT net.http_post(
    url := 'https://ihrrgmmsfuvlasmzdmwf.supabase.co/functions/v1/payment-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlocnJnbW1zZnV2bGFzbXpkbXdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1NDMzMDcsImV4cCI6MjA2OTExOTMwN30.6hRDCL5alu-Bs4kT4jKYJW3G3zmeBJDZB5udruQzOFU"}'::jsonb,
    body := '{"source": "weekly_cron"}'::jsonb
  );
  $$
);