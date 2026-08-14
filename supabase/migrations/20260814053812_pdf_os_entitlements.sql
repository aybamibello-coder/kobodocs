-- PDF OS entitlements & usage tracking
-- Separate from pdf_toolkit_subscriptions by design (own subscription, per
-- product decision) — a user may hold both, either, or neither.

create table if not exists pdf_os_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('free', 'pro', 'business')),
  status text not null check (status in ('active', 'cancelled', 'past_due')),
  provider text not null default 'squad',
  provider_customer_id text,
  provider_subscription_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table pdf_os_subscriptions enable row level security;

create policy "users read own pdf_os subscription"
  on pdf_os_subscriptions for select
  using (auth.uid() = user_id);
-- No insert/update/delete policy for authenticated users: only the
-- service-role payment webhook writes this table, same pattern as
-- pdf_toolkit_subscriptions / squad-webhook.

create table if not exists pdf_os_usage_current_period (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agent_runs_used int not null default 0,
  ai_actions_used int not null default 0,
  period_start timestamptz not null default date_trunc('month', now()),
  period_end timestamptz not null default (date_trunc('month', now()) + interval '1 month')
);

alter table pdf_os_usage_current_period enable row level security;

create policy "users read own pdf_os usage"
  on pdf_os_usage_current_period for select
  using (auth.uid() = user_id);

-- Plan limits. Kept in a lookup table (not hardcoded in the RPCs) so
-- pricing changes don't require a migration.
create table if not exists pdf_os_plan_limits (
  plan text primary key,
  agent_runs_per_period int not null,
  ai_actions_per_period int not null
);

insert into pdf_os_plan_limits (plan, agent_runs_per_period, ai_actions_per_period) values
  ('free', 10, 15),
  ('pro', 300, 999999),
  ('business', 999999, 999999)
on conflict (plan) do update set
  agent_runs_per_period = excluded.agent_runs_per_period,
  ai_actions_per_period = excluded.ai_actions_per_period;

-- Atomic check-and-increment for agent runs. Called once per planning
-- turn from pdf-os-agent-plan. SECURITY DEFINER + advisory lock avoids a
-- race between two concurrent requests from the same user.
create or replace function consume_pdf_os_agent_run(p_user_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_plan text;
  v_limit int;
  v_used int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':agent_run'));

  select coalesce(
    (select plan from pdf_os_subscriptions
       where user_id = p_user_id and status = 'active'
         and (expires_at is null or expires_at > now())),
    'free'
  ) into v_plan;

  select agent_runs_per_period into v_limit from pdf_os_plan_limits where plan = v_plan;

  insert into pdf_os_usage_current_period (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  -- reset counters if the period has rolled over
  update pdf_os_usage_current_period
  set agent_runs_used = 0, ai_actions_used = 0,
      period_start = date_trunc('month', now()),
      period_end = date_trunc('month', now()) + interval '1 month'
  where user_id = p_user_id and period_end <= now();

  select agent_runs_used into v_used from pdf_os_usage_current_period where user_id = p_user_id;

  if v_used >= v_limit then
    return false;
  end if;

  update pdf_os_usage_current_period
  set agent_runs_used = agent_runs_used + 1
  where user_id = p_user_id;

  return true;
end;
$$;

-- Same pattern for AI actions (ocr/ask/summarize/extract), called from
-- each REMOTE tool's edge function via requireAiQuota().
create or replace function consume_pdf_os_ai_action(p_user_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_plan text;
  v_limit int;
  v_used int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':ai_action'));

  select coalesce(
    (select plan from pdf_os_subscriptions
       where user_id = p_user_id and status = 'active'
         and (expires_at is null or expires_at > now())),
    'free'
  ) into v_plan;

  select ai_actions_per_period into v_limit from pdf_os_plan_limits where plan = v_plan;

  insert into pdf_os_usage_current_period (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update pdf_os_usage_current_period
  set agent_runs_used = 0, ai_actions_used = 0,
      period_start = date_trunc('month', now()),
      period_end = date_trunc('month', now()) + interval '1 month'
  where user_id = p_user_id and period_end <= now();

  select ai_actions_used into v_used from pdf_os_usage_current_period where user_id = p_user_id;

  if v_used >= v_limit then
    return false;
  end if;

  update pdf_os_usage_current_period
  set ai_actions_used = ai_actions_used + 1
  where user_id = p_user_id;

  return true;
end;
$$;
