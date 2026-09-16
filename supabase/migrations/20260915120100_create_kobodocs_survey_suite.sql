-- KoboDocs Survey: surveys, responses, plan limits, subscriptions.
-- No payment collection anywhere in this product.

create table if not exists surveys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  title text not null default 'Untitled survey',
  description text,
  slug text not null unique,
  questions jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  response_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_surveys_owner_id on surveys(owner_id);
create index if not exists idx_surveys_slug on surveys(slug);

create table if not exists survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);

create index if not exists idx_survey_responses_survey_id on survey_responses(survey_id);

create table if not exists survey_plan_limits (
  key text primary key,
  display_name text not null,
  price_naira numeric not null default 0,
  max_surveys integer,               -- null = unlimited
  max_responses_per_month integer,
  max_questions_per_survey integer,  -- null = unlimited
  features jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0
);

insert into survey_plan_limits (key, display_name, price_naira, max_surveys, max_responses_per_month, max_questions_per_survey, features, sort_order) values
  ('free', 'Free', 0, 3, 100, 10, '["3 surveys", "100 responses/mo", "10 questions/survey", "KoboDocs branding"]'::jsonb, 0),
  ('plus', 'Plus', 4000, null, 2000, null, '["Unlimited surveys", "2,000 responses/mo", "Branding removed", "CSV/Excel export"]'::jsonb, 1),
  ('pro', 'Pro', 10000, null, 10000, null, '["Unlimited surveys", "10,000 responses/mo", "Skip logic", "Multilingual", "AI summary", "QR/offline collection"]'::jsonb, 2),
  ('team', 'Team', 20000, null, 50000, null, '["Unlimited surveys", "50,000 responses/mo", "5 seats", "Cross-tab analytics", "White-label reports"]'::jsonb, 3)
on conflict (key) do nothing;

create table if not exists survey_subscriptions (
  user_id uuid primary key references profiles(id) on delete cascade,
  plan text not null default 'free' references survey_plan_limits(key),
  status text not null default 'active' check (status in ('active', 'inactive')),
  billing_cycle text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table surveys enable row level security;
alter table survey_responses enable row level security;
alter table survey_plan_limits enable row level security;
alter table survey_subscriptions enable row level security;

create policy "Owners manage their surveys" on surveys
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "Owners view responses to their surveys" on survey_responses
  for select using (survey_id in (select id from surveys where owner_id = auth.uid()));

create policy "Owners delete responses to their surveys" on survey_responses
  for delete using (survey_id in (select id from surveys where owner_id = auth.uid()));

create policy "Anyone can view survey plan limits" on survey_plan_limits
  for select using (true);

create policy "Users view own survey subscription" on survey_subscriptions
  for select using (user_id = auth.uid());

-- ---------- Effective plan limits for a user (defaults to free) ----------
create or replace function get_survey_plan_limits(p_user_id uuid)
returns table (plan_key text, max_surveys integer, max_responses_per_month integer, max_questions_per_survey integer)
language sql
security definer
set search_path = public
as $$
  select l.key, l.max_surveys, l.max_responses_per_month, l.max_questions_per_survey
  from survey_plan_limits l
  where l.key = coalesce(
    (
      select s.plan from survey_subscriptions s
      where s.user_id = p_user_id
        and s.status = 'active'
        and (s.expires_at is null or s.expires_at > now())
    ),
    'free'
  )
$$;

-- ---------- Enforce max_surveys at creation time ----------
create or replace function enforce_survey_creation_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  select max_surveys into v_limit from get_survey_plan_limits(new.owner_id);
  if v_limit is not null then
    select count(*) into v_count from surveys where owner_id = new.owner_id;
    if v_count >= v_limit then
      raise exception 'survey_limit_reached' using hint = 'Upgrade your KoboDocs Survey plan to create more surveys.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_survey_creation_limit on surveys;
create trigger trg_enforce_survey_creation_limit
  before insert on surveys
  for each row execute function enforce_survey_creation_limit();

-- ---------- Keep response_count in sync ----------
create or replace function bump_survey_response_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update surveys set response_count = response_count + 1, updated_at = now() where id = new.survey_id;
  return new;
end;
$$;

drop trigger if exists trg_bump_survey_response_count on survey_responses;
create trigger trg_bump_survey_response_count
  after insert on survey_responses
  for each row execute function bump_survey_response_count();

-- ---------- Public, no-login access ----------
create or replace function get_public_survey(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survey surveys%rowtype;
begin
  select * into v_survey from surveys where slug = p_slug and status = 'published';
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_survey.id,
    'title', v_survey.title,
    'description', v_survey.description,
    'questions', v_survey.questions,
    'settings', v_survey.settings
  );
end;
$$;

revoke all on function get_public_survey(text) from public;
grant execute on function get_public_survey(text) to anon, authenticated;

create or replace function submit_survey_response(p_slug text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survey surveys%rowtype;
begin
  select * into v_survey from surveys where slug = p_slug and status = 'published';
  if not found then
    return jsonb_build_object('success', false, 'error', 'This survey is not accepting responses right now.');
  end if;

  insert into survey_responses (survey_id, answers) values (v_survey.id, p_answers);

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function submit_survey_response(text, jsonb) from public;
grant execute on function submit_survey_response(text, jsonb) to anon, authenticated;

revoke all on function get_survey_plan_limits(uuid) from public;
grant execute on function get_survey_plan_limits(uuid) to authenticated;
