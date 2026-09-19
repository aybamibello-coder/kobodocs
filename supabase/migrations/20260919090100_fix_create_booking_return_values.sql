-- Bug fix: the first version of create_booking() reused unrelated
-- integer variables for the RETURNING clause instead of declaring
-- proper uuid variables, so the booking id and cancel_token were
-- never actually returned to the caller (needed for a "manage your
-- booking" link and for the confirmation email).

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
