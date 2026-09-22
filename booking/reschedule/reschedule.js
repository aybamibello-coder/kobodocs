import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://vwmzulzluaxedkozxjfy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4HDVb8ZzRh1W-Z97m2uT1Q_4FwH6bTt';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const token = new URLSearchParams(window.location.search).get('t');
const card = document.getElementById('card');

let pageData = null;
let eventType = null;
let bookingInfo = null;
let selectedSlotIso = null;

function nextNDays(n) {
  const days = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWorkingHoursFor(et) {
  if (et.staff_id) {
    const staff = (pageData.staff || []).find(s => s.id === et.staff_id);
    return { hours: (staff && staff.working_hours) || {}, blackout: (staff && staff.blackout_dates) || [] };
  }
  return { hours: (pageData.settings || {}).workingHours || {}, blackout: (pageData.settings || {}).blackoutDates || [] };
}

function renderError(title, desc) {
  card.innerHTML = `<div class="fill-title">${title}</div><div class="fill-desc">${desc}</div>`;
}

function renderPicker() {
  const days = nextNDays(14);
  const currentDt = new Date(bookingInfo.current_starts_at);
  card.innerHTML = `
    <div class="fill-title">Reschedule your appointment</div>
    <div class="current-time-box">
      <strong>${bookingInfo.service_name}</strong> with ${bookingInfo.business_name}<br>
      Currently: ${currentDt.toLocaleString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
    </div>
    <div class="day-picker" id="dayPicker">
      ${days.map(d => `
        <button type="button" class="day-btn" data-date="${dateStr(d)}">
          <span class="dow">${d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
          ${d.getDate()}
        </button>
      `).join('')}
    </div>
    <div id="slotsWrap"><div class="empty-note">Pick a day to see available times.</div></div>
    <button type="button" class="fill-submit" id="confirmBtn" style="display:none;">Confirm new time</button>
  `;
  document.getElementById('dayPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('.day-btn');
    if (!btn) return;
    document.querySelectorAll('.day-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('confirmBtn').style.display = 'none';
    selectedSlotIso = null;
    loadSlotsForDate(btn.dataset.date);
  });
}

async function loadSlotsForDate(dStr) {
  const wrap = document.getElementById('slotsWrap');
  wrap.innerHTML = `<div class="empty-note">Loading times…</div>`;

  const { hours, blackout } = getWorkingHoursFor(eventType);
  if (blackout.includes(dStr)) {
    wrap.innerHTML = `<div class="empty-note">Not available on this day. Please pick another.</div>`;
    return;
  }

  const [y, m, d] = dStr.split('-').map(Number);
  const dayDate = new Date(y, m - 1, d);
  const dayKey = DAY_KEYS[dayDate.getDay()];
  const window = hours[dayKey];
  if (!window || !window.enabled) {
    wrap.innerHTML = `<div class="empty-note">Not available on this day. Please pick another.</div>`;
    return;
  }

  const dayStart = new Date(y, m - 1, d, 0, 0, 0);
  const dayEnd = new Date(y, m - 1, d, 23, 59, 59);

  const { data: existing } = await supabase.rpc('get_booking_availability', {
    p_slug: pageData.slug || bookingInfo.slug,
    p_staff_id: eventType.staff_id || null,
    p_from: dayStart.toISOString(),
    p_to: dayEnd.toISOString(),
  });

  // Exclude this booking's own current slot from the conflict list --
  // otherwise it would block itself from showing as available (matched
  // by start time, since get_booking_availability doesn't return an id).
  const currentStartIso = new Date(bookingInfo.current_starts_at).toISOString();
  const otherBookings = (existing || []).filter(b => new Date(b.starts_at).toISOString() !== currentStartIso);

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

  for (let t = winStart.getTime(); t + durationMs <= winEnd.getTime(); t += step * 60000) {
    const slotStart = new Date(t);
    if (slotStart <= now) continue;

    const rangeStart = t - bufBeforeMs;
    const rangeEnd = t + durationMs + bufAfterMs;
    const conflict = otherBookings.some(b => {
      const bs = new Date(b.starts_at).getTime();
      const be = new Date(b.ends_at).getTime();
      return bs < rangeEnd && be > rangeStart;
    });
    if (!conflict) slots.push(slotStart);
  }

  if (!slots.length) {
    wrap.innerHTML = `<div class="empty-note">No times left on this day. Please pick another.</div>`;
    return;
  }

  wrap.innerHTML = `<div class="slot-grid">${slots.map(s => `
    <button type="button" class="slot-btn" data-iso="${s.toISOString()}">${s.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</button>
  `).join('')}</div>`;

  wrap.querySelector('.slot-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.slot-btn');
    if (!btn) return;
    wrap.querySelectorAll('.slot-btn').forEach(b => b.classList.toggle('selected', b === btn));
    selectedSlotIso = btn.dataset.iso;
    document.getElementById('confirmBtn').style.display = '';
  });
}

async function doReschedule() {
  const btn = document.getElementById('confirmBtn');
  btn.disabled = true;
  btn.textContent = 'Rescheduling…';
  const { data, error } = await supabase.rpc('reschedule_booking', {
    p_cancel_token: token,
    p_new_starts_at: selectedSlotIso,
  });
  if (error || !data || !data.success) {
    btn.disabled = false;
    btn.textContent = 'Confirm new time';
    alert((data && data.error) || 'Could not reschedule. Please try again.');
    return;
  }
  const dt = new Date(data.starts_at);
  renderError('Rescheduled!', `Your appointment is now ${dt.toLocaleString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}.`);
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'confirmBtn') doReschedule();
});

async function init() {
  if (!token) {
    renderError('Link incomplete', 'This reschedule link is missing information. Please use the link from your confirmation email or message.');
    return;
  }

  const { data: info, error: infoErr } = await supabase.rpc('get_booking_for_reschedule', { p_cancel_token: token });
  if (infoErr || !info || !info.success) {
    renderError('Could not reschedule', (info && info.error) || 'This booking could not be found. Please contact the business directly.');
    return;
  }
  bookingInfo = info;

  const { data: page, error: pageErr } = await supabase.rpc('get_public_booking_page', { p_slug: info.slug });
  if (pageErr || !page) {
    renderError('Could not reschedule', 'This business is not currently accepting bookings. Please contact them directly.');
    return;
  }
  pageData = page;
  pageData.slug = info.slug;

  eventType = (page.event_types || []).find(et => et.id === info.event_type_id);
  if (!eventType) {
    renderError('Could not reschedule', 'This service is no longer available. Please contact the business directly.');
    return;
  }

  renderPicker();
}

init();
