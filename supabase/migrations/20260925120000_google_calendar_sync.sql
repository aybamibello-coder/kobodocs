-- Google Calendar sync for KoboDocs Booking (two-way, per-staff).
-- Each booking_staff row can connect its own Google Calendar via OAuth.
-- Tokens live only in booking_staff_google_tokens, touched only by
-- service-role edge functions (google-calendar-connect/callback/disconnect,
-- get-google-busy, sync-booking-to-google) -- never exposed to the client.
-- Owners see connection status only, via the SECURITY DEFINER RPCs below,
-- same pattern as get_booking_plan_limits.

create table if not exists booking_staff_google_tokens (
  staff_id uuid primary key references booking_staff(id) on delete cascade,
  google_email text,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  google_calendar_id text not null default 'primary',
  sync_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS enabled, no policies granted to anon/authenticated: this table is
-- only ever read or written by edge functions using the service role key,
-- which bypasses RLS. Client access goes through the RPCs below instead.
alter table booking_staff_google_tokens enable row level security;

-- Short-lived, single-use OAuth state, so the public callback endpoint can
-- trust which staff_id a code exchange belongs to without needing the
-- owner's auth header (Google's redirect is an unauthenticated browser
-- navigation). Rows are deleted the moment they're consumed; the callback
-- also opportunistically prunes anything older than 10 minutes.
create table if not exists booking_google_oauth_states (
  state text primary key,
  staff_id uuid not null references booking_staff(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table booking_google_oauth_states enable row level security;
-- No policies here either -- service role only.

-- Track the Google Calendar event a booking was pushed to, so reschedules
-- can update it in place and cancellations can remove it cleanly.
alter table bookings add column if not exists google_event_id text;

-- ---------- Owner-facing status (no tokens ever leave the table) ----------

create or replace function get_staff_google_status(p_page_id uuid)
returns table (staff_id uuid, connected boolean, google_email text, sync_enabled boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from booking_pages where id = p_page_id and owner_id = auth.uid()) then
    raise exception 'not_authorized';
  end if;

  return query
    select s.id,
           (t.staff_id is not null) as connected,
           t.google_email,
           coalesce(t.sync_enabled, false)
    from booking_staff s
    left join booking_staff_google_tokens t on t.staff_id = s.id
    where s.booking_page_id = p_page_id;
end;
$$;

revoke all on function get_staff_google_status(uuid) from public;
grant execute on function get_staff_google_status(uuid) to authenticated;

create or replace function set_staff_google_sync_enabled(p_staff_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  select p.owner_id into v_owner_id
    from booking_staff s join booking_pages p on p.id = s.booking_page_id
    where s.id = p_staff_id;

  if v_owner_id is null or v_owner_id != auth.uid() then
    raise exception 'not_authorized';
  end if;

  update booking_staff_google_tokens set sync_enabled = p_enabled, updated_at = now()
    where staff_id = p_staff_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function set_staff_google_sync_enabled(uuid, boolean) from public;
grant execute on function set_staff_google_sync_enabled(uuid, boolean) to authenticated;
