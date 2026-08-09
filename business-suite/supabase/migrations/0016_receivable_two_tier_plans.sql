-- Widen Receivable Manager from one plan to two (Starter / Growth) and
-- add a 'trialing' status for the 21-day Growth trial. Backfill existing
-- rows (all currently plan='standard') to 'starter' before tightening
-- the constraint so nothing is left in an invalid state.
alter table receivable_subscriptions drop constraint receivable_subscriptions_plan_check;
alter table receivable_subscriptions drop constraint receivable_subscriptions_status_check;

update receivable_subscriptions set plan = 'starter' where plan = 'standard';

alter table receivable_subscriptions add constraint receivable_subscriptions_plan_check
  check (plan = ANY (ARRAY['starter', 'growth']));
alter table receivable_subscriptions add constraint receivable_subscriptions_status_check
  check (status = ANY (ARRAY['inactive', 'active', 'trialing', 'past_due']));

alter table receivable_subscriptions alter column plan set default 'starter';
