-- Mantém a função check-subscription ligada. Com pouco uso ela desliga entre
-- um login e outro, e o primeiro login esperava a função iniciar antes de
-- mostrar o plano na tela inicial. A cada 5 minutos o banco chama o caminho
-- de aquecimento (GET), que responde 204 sem ler login, gravar nada ou chamar
-- o Stripe. Na mesma região do banco (sa-east-1), onde rodam os pacientes.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('check-subscription-warm')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-subscription-warm');

SELECT cron.schedule(
  'check-subscription-warm',
  '*/5 * * * *',
  $cron$
  SELECT net.http_get(
    url := 'https://ihrrgmmsfuvlasmzdmwf.supabase.co/functions/v1/check-subscription',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlocnJnbW1zZnV2bGFzbXpkbXdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1NDMzMDcsImV4cCI6MjA2OTExOTMwN30.6hRDCL5alu-Bs4kT4jKYJW3G3zmeBJDZB5udruQzOFU"}'::jsonb
  );
  $cron$
);
