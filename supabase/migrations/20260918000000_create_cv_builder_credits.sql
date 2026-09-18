-- KoboDocs Resume: pay-as-you-go "clean download" credits.
-- Building and previewing a CV is always free, on any template. One credit
-- removes the "Made with KoboDocs" watermark from one PDF download. Active
-- Pro/Business subscribers never consume credits — that check happens
-- against the existing profiles.plan / plan_expires_at columns in
-- resume.js, the same pattern every other Pro-gated tool on the site uses.
-- Only the service-role payment webhook writes this table.

create table if not exists cv_builder_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits_balance int not null default 0,
  updated_at timestamptz not null default now()
);

alter table cv_builder_credits enable row level security;

create policy "users read own cv builder credits"
  on cv_builder_credits for select
  using (auth.uid() = user_id);
-- No insert/update/delete policy for authenticated users — credits are
-- only ever added by squad-webhook (service role) after a verified
-- payment, and only ever spent via the consume_cv_builder_credit()
-- function below, which also runs as the definer, not the caller.

-- Atomic check-and-decrement, called right before a clean/no-watermark
-- download. Returns true if a credit was available and has now been
-- spent, false if the balance was already zero. The advisory lock avoids
-- a race between two tabs/downloads from the same user.
create or replace function consume_cv_builder_credit(p_user_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_balance int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':cv_credit'));

  select credits_balance into v_balance
  from cv_builder_credits
  where user_id = p_user_id;

  if v_balance is null or v_balance < 1 then
    return false;
  end if;

  update cv_builder_credits
  set credits_balance = credits_balance - 1,
      updated_at = now()
  where user_id = p_user_id;

  return true;
end;
$$;
