-- Automatic 24h-before appointment reminders for KoboDocs Booking.
-- Zero new cost: reuses Resend (already integrated for welcome emails
-- and receivable reminders) and pg_cron (a free Postgres extension
-- Supabase already has enabled) -- same pattern as
-- send-receivable-reminders / send-compliance-reminders.
--
-- NOTE: the real x-cron-secret value lives only in the Supabase
-- project's Edge Function secrets (CRON_SECRET) and in the
-- already-applied pg_cron job below -- it is intentionally NOT
-- committed here. If re-running this migration from scratch, replace
-- <CRON_SECRET> with that value first.

alter table bookings add column if not exists reminder_sent_at timestamptz;

select cron.schedule(
  'send-booking-reminders-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1/send-booking-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
