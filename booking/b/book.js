import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://vwmzulzluaxedkozxjfy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4HDVb8ZzRh1W-Z97m2uT1Q_4FwH6bTt';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const slug = new URLSearchParams(window.location.search).get('s');
const card = document.getElementById('fillCard');
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

let pageData = null;
let selectedEventType = null;
let selectedDateStr = null;
let selectedSlotIso = null;

function renderError(message) {
  card.innerHTML = `<div class="fill-logo">KoboDocs Booking</div><div class="fill-error" style="display:block;">${message}</div>`;
}

function applyBranding(settings) {
  if (settings.brandColor) document.documentElement.style.setProperty('--ink-green-deep', settings.brandColor);
}

function brandHeaderHtml(settings) {
  if (settings.logoUrl) return `<img src="${settings.logoUrl}" alt="" style="max-height:52px; margin-bottom:14px; display:block;">`;
  return `<div class="fill-logo">KoboDocs Booking</div>`;
}

function honeypotHtml() {
  return `<input type="text" name="website" id="hpField" tabindex="-1" autocomplete="off" style="position:absolute; left:-9999px; width:1px; height:1px; opacity:0;">`;
}

// ---------- Step 1: service list ----------
function renderServices() {
  const s = pageData.settings || {};
  card.innerHTML = `
    ${brandHeaderHtml(s)}
    <div class="fill-title">${pageData.business_name}</div>
    ${pageData.description ? `<div class="fill-desc">${pageData.description}</div>` : ''}
    <div class="service-list" id="serviceList">
      ${pageData.event_types.map(et => `
        <button type="button" class="service-card" data-id="${et.id}">
          <div class="name">${et.name}</div>
          <div class="meta">${et.duration_minutes} min${et.price_display ? ' · ' + et.price_display : ''}</div>
          ${et.description ? `<div class="desc">${et.description}</div>` : ''}
        </button>
      `).join('')}
    </div>
    ${s.logoUrl ? `<div style="text-align:center; font-size:0.72rem; opacity:0.4; margin-top:18px;">Powered by KoboDocs</div>` : ''}
  `;
  document.getElementById('serviceList').addEventListener('click', (e) => {
    const btn = e.target.closest('.service-card');
    if (!btn) return;
    selectedEventType = pageData.event_types.find(et => et.id === btn.dataset.id);
    renderDatePicker();
  });
}

// ---------- Step 2: date + time ----------
function getWorkingHoursFor(eventType) {
  if (eventType.staff_id) {
    const staff = pageData.staff.find(s => s.id === eventType.staff_id);
    return { hours: (staff && staff.working_hours) || {}, blackout: (staff && staff.blackout_dates) || [] };
  }
  return { hours: (pageData.settings || {}).workingHours || {}, blackout: (pageData.settings || {}).blackoutDates || [] };
}

function nextNDays(n) {
  const days = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    days.push(d);
  }
  return days;
}

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function renderDatePicker() {
  const days = nextNDays(14);
  card.innerHTML = `
    ${brandHeaderHtml(pageData.settings || {})}
    <div class="back-link" id="backToServices">&larr; Choose a different service</div>
    <div class="fill-title" style="font-size:1.2rem;">${selectedEventType.name}</div>
    <div class="fill-desc">${selectedEventType.duration_minutes} minutes${selectedEventType.price_display ? ' · ' + selectedEventType.price_display : ''}</div>
    <div class="day-picker" id="dayPicker">
      ${days.map(d => `
        <button type="button" class="day-btn" data-date="${dateStr(d)}">
          <span class="dow">${d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
          ${d.getDate()}
        </button>
      `).join('')}
    </div>
    <div id="slotsWrap"><div class="empty-note">Pick a day to see available times.</div></div>
  `;
  document.getElementById('backToServices').addEventListener('click', renderServices);
  document.getElementById('dayPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('.day-btn');
    if (!btn) return;
    document.querySelectorAll('.day-btn').forEach(b => b.classList.toggle('active', b === btn));
    selectedDateStr = btn.dataset.date;
    loadSlotsForDate(selectedDateStr);
  });
}

async function loadSlotsForDate(dateStr) {
  const wrap = document.getElementById('slotsWrap');
  wrap.innerHTML = `<div class="empty-note">Loading times…</div>`;

  const { hours, blackout } = getWorkingHoursFor(selectedEventType);
  if (blackout.includes(dateStr)) {
    wrap.innerHTML = `<div class="empty-note">Not available on this day. Please pick another.</div>`;
    return;
  }

  const [y, m, d] = dateStr.split('-').map(Number);
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
    p_slug: slug,
    p_staff_id: selectedEventType.staff_id || null,
    p_from: dayStart.toISOString(),
    p_to: dayEnd.toISOString(),
  });

  const [wsH, wsM] = window.start.split(':').map(Number);
  const [weH, weM] = window.end.split(':').map(Number);
  const winStart = new Date(y, m - 1, d, wsH, wsM);
  const winEnd = new Date(y, m - 1, d, weH, weM);

  const step = ((pageData.settings || {}).slotStepMinutes) || 30;
  const durationMs = selectedEventType.duration_minutes * 60000;
  const bufBeforeMs = (selectedEventType.buffer_before_minutes || 0) * 60000;
  const bufAfterMs = (selectedEventType.buffer_after_minutes || 0) * 60000;
  const now = new Date();
  const slots = [];

  for (let t = winStart.getTime(); t + durationMs <= winEnd.getTime(); t += step * 60000) {
    const slotStart = new Date(t);
    if (slotStart <= now) continue;

    const rangeStart = t - bufBeforeMs;
    const rangeEnd = t + durationMs + bufAfterMs;
    const conflict = (existing || []).some(b => {
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
    selectedSlotIso = btn.dataset.iso;
    renderDetailsForm();
  });
}

// ---------- Step 3: customer details ----------
function questionFieldHtml(q) {
  const common = `id="q_${q.id}" ${q.required ? 'required' : ''}`;
  switch (q.type) {
    case 'textarea': return `<textarea ${common} rows="2"></textarea>`;
    case 'select': return `<select ${common}><option value="">Choose…</option>${(q.options || []).map(o => `<option value="${o}">${o}</option>`).join('')}</select>`;
    default: return `<input type="text" ${common}>`;
  }
}

function renderDetailsForm() {
  const dt = new Date(selectedSlotIso);
  card.innerHTML = `
    ${brandHeaderHtml(pageData.settings || {})}
    <div class="back-link" id="backToSlots">&larr; Choose a different time</div>
    <div class="fill-title" style="font-size:1.2rem;">${selectedEventType.name}</div>
    <div class="fill-desc">${dt.toLocaleString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}</div>
    <form id="detailsForm">
      <div class="fill-field">
        <label for="customerName">Your name <span class="req">*</span></label>
        <input type="text" id="customerName" required>
      </div>
      <div class="fill-field">
        <label for="customerPhone">Phone number <span class="req">*</span></label>
        <input type="tel" id="customerPhone" required>
      </div>
      <div class="fill-field">
        <label for="customerEmail">Email (optional, for a confirmation)</label>
        <input type="email" id="customerEmail">
      </div>
      ${(selectedEventType.questions || []).map(q => `
        <div class="fill-field">
          <label for="q_${q.id}">${q.label}${q.required ? ' <span class="req">*</span>' : ''}</label>
          ${questionFieldHtml(q)}
        </div>
      `).join('')}
      ${honeypotHtml()}
      <button type="submit" class="fill-submit" id="submitBtn">Confirm booking</button>
      <div class="fill-error" id="fillErrorMsg"></div>
    </form>
  `;
  document.getElementById('backToSlots').addEventListener('click', () => loadSlotsForDate(selectedDateStr));
  document.getElementById('detailsForm').addEventListener('submit', onSubmit);
}

async function onSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const errEl = document.getElementById('fillErrorMsg');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Booking…';

  try {
    const answers = {};
    for (const q of (selectedEventType.questions || [])) {
      const input = document.getElementById(`q_${q.id}`);
      answers[q.id] = input.value.trim();
      if (q.required && !answers[q.id]) throw new Error(`Please fill in "${q.label}".`);
    }

    const customerEmail = document.getElementById('customerEmail').value.trim();
    const honeypot = document.getElementById('hpField').value;

    const { data, error } = await supabase.rpc('create_booking', {
      p_slug: slug,
      p_event_type_id: selectedEventType.id,
      p_customer_name: document.getElementById('customerName').value.trim(),
      p_customer_phone: document.getElementById('customerPhone').value.trim(),
      p_customer_email: customerEmail || null,
      p_answers: answers,
      p_starts_at: selectedSlotIso,
      p_honeypot: honeypot,
    });
    if (error) throw error;
    if (!data || !data.success) throw new Error((data && data.error) || 'Could not complete the booking.');

    try {
      const cancelUrl = `${window.location.origin}/booking/cancel/?t=${data.cancel_token}`;
      supabase.functions.invoke('send-form-notification', {
        body: {
          product: 'booking',
          slug,
          respondent_email: customerEmail || null,
          booking_details: {
            service_name: selectedEventType.name,
            starts_at: data.starts_at,
            ends_at: data.ends_at,
            cancel_url: cancelUrl,
          },
        },
      });
    } catch { /* non-critical */ }

    renderSuccess(data);
  } catch (err) {
    errEl.textContent = err.message || 'Something went wrong. Please try again.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Confirm booking';
  }
}

function renderSuccess(data) {
  const s = pageData.settings || {};
  const dt = new Date(data.starts_at);
  card.innerHTML = `
    ${brandHeaderHtml(s)}
    <div class="fill-success">
      <h2>${s.confirmationHeading || "You're booked! 🎉"}</h2>
      <p style="opacity:0.85; font-size:0.95rem; margin-bottom:10px;"><strong>${selectedEventType.name}</strong><br>${dt.toLocaleString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
      <p style="opacity:0.75; font-size:0.9rem;">${s.confirmationMessage || "We'll see you then."}</p>
      <p style="opacity:0.55; font-size:0.78rem; margin-top:16px;"><a href="/booking/cancel/?t=${data.cancel_token}">Need to cancel?</a></p>
    </div>
  `;
}

// ---------- Access-code gate ----------
function renderAccessGate(data) {
  applyBranding(data.settings || {});
  card.innerHTML = `
    ${brandHeaderHtml(data.settings || {})}
    <div class="fill-title">${data.business_name}</div>
    <div class="fill-desc">This booking page is private. Enter the access code to continue.</div>
    <div class="fill-field">
      <label for="accessCodeField">Access code</label>
      <input type="text" id="accessCodeField">
    </div>
    <button type="button" class="fill-submit" id="unlockBtn">Continue</button>
    <div class="fill-error" id="gateErrorMsg"></div>
  `;
  document.getElementById('unlockBtn').addEventListener('click', unlockAndRender);
  document.getElementById('accessCodeField').addEventListener('keydown', (e) => { if (e.key === 'Enter') unlockAndRender(); });
}

async function unlockAndRender() {
  const btn = document.getElementById('unlockBtn');
  const errEl = document.getElementById('gateErrorMsg');
  const code = document.getElementById('accessCodeField').value.trim();
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Checking…';

  const { data, error } = await supabase.rpc('unlock_booking_page', { p_slug: slug, p_code: code });
  btn.disabled = false;
  btn.textContent = 'Continue';

  if (error || !data || !data.success) {
    errEl.textContent = (data && data.error) || 'Could not verify that code — please try again.';
    errEl.style.display = 'block';
    return;
  }
  pageData = data;
  applyBranding(pageData.settings || {});
  renderServices();
}

(async () => {
  if (!slug) {
    renderError("This booking link looks incomplete. Please check the link and try again.");
    return;
  }
  try {
    const { data, error } = await supabase.rpc('get_public_booking_page', { p_slug: slug });
    if (error || !data) {
      renderError("We couldn't find this booking page. It may have been unpublished or the link may be incorrect.");
      return;
    }

    if (data.requires_access_code) {
      renderAccessGate(data);
      return;
    }

    if (!data.event_types || !data.event_types.length) {
      renderError("This business hasn't added any services to book yet.");
      return;
    }

    pageData = data;
    applyBranding(pageData.settings || {});
    renderServices();
  } catch {
    renderError("Something went wrong loading this booking page. Please try again in a moment.");
  }
})();
