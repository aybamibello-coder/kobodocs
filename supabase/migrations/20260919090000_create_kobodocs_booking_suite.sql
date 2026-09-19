-- KoboDocs Booking: booking pages, event types, staff, appointments,
-- plan limits, subscriptions. Follows the same per-product pattern as
-- forms_*/survey_* (own subscriptions/plan_limits tables, settings
-- jsonb for everything customizable, SECURITY DEFINER RPCs for public
-- no-login access). No payment collection through the booking itself --
-- price shown on an event type is informational display text, not a
-- charge KoboDocs processes.

create table if not exists booking_pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  business_name text not null default 'My Business',
  description text,
  slug text not null unique,
  settings jsonb not null default '{}'::jsonb, -- brandColor, logoUrl, accessCode, timezone, workingHours, blackoutDates, notifyOwner, confirmationHeading/Message
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_booking_pages_owner_id on booking_pages(owner_id);
create index if not exists idx_booking_pages_slug on booking_pages(slug);

create table if not exists booking_staff (
  id uuid primary key default gen_random_uuid(),
  booking_page_id uuid not null references booking_pages(id) on delete cascade,
  name text not null,
  email text,
  working_hours jsonb not null default '{}'::jsonb, -- {"mon":[{"start":"09:00","end":"17:00"}], ...}
  blackout_dates jsonb not null default '[]'::jsonb, -- ["2026-12-25", ...]
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_booking_staff_page_id on booking_staff(booking_page_id);

create table if not exists booking_event_types (
  id uuid primary key default gen_random_uuid(),
  booking_page_id uuid not null references booking_pages(id) on delete cascade,
  staff_id uuid references booking_staff(id) on delete set null, -- null = use page-level default hours (single-staff case)
  name text not null,
  description text,
  duration_minutes integer not null default 30,
  buffer_before_minutes integer not null default 0,
  buffer_after_minutes integer not null default 0,
  price_display text, -- purely informational text like "₦5,000" or "Free consult" -- never charged by KoboDocs
  questions jsonb not null default '[]'::jsonb, -- same field-schema shape as forms.fields
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_booking_event_types_page_id on booking_event_types(booking_page_id);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  booking_page_id uuid not null references booking_pages(id) on delete cascade,
  event_type_id uuid not null references booking_event_types(id) on delete cascade,
  staff_id uuid references booking_staff(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  answers jsonb not null default '{}'::jsonb,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  cancel_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_bookings_page_id on bookings(booking_page_id);
create index if not exists idx_bookings_event_type_id on bookings(event_type_id);
create index if not exists idx_bookings_starts_at on bookings(starts_at);
create index if not exists idx_bookings_cancel_token on bookings(cancel_token);

create table if not exists booking_plan_limits (
  key text primary key,
  display_name text not null,
  price_naira numeric not null default 0,
  max_event_types integer,        -- null = unlimited
  max_bookings_per_month integer, -- null = unlimited
  max_staff integer,              -- null = unlimited
  features jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0
);

insert into booking_plan_limits (key, display_name, price_naira, max_event_types, max_bookings_per_month, max_staff, features, sort_order) values
  ('free', 'Free', 0, 1, 15, 1, '["1 event type", "15 bookings/mo", "KoboDocs branding"]'::jsonb, 0),
  ('starter', 'Starter', 6000, null, 100, 1, '["Unlimited event types", "100 bookings/mo", "Branding removable", "WhatsApp-ready confirmation link"]'::jsonb, 1),
  ('growth', 'Growth', 13000, null, null, 3, '["Unlimited bookings", "Up to 3 staff calendars", "Custom branding"]'::jsonb, 2),
  ('team', 'Team', 25000, null, null, null, '["Unlimited staff", "Priority support"]'::jsonb, 3)
on conflict (key) do nothing;

create table if not exists booking_subscriptions (
  user_id uuid primary key references profiles(id) on delete cascade,
  plan text not null default 'free' references booking_plan_limits(key),
  status text not null default 'active' check (status in ('active', 'inactive')),
  billing_cycle text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table booking_pages enable row level security;
alter table booking_staff enable row level security;
alter table booking_event_types enable row level security;
alter table bookings enable row level security;
alter table booking_plan_limits enable row level security;
alter table booking_subscriptions enable row level security;

create policy "Owners manage their booking pages" on booking_pages
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "Owners manage their booking staff" on booking_staff
  for all using (booking_page_id in (select id from booking_pages where owner_id = auth.uid()))
  with check (booking_page_id in (select id from booking_pages where owner_id = auth.uid()));

create policy "Owners manage their event types" on booking_event_types
  for all using (booking_page_id in (select id from booking_pages where owner_id = auth.uid()))
  with check (booking_page_id in (select id from booking_pages where owner_id = auth.uid()));

create policy "Owners view and manage their bookings" on bookings
  for all using (booking_page_id in (select id from booking_pages where owner_id = auth.uid()))
  with check (booking_page_id in (select id from booking_pages where owner_id = auth.uid()));

create policy "Anyone can view booking plan limits" on booking_plan_limits
  for select using (true);

create policy "Users view own booking subscription" on booking_subscriptions
  for select using (user_id = auth.uid());

-- No insert/update policies for bookings from anon/authenticated directly --
-- writes happen only inside the SECURITY DEFINER create_booking() below.
-- No insert/update policies for booking_subscriptions -- manual/admin only,
-- same pattern as form_subscriptions/survey_subscriptions.

-- ---------- Effective plan limits for a user (defaults to free) ----------
create or replace function get_booking_plan_limits(p_user_id uuid)
returns table (plan_key text, max_event_types integer, max_bookings_per_month integer, max_staff integer)
language sql
security definer
set search_path = public
as $$
  select l.key, l.max_event_types, l.max_bookings_per_month, l.max_staff
  from booking_plan_limits l
  where l.key = coalesce(
    (
      select s.plan from booking_subscriptions s
      where s.user_id = p_user_id
        and s.status = 'active'
        and (s.expires_at is null or s.expires_at > now())
    ),
    'free'
  )
$$;

revoke all on function get_booking_plan_limits(uuid) from public;
grant execute on function get_booking_plan_limits(uuid) to authenticated;

-- ---------- Enforce max_event_types at creation time ----------
create or replace function enforce_event_type_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_limit integer;
  v_count integer;
begin
  select owner_id into v_owner_id from booking_pages where id = new.booking_page_id;
  select max_event_types into v_limit from get_booking_plan_limits(v_owner_id);
  if v_limit is not null then
    select count(*) into v_count from booking_event_types where booking_page_id = new.booking_page_id;
    if v_count >= v_limit then
      raise exception 'event_type_limit_reached' using hint = 'Upgrade your KoboDocs Booking plan to add more event types.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_event_type_limit on booking_event_types;
create trigger trg_enforce_event_type_limit
  before insert on booking_event_types
  for each row execute function enforce_event_type_limit();

-- ---------- Enforce max_staff at creation time ----------
create or replace function enforce_staff_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_limit integer;
  v_count integer;
begin
  select owner_id into v_owner_id from booking_pages where id = new.booking_page_id;
  select max_staff into v_limit from get_booking_plan_limits(v_owner_id);
  if v_limit is not null then
    select count(*) into v_count from booking_staff where booking_page_id = new.booking_page_id;
    if v_count >= v_limit then
      raise exception 'staff_limit_reached' using hint = 'Upgrade your KoboDocs Booking plan to add more staff calendars.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_staff_limit on booking_staff;
create trigger trg_enforce_staff_limit
  before insert on booking_staff
  for each row execute function enforce_staff_limit();

-- ---------- Public, no-login access ----------
-- Mirrors the Forms/Survey pattern: a locked (access-code) page withholds
-- event types/availability until unlocked.

create or replace function get_public_booking_page(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page booking_pages%rowtype;
  v_has_code boolean;
  v_event_types jsonb;
  v_staff jsonb;
  v_month_start timestamptz := date_trunc('month', now());
  v_booking_count integer;
begin
  select * into v_page from booking_pages where slug = p_slug and status = 'published';
  if not found then
    return null;
  end if;

  v_has_code := coalesce(length(trim(v_page.settings->>'accessCode')), 0) > 0;

  select count(*) into v_booking_count from bookings
    where booking_page_id = v_page.id and status = 'confirmed' and created_at >= v_month_start;

  if v_has_code then
    return jsonb_build_object(
      'id', v_page.id,
      'business_name', v_page.business_name,
      'requires_access_code', true,
      'settings', (v_page.settings - 'accessCode'),
      'booking_count_this_month', v_booking_count
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(et) - 'booking_page_id' order by et.sort_order), '[]'::jsonb)
    into v_event_types
    from booking_event_types et where et.booking_page_id = v_page.id and et.active = true;

  select coalesce(jsonb_agg(to_jsonb(s) - 'booking_page_id' order by s.sort_order), '[]'::jsonb)
    into v_staff
    from booking_staff s where s.booking_page_id = v_page.id and s.active = true;

  return jsonb_build_object(
    'id', v_page.id,
    'business_name', v_page.business_name,
    'description', v_page.description,
    'settings', v_page.settings,
    'requires_access_code', false,
    'event_types', v_event_types,
    'staff', v_staff,
    'booking_count_this_month', v_booking_count
  );
end;
$$;

revoke all on function get_public_booking_page(text) from public;
grant execute on function get_public_booking_page(text) to anon, authenticated;

create or replace function unlock_booking_page(p_slug text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page booking_pages%rowtype;
  v_event_types jsonb;
  v_staff jsonb;
begin
  select * into v_page from booking_pages where slug = p_slug and status = 'published';
  if not found then
    return jsonb_build_object('success', false, 'error', 'This booking page is not accepting appointments right now.');
  end if;

  if coalesce(v_page.settings->>'accessCode', '') = '' or v_page.settings->>'accessCode' != p_code then
    return jsonb_build_object('success', false, 'error', 'That access code is incorrect.');
  end if;

  select coalesce(jsonb_agg(to_jsonb(et) - 'booking_page_id' order by et.sort_order), '[]'::jsonb)
    into v_event_types
    from booking_event_types et where et.booking_page_id = v_page.id and et.active = true;

  select coalesce(jsonb_agg(to_jsonb(s) - 'booking_page_id' order by s.sort_order), '[]'::jsonb)
    into v_staff
    from booking_staff s where s.booking_page_id = v_page.id and s.active = true;

  return jsonb_build_object(
    'success', true,
    'id', v_page.id,
    'business_name', v_page.business_name,
    'description', v_page.description,
    'settings', (v_page.settings - 'accessCode'),
    'event_types', v_event_types,
    'staff', v_staff
  );
end;
$$;

revoke all on function unlock_booking_page(text, text) from public;
grant execute on function unlock_booking_page(text, text) to anon, authenticated;

-- Existing confirmed bookings in a date range for a staff member (or the
-- whole page, when staff_id is null), so the client can compute open slots.
create or replace function get_booking_availability(p_slug text, p_staff_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page_id uuid;
  v_result jsonb;
begin
  select id into v_page_id from booking_pages where slug = p_slug and status = 'published';
  if v_page_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('starts_at', b.starts_at, 'ends_at', b.ends_at)), '[]'::jsonb)
    into v_result
    from bookings b
    where b.booking_page_id = v_page_id
      and b.status = 'confirmed'
      and b.starts_at < p_to
      and b.ends_at > p_from
      and (p_staff_id is null or b.staff_id is not distinct from p_staff_id);

  return v_result;
end;
$$;

revoke all on function get_booking_availability(text, uuid, timestamptz, timestamptz) from public;
grant execute on function get_booking_availability(text, uuid, timestamptz, timestamptz) to anon, authenticated;

create or replace function create_booking(
  p_slug text,
  p_event_type_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_answers jsonb,
  p_starts_at timestamptz,
  p_honeypot text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page booking_pages%rowtype;
  v_event booking_event_types%rowtype;
  v_ends_at timestamptz;
  v_buffer_before interval;
  v_buffer_after interval;
  v_limit integer;
  v_count integer;
  v_conflict_count integer;
  v_booking_id uuid;
  v_cancel_token uuid;
begin
  if p_honeypot is not null and length(trim(p_honeypot)) > 0 then
    return jsonb_build_object('success', true); -- fake success for bots, write nothing
  end if;

  select * into v_page from booking_pages where slug = p_slug and status = 'published';
  if not found then
    return jsonb_build_object('success', false, 'error', 'This booking page is not accepting appointments right now.');
  end if;

  select * into v_event from booking_event_types where id = p_event_type_id and booking_page_id = v_page.id and active = true;
  if not found then
    return jsonb_build_object('success', false, 'error', 'That appointment type is not available.');
  end if;

  if p_starts_at < now() then
    return jsonb_build_object('success', false, 'error', 'That time has already passed.');
  end if;

  select max_bookings_per_month into v_limit from get_booking_plan_limits(v_page.owner_id);
  if v_limit is not null then
    select count(*) into v_count from bookings
      where booking_page_id = v_page.id and status = 'confirmed' and created_at >= date_trunc('month', now());
    if v_count >= v_limit then
      return jsonb_build_object('success', false, 'error', 'This business has reached its monthly booking limit. Please contact them directly.');
    end if;
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_event.duration_minutes);
  v_buffer_before := make_interval(mins => v_event.buffer_before_minutes);
  v_buffer_after := make_interval(mins => v_event.buffer_after_minutes);

  select count(*) into v_conflict_count
    from bookings b
    where b.booking_page_id = v_page.id
      and b.status = 'confirmed'
      and b.staff_id is not distinct from v_event.staff_id
      and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts_at - v_buffer_before, v_ends_at + v_buffer_after);

  if v_conflict_count > 0 then
    return jsonb_build_object('success', false, 'error', 'That time slot was just taken. Please pick another.');
  end if;

  insert into bookings (booking_page_id, event_type_id, staff_id, customer_name, customer_phone, customer_email, answers, starts_at, ends_at)
  values (v_page.id, v_event.id, v_event.staff_id, p_customer_name, p_customer_phone, p_customer_email, p_answers, p_starts_at, v_ends_at)
  returning id, cancel_token into v_booking_id, v_cancel_token;

  return jsonb_build_object('success', true, 'booking_id', v_booking_id, 'cancel_token', v_cancel_token, 'starts_at', p_starts_at, 'ends_at', v_ends_at);
end;
$$;

revoke all on function create_booking(text, uuid, text, text, text, jsonb, timestamptz, text) from public;
grant execute on function create_booking(text, uuid, text, text, text, jsonb, timestamptz, text) to anon, authenticated;

-- Cancel a booking via the token sent to the customer, no login needed.
create or replace function cancel_booking(p_cancel_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update bookings set status = 'cancelled'
    where cancel_token = p_cancel_token and status = 'confirmed';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('success', false, 'error', 'Booking not found or already cancelled.');
  end if;
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function cancel_booking(uuid) from public;
grant execute on function cancel_booking(uuid) to anon, authenticated;
