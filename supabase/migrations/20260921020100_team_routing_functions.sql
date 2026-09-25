-- Full bodies of the three functions updated for team routing (see
-- 20260921020000_team_routing.sql for the schema/context). Deployed
-- directly to Supabase in this session; this is the authoritative
-- source, kept in sync with what's live.

create or replace function get_public_booking_page(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
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

  select coalesce(jsonb_agg((to_jsonb(et) - 'booking_page_id') || jsonb_build_object('eligible_staff_ids', get_eligible_staff_ids(et.id)) order by et.sort_order), '[]'::jsonb)
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

create or replace function create_booking(p_slug text, p_event_type_id uuid, p_customer_name text, p_customer_phone text, p_customer_email text, p_answers jsonb, p_starts_at timestamptz, p_honeypot text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_page booking_pages%rowtype;
  v_event booking_event_types%rowtype;
  v_ends_at timestamptz;
  v_buffer_before interval;
  v_buffer_after interval;
  v_limit integer;
  v_count integer;
  v_booking_id uuid;
  v_cancel_token uuid;
  v_eligible_staff uuid[];
  v_assigned_staff uuid;
  v_candidate uuid;
  v_candidate_busy_count integer;
  v_best_count integer := null;
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

  v_eligible_staff := get_eligible_staff_ids(p_event_type_id);

  if array_length(v_eligible_staff, 1) is null then
    if exists (
      select 1 from bookings b
      where b.booking_page_id = v_page.id
        and b.status = 'confirmed'
        and b.staff_id is null
        and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts_at - v_buffer_before, v_ends_at + v_buffer_after)
    ) then
      return jsonb_build_object('success', false, 'error', 'That time slot was just taken. Please pick another.');
    end if;
    v_assigned_staff := null;

  elsif array_length(v_eligible_staff, 1) = 1 then
    v_assigned_staff := v_eligible_staff[1];
    if exists (
      select 1 from bookings b
      where b.booking_page_id = v_page.id
        and b.status = 'confirmed'
        and b.staff_id = v_assigned_staff
        and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts_at - v_buffer_before, v_ends_at + v_buffer_after)
    ) then
      return jsonb_build_object('success', false, 'error', 'That time slot was just taken. Please pick another.');
    end if;

  else
    foreach v_candidate in array v_eligible_staff loop
      if exists (
        select 1 from bookings b
        where b.booking_page_id = v_page.id
          and b.status = 'confirmed'
          and b.staff_id = v_candidate
          and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts_at - v_buffer_before, v_ends_at + v_buffer_after)
      ) then
        continue;
      end if;

      select count(*) into v_candidate_busy_count from bookings b
        where b.booking_page_id = v_page.id
          and b.staff_id = v_candidate
          and b.status = 'confirmed'
          and b.starts_at::date = p_starts_at::date;

      if v_best_count is null or v_candidate_busy_count < v_best_count then
        v_best_count := v_candidate_busy_count;
        v_assigned_staff := v_candidate;
      end if;
    end loop;

    if v_assigned_staff is null then
      return jsonb_build_object('success', false, 'error', 'That time slot was just taken. Please pick another.');
    end if;
  end if;

  insert into bookings (booking_page_id, event_type_id, staff_id, customer_name, customer_phone, customer_email, answers, starts_at, ends_at)
  values (v_page.id, v_event.id, v_assigned_staff, p_customer_name, p_customer_phone, p_customer_email, p_answers, p_starts_at, v_ends_at)
  returning id, cancel_token into v_booking_id, v_cancel_token;

  return jsonb_build_object('success', true, 'booking_id', v_booking_id, 'cancel_token', v_cancel_token, 'starts_at', p_starts_at, 'ends_at', v_ends_at);
end;
$$;

create or replace function reschedule_booking(p_cancel_token uuid, p_new_starts_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_booking bookings%rowtype;
  v_event booking_event_types%rowtype;
  v_new_ends_at timestamptz;
  v_buffer_before interval;
  v_buffer_after interval;
  v_eligible_staff uuid[];
  v_assigned_staff uuid;
  v_candidate uuid;
  v_candidate_busy_count integer;
  v_best_count integer := null;
begin
  select * into v_booking from bookings where cancel_token = p_cancel_token and status = 'confirmed';
  if not found then
    return jsonb_build_object('success', false, 'error', 'Booking not found, already cancelled, or already completed.');
  end if;

  if p_new_starts_at < now() then
    return jsonb_build_object('success', false, 'error', 'That time has already passed.');
  end if;

  select * into v_event from booking_event_types where id = v_booking.event_type_id;

  v_new_ends_at := p_new_starts_at + make_interval(mins => v_event.duration_minutes);
  v_buffer_before := make_interval(mins => v_event.buffer_before_minutes);
  v_buffer_after := make_interval(mins => v_event.buffer_after_minutes);

  v_eligible_staff := get_eligible_staff_ids(v_booking.event_type_id);

  if array_length(v_eligible_staff, 1) is null then
    if exists (
      select 1 from bookings b
      where b.booking_page_id = v_booking.booking_page_id
        and b.id <> v_booking.id
        and b.status = 'confirmed'
        and b.staff_id is null
        and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_new_starts_at - v_buffer_before, v_new_ends_at + v_buffer_after)
    ) then
      return jsonb_build_object('success', false, 'error', 'That time slot was just taken. Please pick another.');
    end if;
    v_assigned_staff := null;

  else
    if v_booking.staff_id = any(v_eligible_staff) and not exists (
      select 1 from bookings b
      where b.booking_page_id = v_booking.booking_page_id
        and b.id <> v_booking.id
        and b.status = 'confirmed'
        and b.staff_id = v_booking.staff_id
        and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_new_starts_at - v_buffer_before, v_new_ends_at + v_buffer_after)
    ) then
      v_assigned_staff := v_booking.staff_id;
    else
      foreach v_candidate in array v_eligible_staff loop
        if exists (
          select 1 from bookings b
          where b.booking_page_id = v_booking.booking_page_id
            and b.id <> v_booking.id
            and b.status = 'confirmed'
            and b.staff_id = v_candidate
            and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_new_starts_at - v_buffer_before, v_new_ends_at + v_buffer_after)
        ) then
          continue;
        end if;

        select count(*) into v_candidate_busy_count from bookings b
          where b.booking_page_id = v_booking.booking_page_id
            and b.staff_id = v_candidate
            and b.status = 'confirmed'
            and b.starts_at::date = p_new_starts_at::date;

        if v_best_count is null or v_candidate_busy_count < v_best_count then
          v_best_count := v_candidate_busy_count;
          v_assigned_staff := v_candidate;
        end if;
      end loop;

      if v_assigned_staff is null then
        return jsonb_build_object('success', false, 'error', 'That time slot was just taken. Please pick another.');
      end if;
    end if;
  end if;

  update bookings
    set starts_at = p_new_starts_at,
        ends_at = v_new_ends_at,
        staff_id = v_assigned_staff,
        reminder_sent_at = null
    where id = v_booking.id;

  return jsonb_build_object('success', true, 'starts_at', p_new_starts_at, 'ends_at', v_new_ends_at, 'cancel_token', v_booking.cancel_token);
end;
$$;
