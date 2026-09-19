-- TEMPORARY debug table. Squad webhook payments (cv_builder,
-- kobodocs_form, kobodocs_survey) are completing checkout but never
-- granting entitlements -- payment_intents rows for cv_builder are never
-- deleted, and cv_builder_credits/form_subscriptions/survey_subscriptions
-- are all empty. Logs every incoming webhook request so we can see
-- whether Squad is calling it, whether the signature matches, and what
-- reference it sends. Remove this table + the logging block in
-- squad-webhook once the root cause is found and fixed.

create table if not exists webhook_debug_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  headers jsonb,
  raw_body text,
  signature_received text,
  signature_expected text,
  signature_matched boolean,
  parsed_event text,
  parsed_reference text,
  outcome text
);
alter table webhook_debug_log enable row level security;
create policy "admins read webhook debug log" on webhook_debug_log for select
  using (is_kobodocs_admin(auth.uid()));
