-- Google Calendar sync for KoboDocs Booking, per-staff, two-way.
--
-- booking_calendar_connections already exists in production (created
-- directly via SQL by an earlier session, alongside the
-- google-calendar-auth-url / google-calendar-oauth-callback /
-- get-google-calendar-busy / create-google-calendar-event edge
-- functions). It's documented here for the record, matching this repo's
-- existing convention of committing already-live schema after the fact.
-- This migration only adds what was still missing: the column bookings
-- needs to remember which Google event a booking maps to, and the
-- SECURITY DEFINER RPC the owner-facing UI uses to see connection status
-- without ever touching the stored tokens directly.

create table if not exists booking_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  booking_page_id uuid not null references booking_pages(id) on delete cascade,
  staff_id uuid references booking_staff(id) on delete cascade,
  google_email text,
  calendar_id text not null default 'primary',
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_page_id, staff_id)
);

alter table booking_calendar_connections enable row level security;
-- No policies: tokens live here and only ever move through edge functions
-- using the service role. Owners see status via get_calendar_connection_status
-- below, never the raw table.

-- Lets reschedule/cancel find and update the right Google event later.
alter table bookings add column if not exists google_event_id text;

create or replace function get_calendar_connection_status(p_page_id uuid)
returns table (staff_id uuid, connected boolean, google_email text)
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
           (c.id is not null) as connected,
           c.google_email
    from booking_staff s
    left join booking_calendar_connections c
      on c.booking_page_id = p_page_id and c.staff_id = s.id
    where s.booking_page_id = p_page_id;
end;
$$;

revoke all on function get_calendar_connection_status(uuid) from public;
grant execute on function get_calendar_connection_status(uuid) to authenticated;
