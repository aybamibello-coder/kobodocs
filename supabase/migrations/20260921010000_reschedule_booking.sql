-- Reschedule flow for KoboDocs Booking (third Calendly-gap upgrade).
-- Reuses the existing public get_public_booking_page / get_booking_availability
-- RPCs client-side (same slot-picker UI and logic as a fresh booking) --
-- these two new functions just bridge a cancel_token to what's needed to
-- drive that picker, and apply the change safely server-side, mirroring
-- create_booking's own conflict-checking logic exactly.

create or replace function get_booking_for_reschedule(p_cancel_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_booking bookings%rowtype;
  v_page booking_pages%rowtype;
  v_event booking_event_types%rowtype;
begin
  select * into v_booking from bookings where cancel_token = p_cancel_token and status = 'confirmed';
  if not found then
    return jsonb_build_object('success', false, 'error', 'Booking not found, already cancelled, or already completed.');
  end if;

  select * into v_page from booking_pages where id = v_booking.booking_page_id;
  select * into v_event from booking_event_types where id = v_booking.event_type_id;

  return jsonb_build_object(
    'success', true,
    'slug', v_page.slug,
    'business_name', v_page.business_name,
    'event_type_id', v_booking.event_type_id,
    'service_name', v_event.name,
    'current_starts_at', v_booking.starts_at
  );
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
  v_conflict_count integer;
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

  select count(*) into v_conflict_count
    from bookings b
    where b.booking_page_id = v_booking.booking_page_id
      and b.id <> v_booking.id
      and b.status = 'confirmed'
      and b.staff_id is not distinct from v_booking.staff_id
      and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_new_starts_at - v_buffer_before, v_new_ends_at + v_buffer_after);

  if v_conflict_count > 0 then
    return jsonb_build_object('success', false, 'error', 'That time slot was just taken. Please pick another.');
  end if;

  update bookings
    set starts_at = p_new_starts_at,
        ends_at = v_new_ends_at,
        reminder_sent_at = null
    where id = v_booking.id;

  return jsonb_build_object('success', true, 'starts_at', p_new_starts_at, 'ends_at', v_new_ends_at, 'cancel_token', v_booking.cancel_token);
end;
$$;
