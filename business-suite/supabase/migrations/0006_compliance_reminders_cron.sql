-- Daily cron job that triggers the send-compliance-reminders edge function.
-- Applied directly on the live project via the Supabase MCP (job id 2).
-- NOTE: the real x-cron-secret value lives only in the Supabase project's
-- Edge Function secrets (CRON_SECRET) and in the already-applied pg_cron
-- job below — it is intentionally NOT committed here. If re-running this
-- migration from scratch, replace <CRON_SECRET> with that value first.
-- (The existing receivable-reminders-daily job follows the same pattern
-- and was likewise never checked into this migrations folder.)

select cron.schedule(
  'compliance-reminders-daily',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1/send-compliance-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
