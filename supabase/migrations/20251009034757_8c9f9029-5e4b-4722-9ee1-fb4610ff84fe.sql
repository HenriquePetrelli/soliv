-- Schedule reset_weekly_goals to run every Monday at 01:00 AM (Brasília Time)
-- Note: pg_cron uses UTC, so we need to adjust for Brasília (UTC-3)
-- 01:00 AM Brasília = 04:00 AM UTC

SELECT cron.schedule(
  'reset-weekly-goals-monday',
  '0 4 * * 1',
  $$
  SELECT reset_weekly_goals();
  $$
);