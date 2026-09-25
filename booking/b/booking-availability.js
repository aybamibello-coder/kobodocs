// Shared slot-availability computation for KoboDocs Booking's public
// pages (booking/b/book.js and booking/reschedule/reschedule.js).
// Kept in one place so team-mode (multiple eligible staff) and
// single-staff/page-default logic can't drift between the two pages.

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function hoursAndBlackoutFor(pageData, staffId) {
  if (staffId) {
    const staff = (pageData.staff || []).find(s => s.id === staffId);
    return { hours: (staff && staff.working_hours) || {}, blackout: (staff && staff.blackout_dates) || [] };
  }
  return { hours: (pageData.settings || {}).workingHours || {}, blackout: (pageData.settings || {}).blackoutDates || [] };
}

// Computes the set of available slot start times (as ISO strings) for
// ONE staff member (or the page-level default, if staffId is null) on
// a given date, given that staff's own confirmed bookings for the day.
function slotsForOneStaff(dateStr, eventType, pageData, staffId, bookingsForStaff, excludeStartIso) {
  const { hours, blackout } = hoursAndBlackoutFor(pageData, staffId);
  if (blackout.includes(dateStr)) return [];

  const [y, m, d] = dateStr.split('-').map(Number);
  const dayDate = new Date(y, m - 1, d);
  const dayKey = DAY_KEYS[dayDate.getDay()];
  const window = hours[dayKey];
  if (!window || !window.enabled) return [];

  const [wsH, wsM] = window.start.split(':').map(Number);
  const [weH, weM] = window.end.split(':').map(Number);
  const winStart = new Date(y, m - 1, d, wsH, wsM);
  const winEnd = new Date(y, m - 1, d, weH, weM);

  const step = ((pageData.settings || {}).slotStepMinutes) || 30;
  const durationMs = eventType.duration_minutes * 60000;
  const bufBeforeMs = (eventType.buffer_before_minutes || 0) * 60000;
  const bufAfterMs = (eventType.buffer_after_minutes || 0) * 60000;
  const now = new Date();
  const slots = [];

  const relevantBookings = (bookingsForStaff || []).filter(b => {
    if (!excludeStartIso) return true;
    return new Date(b.starts_at).toISOString() !== excludeStartIso;
  });

  for (let t = winStart.getTime(); t + durationMs <= winEnd.getTime(); t += step * 60000) {
    const slotStart = new Date(t);
    if (slotStart <= now) continue;

    const rangeStart = t - bufBeforeMs;
    const rangeEnd = t + durationMs + bufAfterMs;
    const conflict = relevantBookings.some(b => {
      const bs = new Date(b.starts_at).getTime();
      const be = new Date(b.ends_at).getTime();
      return bs < rangeEnd && be > rangeStart;
    });
    if (!conflict) slots.push(slotStart);
  }
  return slots;
}

// Computes available slots for an event type, unioning across every
// eligible staff member in team mode (a time is offered if AT LEAST
// ONE eligible staff member is free then), or falling back to the
// page-level default when no staff is assigned at all.
// `existingByStaff` is the raw array from get_booking_availability_multi
// (each row tagged with its own staff_id, possibly null).
export function computeAvailableSlots(dateStr, eventType, pageData, existingByStaff, excludeStartIso) {
  const eligible = eventType.eligible_staff_ids || (eventType.staff_id ? [eventType.staff_id] : []);

  if (!eligible.length) {
    const bookingsForDefault = (existingByStaff || []).filter(b => !b.staff_id);
    return slotsForOneStaff(dateStr, eventType, pageData, null, bookingsForDefault, excludeStartIso);
  }

  const slotMap = new Map(); // iso string -> Date, de-duplicated across staff
  for (const staffId of eligible) {
    const bookingsForThisStaff = (existingByStaff || []).filter(b => b.staff_id === staffId);
    const slots = slotsForOneStaff(dateStr, eventType, pageData, staffId, bookingsForThisStaff, excludeStartIso);
    for (const s of slots) {
      slotMap.set(s.toISOString(), s);
    }
  }
  return [...slotMap.values()].sort((a, b) => a - b);
}
