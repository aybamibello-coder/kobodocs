-- KoboDocs Form: forms, responses, plan limits, subscriptions.
-- No payment collection anywhere in this product — KoboDocs does not hold
-- money on a form-filler's behalf. Plan upgrades are a manual/admin process.

create table if not exists forms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  title text not null default 'Untitled form',
  description text,
  slug text not null unique,
  fields jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  response_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_forms_owner_id on forms(owner_id);
create index if not exists idx_forms_slug on forms(slug);

create table if not exists form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);

create index if not exists idx_form_responses_form_id on form_responses(form_id);

create table if not exists form_plan_limits (
  key text primary key,
  display_name text not null,
  price_naira numeric not null default 0,
  max_forms integer,               -- null = unlimited
  max_submissions_per_month integer,
  max_signature_docs_per_month integer,
  features jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0
);

insert into form_plan_limits (key, display_name, price_naira, max_forms, max_submissions_per_month, max_signature_docs_per_month, features, sort_order) values
  ('free', 'Free', 0, 3, 100, 5, '["3 forms", "100 submissions/mo", "KoboDocs branding"]'::jsonb, 0),
  ('starter', 'Starter', 5000, 15, 1000, 25, '["15 forms", "1,000 submissions/mo", "Branding removable", "WhatsApp share link"]'::jsonb, 1),
  ('pro', 'Pro', 12000, null, 10000, null, '["Unlimited forms", "10,000 submissions/mo", "Conditional logic", "AI form generator", "Custom subdomain"]'::jsonb, 2),
  ('business', 'Business', 25000, null, 50000, null, '["Unlimited forms", "50,000 submissions/mo", "5 team seats", "Integrations", "Priority support"]'::jsonb, 3)
on conflict (key) do nothing;

create table if not exists form_subscriptions (
  user_id uuid primary key references profiles(id) on delete cascade,
  plan text not null default 'free' references form_plan_limits(key),
  status text not null default 'active' check (status in ('active', 'inactive')),
  billing_cycle text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table forms enable row level security;
alter table form_responses enable row level security;
alter table form_plan_limits enable row level security;
alter table form_subscriptions enable row level security;

create policy "Owners manage their forms" on forms
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "Owners view responses to their forms" on form_responses
  for select using (form_id in (select id from forms where owner_id = auth.uid()));

create policy "Owners delete responses to their forms" on form_responses
  for delete using (form_id in (select id from forms where owner_id = auth.uid()));

create policy "Anyone can view plan limits" on form_plan_limits
  for select using (true);

create policy "Users view own form subscription" on form_subscriptions
  for select using (user_id = auth.uid());

-- No insert/update/delete policies for form_responses (authenticated/anon) —
-- writes only happen inside the SECURITY DEFINER submit_form_response() below.
-- No insert/update policies for form_subscriptions — plan changes are an
-- admin-only, manual process (no payment integration in this product).

-- ---------- Effective plan limits for a user (defaults to free) ----------
create or replace function get_form_plan_limits(p_user_id uuid)
returns table (plan_key text, max_forms integer, max_submissions_per_month integer, max_signature_docs_per_month integer)
language sql
security definer
set search_path = public
as $$
  select l.key, l.max_forms, l.max_submissions_per_month, l.max_signature_docs_per_month
  from form_plan_limits l
  where l.key = coalesce(
    (
      select s.plan from form_subscriptions s
      where s.user_id = p_user_id
        and s.status = 'active'
        and (s.expires_at is null or s.expires_at > now())
    ),
    'free'
  )
$$;

-- ---------- Enforce max_forms at creation time ----------
create or replace function enforce_form_creation_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  select max_forms into v_limit from get_form_plan_limits(new.owner_id);
  if v_limit is not null then
    select count(*) into v_count from forms where owner_id = new.owner_id;
    if v_count >= v_limit then
      raise exception 'form_limit_reached' using hint = 'Upgrade your KoboDocs Form plan to create more forms.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_form_creation_limit on forms;
create trigger trg_enforce_form_creation_limit
  before insert on forms
  for each row execute function enforce_form_creation_limit();

-- ---------- Keep response_count in sync ----------
create or replace function bump_form_response_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update forms set response_count = response_count + 1, updated_at = now() where id = new.form_id;
  return new;
end;
$$;

drop trigger if exists trg_bump_form_response_count on form_responses;
create trigger trg_bump_form_response_count
  after insert on form_responses
  for each row execute function bump_form_response_count();

-- ---------- Public, no-login access (mirrors the RSVP/quote-proposal pattern) ----------
create or replace function get_public_form(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form forms%rowtype;
begin
  select * into v_form from forms where slug = p_slug and status = 'published';
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_form.id,
    'title', v_form.title,
    'description', v_form.description,
    'fields', v_form.fields,
    'settings', v_form.settings
  );
end;
$$;

revoke all on function get_public_form(text) from public;
grant execute on function get_public_form(text) to anon, authenticated;

create or replace function submit_form_response(p_slug text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form forms%rowtype;
begin
  select * into v_form from forms where slug = p_slug and status = 'published';
  if not found then
    return jsonb_build_object('success', false, 'error', 'This form is not accepting responses right now.');
  end if;

  insert into form_responses (form_id, answers) values (v_form.id, p_answers);

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function submit_form_response(text, jsonb) from public;
grant execute on function submit_form_response(text, jsonb) to anon, authenticated;

revoke all on function get_form_plan_limits(uuid) from public;
grant execute on function get_form_plan_limits(uuid) to authenticated;
