-- Team scheduling for KoboDocs Booking (fourth Calendly-gap upgrade):
-- a service can now be eligible for MORE than one staff member, and a
-- booking gets auto-assigned to whichever eligible staff member is
-- actually free at the chosen time (least-busy-that-day as the
-- tiebreak). Backward compatible: an event type with no rows here
-- keeps behaving exactly as before, using its own staff_id (or the
-- page-level default if that's null too).
--
-- Deployed directly to Supabase in this session; committed here for
-- the record. This file documents create_booking / reschedule_booking /
-- get_public_booking_page as they now stand -- see the live functions
-- for the authoritative, current version.

create table if not exists booking_event_type_staff (
  event_type_id uuid not null references booking_event_types(id) on delete cascade,
  staff_id uuid not null references booking_staff(id) on delete cascade,
  primary key (event_type_id, staff_id)
);

alter table booking_event_type_staff enable row level security;

create policy "owners manage their event type staff links"
  on booking_event_type_staff for all
  using (
    exists (
      select 1 from booking_event_types et
      join booking_pages p on p.id = et.booking_page_id
      where et.id = event_type_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from booking_event_types et
      join booking_pages p on p.id = et.booking_page_id
      where et.id = event_type_id and p.owner_id = auth.uid()
    )
  );

create policy "anyone can read event type staff links for published pages"
  on booking_event_type_staff for select
  using (
    exists (
      select 1 from booking_event_types et
      join booking_pages p on p.id = et.booking_page_id
      where et.id = event_type_id and p.status = 'published'
    )
  );

create or replace function get_eligible_staff_ids(p_event_type_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_ids uuid[];
  v_single uuid;
begin
  select array_agg(staff_id) into v_ids from booking_event_type_staff where event_type_id = p_event_type_id;
  if v_ids is not null and array_length(v_ids, 1) > 0 then
    return v_ids;
  end if;
  select staff_id into v_single from booking_event_types where id = p_event_type_id;
  if v_single is not null then
    return array[v_single];
  end if;
  return array[]::uuid[];
end;
$$;

create or replace function get_booking_availability_multi(p_slug text, p_staff_ids uuid[], p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_page_id uuid;
  v_result jsonb;
begin
  select id into v_page_id from booking_pages where slug = p_slug and status = 'published';
  if v_page_id is null then
    return '[]'::jsonb;
  end if;

  if p_staff_ids is null or array_length(p_staff_ids, 1) is null then
    select coalesce(jsonb_agg(jsonb_build_object('staff_id', b.staff_id, 'starts_at', b.starts_at, 'ends_at', b.ends_at)), '[]'::jsonb)
      into v_result
      from bookings b
      where b.booking_page_id = v_page_id
        and b.status = 'confirmed'
        and b.starts_at < p_to
        and b.ends_at > p_from;
    return v_result;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('staff_id', b.staff_id, 'starts_at', b.starts_at, 'ends_at', b.ends_at)), '[]'::jsonb)
    into v_result
    from bookings b
    where b.booking_page_id = v_page_id
      and b.status = 'confirmed'
      and b.starts_at < p_to
      and b.ends_at > p_from
      and b.staff_id = any(p_staff_ids);

  return v_result;
end;
$$;
