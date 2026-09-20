let ctx = null;
let page = null;
const pageId = new URLSearchParams(window.location.search).get('id');
const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function savePage(patch) {
  const { supabase } = ctx;
  Object.assign(page, patch);
  const { error } = await supabase.from('booking_pages').update(patch).eq('id', pageId);
  if (error) toast('Could not save: ' + error.message);
}

// ---------- Tabs ----------
document.querySelector('.fb-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  document.querySelectorAll('.fb-tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.fb-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  if (btn.dataset.tab === 'bookings') loadBookings();
});

document.getElementById('businessNameInput').addEventListener('input', debounce((e) => savePage({ business_name: e.target.value }), 600));
document.getElementById('pageDescInput').addEventListener('input', debounce((e) => savePage({ description: e.target.value || null }), 600));

// ---------- Services (event types) ----------
let eventTypes = [];
let staffList = [];

function renderEventTypes() {
  const list = document.getElementById('eventTypesList');
  if (!eventTypes.length) {
    list.innerHTML = `<div class="empty-note">No services yet — add your first one below.</div>`;
    return;
  }
  list.innerHTML = eventTypes.map(et => `
    <div class="card-row" data-id="${et.id}">
      <div class="card-row-top">
        <input class="name-input" data-role="name" value="${(et.name || '').replace(/"/g, '&quot;')}" placeholder="Service name">
        <div class="field-actions">
          <button class="icon-btn" data-role="delete" title="Delete">✕</button>
        </div>
      </div>
      <div class="et-grid">
        <div>
          <label>Duration (minutes)</label>
          <input type="number" data-role="duration" value="${et.duration_minutes}" min="5" step="5">
        </div>
        <div>
          <label>Price (display only, not charged)</label>
          <input type="text" data-role="price" value="${(et.price_display || '').replace(/"/g, '&quot;')}" placeholder="e.g. ₦5,000">
        </div>
        <div>
          <label>Buffer before (minutes)</label>
          <input type="number" data-role="buffer_before" value="${et.buffer_before_minutes}" min="0" step="5">
        </div>
        <div>
          <label>Buffer after (minutes)</label>
          <input type="number" data-role="buffer_after" value="${et.buffer_after_minutes}" min="0" step="5">
        </div>
        <div style="grid-column:1/-1;">
          <label>Staff member (optional — leave blank for default hours)</label>
          <select data-role="staff">
            <option value="">Default hours</option>
            ${staffList.map(s => `<option value="${s.id}" ${et.staff_id === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div style="grid-column:1/-1;">
          <label>Description (optional)</label>
          <textarea data-role="description" rows="2" placeholder="Shown to the customer when booking">${et.description || ''}</textarea>
        </div>
      </div>
    </div>
  `).join('');
}

async function loadEventTypes() {
  const { supabase } = ctx;
  const { data } = await supabase.from('booking_event_types').select('*').eq('booking_page_id', pageId).order('sort_order');
  eventTypes = data || [];
  renderEventTypes();
}

const saveEventTypeDebounced = debounce(async (id, patch) => {
  const { supabase } = ctx;
  const { error } = await supabase.from('booking_event_types').update(patch).eq('id', id);
  if (error) toast('Could not save: ' + error.message);
}, 600);

document.getElementById('eventTypesList').addEventListener('input', (e) => {
  const row = e.target.closest('.card-row');
  if (!row) return;
  const et = eventTypes.find(x => x.id === row.dataset.id);
  if (!et) return;
  const role = e.target.dataset.role;
  if (role === 'name') et.name = e.target.value;
  if (role === 'duration') et.duration_minutes = parseInt(e.target.value, 10) || 30;
  if (role === 'price') et.price_display = e.target.value;
  if (role === 'buffer_before') et.buffer_before_minutes = parseInt(e.target.value, 10) || 0;
  if (role === 'buffer_after') et.buffer_after_minutes = parseInt(e.target.value, 10) || 0;
  if (role === 'description') et.description = e.target.value;
  if (role === 'staff') et.staff_id = e.target.value || null;
  saveEventTypeDebounced(et.id, {
    name: et.name, duration_minutes: et.duration_minutes, price_display: et.price_display,
    buffer_before_minutes: et.buffer_before_minutes, buffer_after_minutes: et.buffer_after_minutes,
    description: et.description, staff_id: et.staff_id,
  });
});

document.getElementById('eventTypesList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-role="delete"]');
  if (!btn) return;
  const row = btn.closest('.card-row');
  const { supabase } = ctx;
  const { error } = await supabase.from('booking_event_types').delete().eq('id', row.dataset.id);
  if (error) { toast('Could not delete: ' + error.message); return; }
  eventTypes = eventTypes.filter(x => x.id !== row.dataset.id);
  renderEventTypes();
});

document.getElementById('addEventTypeBtn').addEventListener('click', async () => {
  const { supabase } = ctx;
  const { data, error } = await supabase.from('booking_event_types').insert({
    booking_page_id: pageId,
    name: 'New service',
    duration_minutes: 30,
    sort_order: eventTypes.length,
  }).select('*').single();

  if (error) {
    const msg = error.message.includes('event_type_limit_reached')
      ? "You've reached your plan's service limit. Upgrade to add more."
      : 'Could not add service: ' + error.message;
    toast(msg);
    return;
  }
  eventTypes.push(data);
  renderEventTypes();
});

// ---------- Availability (default hours + staff) ----------
function hoursGridHtml(idPrefix, hours) {
  hours = hours || {};
  return DAYS.map(([key, label]) => {
    const d = hours[key] || { enabled: false, start: '09:00', end: '17:00' };
    return `
      <div class="hours-row">
        <label class="settings-check" style="margin:0;"><input type="checkbox" data-role="day-enabled" data-day="${key}" ${d.enabled ? 'checked' : ''}> ${label}</label>
        <span></span>
        <input type="time" data-role="day-start" data-day="${key}" value="${d.start || '09:00'}" ${d.enabled ? '' : 'disabled'}>
        <input type="time" data-role="day-end" data-day="${key}" value="${d.end || '17:00'}" ${d.enabled ? '' : 'disabled'}>
      </div>
    `;
  }).join('');
}

function readHoursFromGrid(container) {
  const hours = {};
  DAYS.forEach(([key]) => {
    const enabled = container.querySelector(`input[data-role="day-enabled"][data-day="${key}"]`).checked;
    const start = container.querySelector(`input[data-role="day-start"][data-day="${key}"]`).value;
    const end = container.querySelector(`input[data-role="day-end"][data-day="${key}"]`).value;
    hours[key] = { enabled, start, end };
  });
  return hours;
}

function renderHoursGrid() {
  const grid = document.getElementById('hoursGrid');
  grid.innerHTML = hoursGridHtml('default', (page.settings || {}).workingHours);
  document.getElementById('blackoutDatesInput').value = ((page.settings || {}).blackoutDates || []).join('\n');
}

document.getElementById('hoursGrid').addEventListener('change', (e) => {
  if (e.target.dataset.role === 'day-enabled') {
    const day = e.target.dataset.day;
    const row = e.target.closest('.hours-row');
    row.querySelectorAll('input[type=time]').forEach(inp => { inp.disabled = !e.target.checked; });
  }
});

document.getElementById('saveHoursBtn').addEventListener('click', async () => {
  const workingHours = readHoursFromGrid(document.getElementById('hoursGrid'));
  const blackoutDates = document.getElementById('blackoutDatesInput').value.split('\n').map(s => s.trim()).filter(Boolean);
  const settings = { ...(page.settings || {}), workingHours, blackoutDates };
  await savePage({ settings });
  toast('Availability saved.');
});

async function loadStaff() {
  const { supabase, session } = ctx;
  const [{ data }, { data: limits }] = await Promise.all([
    supabase.from('booking_staff').select('*').eq('booking_page_id', pageId).order('sort_order'),
    supabase.rpc('get_booking_plan_limits', { p_user_id: session.user.id }),
  ]);
  staffList = data || [];
  const row = Array.isArray(limits) ? limits[0] : limits;
  const hint = document.getElementById('staffPlanHint');
  if (row) {
    hint.textContent = row.max_staff === null
      ? `${staffList.length} staff calendar(s) — unlimited on your plan.`
      : `${staffList.length} of ${row.max_staff} staff calendar(s) used on your plan.`;
  }
  renderStaff();
  renderEventTypes(); // refresh staff dropdown options
}

function renderStaff() {
  const list = document.getElementById('staffList');
  if (!staffList.length) {
    list.innerHTML = `<div class="empty-note">No additional staff yet — services without a staff member use the default hours above.</div>`;
    return;
  }
  list.innerHTML = staffList.map(s => `
    <div class="card-row" data-id="${s.id}">
      <div class="card-row-top">
        <input class="name-input" data-role="staff-name" value="${(s.name || '').replace(/"/g, '&quot;')}" placeholder="Staff name">
        <button class="icon-btn" data-role="staff-delete" title="Remove">✕</button>
      </div>
      <div data-role="staff-hours">${hoursGridHtml(s.id, s.working_hours)}</div>
      <button class="btn" data-role="staff-save" style="margin-top:10px;">Save hours</button>
    </div>
  `).join('');
}

document.getElementById('staffList').addEventListener('change', (e) => {
  if (e.target.dataset.role === 'day-enabled') {
    const row = e.target.closest('.hours-row');
    row.querySelectorAll('input[type=time]').forEach(inp => { inp.disabled = !e.target.checked; });
  }
});

document.getElementById('staffList').addEventListener('input', (e) => {
  if (e.target.dataset.role !== 'staff-name') return;
  const card = e.target.closest('.card-row');
  const s = staffList.find(x => x.id === card.dataset.id);
  if (s) s.name = e.target.value;
});

document.getElementById('staffList').addEventListener('click', async (e) => {
  const card = e.target.closest('.card-row');
  if (!card) return;
  const { supabase } = ctx;

  if (e.target.dataset.role === 'staff-delete') {
    const { error } = await supabase.from('booking_staff').delete().eq('id', card.dataset.id);
    if (error) { toast('Could not remove: ' + error.message); return; }
    staffList = staffList.filter(x => x.id !== card.dataset.id);
    renderStaff();
    renderEventTypes();
  }

  if (e.target.dataset.role === 'staff-save') {
    const s = staffList.find(x => x.id === card.dataset.id);
    const hoursContainer = card.querySelector('[data-role="staff-hours"]');
    const working_hours = readHoursFromGrid(hoursContainer);
    const { error } = await supabase.from('booking_staff').update({ name: s.name, working_hours }).eq('id', s.id);
    if (error) { toast('Could not save: ' + error.message); return; }
    toast('Staff hours saved.');
  }
});

document.getElementById('addStaffBtn').addEventListener('click', async () => {
  const { supabase } = ctx;
  const { data, error } = await supabase.from('booking_staff').insert({
    booking_page_id: pageId,
    name: 'New staff member',
    sort_order: staffList.length,
  }).select('*').single();

  if (error) {
    const msg = error.message.includes('staff_limit_reached')
      ? "You've reached your plan's staff limit. Upgrade to add more."
      : 'Could not add staff: ' + error.message;
    toast(msg);
    return;
  }
  staffList.push(data);
  renderStaff();
  renderEventTypes();
});

// ---------- Settings tab ----------
function renderSettings() {
  const s = page.settings || {};
  document.getElementById('oneTimeSlotStepInput').checked = s.slotStepMinutes === 15;
  document.getElementById('accessCodeInput').value = s.accessCode || '';
  document.getElementById('notifyOwnerInput').checked = s.notifyOwner !== false;
  document.getElementById('confirmationHeadingInput').value = s.confirmationHeading || '';
  document.getElementById('confirmationMessageInput').value = s.confirmationMessage || '';
  document.getElementById('brandColorInput').value = s.brandColor || '#0D2620';
  const logoPreview = document.getElementById('logoPreview');
  if (s.logoUrl) { logoPreview.src = s.logoUrl; logoPreview.style.display = 'inline-block'; }
  else { logoPreview.style.display = 'none'; }
}

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  const settings = {
    ...(page.settings || {}),
    slotStepMinutes: document.getElementById('oneTimeSlotStepInput').checked ? 15 : 30,
    accessCode: document.getElementById('accessCodeInput').value.trim() || null,
    notifyOwner: document.getElementById('notifyOwnerInput').checked,
    confirmationHeading: document.getElementById('confirmationHeadingInput').value.trim() || null,
    confirmationMessage: document.getElementById('confirmationMessageInput').value.trim() || null,
  };
  await savePage({ settings });
  toast('Settings saved.');
});

document.getElementById('logoUploadInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const { supabase, session } = ctx;
  const path = `${session.user.id}/${Math.random().toString(36).slice(2, 10)}-${file.name}`;
  const { error } = await supabase.storage.from('brand-logos').upload(path, file, { upsert: true });
  if (error) { toast('Could not upload logo: ' + error.message); return; }
  const { data } = supabase.storage.from('brand-logos').getPublicUrl(path);
  document.getElementById('logoPreview').src = data.publicUrl;
  document.getElementById('logoPreview').style.display = 'inline-block';
  document.getElementById('logoPreview').dataset.pendingUrl = data.publicUrl;
  toast('Logo uploaded — click "Save branding" to apply.');
});

document.getElementById('saveBrandingBtn').addEventListener('click', async () => {
  const logoPreview = document.getElementById('logoPreview');
  const settings = {
    ...(page.settings || {}),
    brandColor: document.getElementById('brandColorInput').value,
    logoUrl: logoPreview.dataset.pendingUrl || page.settings?.logoUrl || (logoPreview.style.display !== 'none' ? logoPreview.src : null),
  };
  await savePage({ settings });
  toast('Branding saved.');
});

// ---------- Share tab ----------
function renderShare() {
  document.querySelectorAll('#statusToggle button').forEach(b => b.classList.toggle('active', b.dataset.status === page.status));
  const url = `${window.location.origin}/booking/b/?s=${page.slug}`;
  document.getElementById('shareUrlInput').value = url;
  document.getElementById('waShareBtn').href = `https://wa.me/?text=${encodeURIComponent('Book with ' + page.business_name + ' — ' + url)}`;
  document.getElementById('embedCodeInput').value = `<iframe src="${url}" width="100%" height="640" frameborder="0" style="max-width:560px; border:1px solid #ddd; border-radius:8px;"></iframe>`;
}

document.getElementById('statusToggle').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-status]');
  if (!btn) return;
  await savePage({ status: btn.dataset.status });
  renderShare();
  toast('Page is now ' + btn.dataset.status + '.');
});

document.getElementById('publishNowBtn').addEventListener('click', async () => {
  await savePage({ status: 'published' });
  renderShare();
  toast('Booking page published — link is live.');
});

document.getElementById('copyShareBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('shareUrlInput').value);
  toast('Link copied.');
});

document.getElementById('toggleQrBtn').addEventListener('click', () => {
  const wrap = document.getElementById('qrWrap');
  const show = wrap.style.display === 'none';
  wrap.style.display = show ? 'block' : 'none';
  if (show && !wrap.dataset.rendered && window.QRCode) {
    new window.QRCode(document.getElementById('qrCanvas'), { text: document.getElementById('shareUrlInput').value, width: 200, height: 200 });
    wrap.dataset.rendered = '1';
  }
});

document.getElementById('downloadQrBtn').addEventListener('click', () => {
  const img = document.querySelector('#qrCanvas img') || document.querySelector('#qrCanvas canvas');
  if (!img) return;
  const a = document.createElement('a');
  a.download = `${page.slug}-qr.png`;
  a.href = img.tagName === 'CANVAS' ? img.toDataURL('image/png') : img.src;
  a.click();
});

document.getElementById('toggleEmbedBtn').addEventListener('click', () => {
  const wrap = document.getElementById('embedWrap');
  wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('copyEmbedBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('embedCodeInput').value);
  toast('Embed code copied.');
});

// ---------- Bookings tab ----------
let lastBookings = [];

function matchesSearch(b, query) {
  if (!query) return true;
  const haystack = [b.customer_name, b.customer_phone, b.customer_email].join(' ').toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function renderBookingsTable() {
  const wrap = document.getElementById('bookingsTableWrap');
  const query = document.getElementById('bookingSearchInput').value.trim();
  const filtered = lastBookings.filter(b => matchesSearch(b, query));

  document.getElementById('bookingCount').textContent = query
    ? `${filtered.length} of ${lastBookings.length} booking(s)`
    : `${lastBookings.length} booking(s)`;

  if (!lastBookings.length) { wrap.innerHTML = `<div class="empty-note">No bookings yet.</div>`; return; }
  if (!filtered.length) { wrap.innerHTML = `<div class="empty-note">No bookings match "${query}".</div>`; return; }

  wrap.innerHTML = `
    <table class="resp-table">
      <thead><tr><th>When</th><th>Service</th><th>Customer</th><th>Phone</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${filtered.map(b => `
          <tr data-id="${b.id}">
            <td>${new Date(b.starts_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
            <td>${(eventTypes.find(et => et.id === b.event_type_id) || {}).name || '—'}</td>
            <td>${b.customer_name}</td>
            <td>${b.customer_phone || ''}</td>
            <td>${b.status}</td>
            <td>${b.status === 'confirmed' ? `<button class="btn" data-role="cancel-booking">Cancel</button>` : ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

document.getElementById('bookingSearchInput').addEventListener('input', renderBookingsTable);

document.getElementById('bookingsTableWrap').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-role="cancel-booking"]');
  if (!btn) return;
  const row = btn.closest('tr[data-id]');
  const { supabase } = ctx;
  const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', row.dataset.id);
  if (error) { toast('Could not cancel: ' + error.message); return; }
  toast('Booking cancelled.');
  loadBookings();
});

async function loadBookings() {
  const { supabase } = ctx;
  const wrap = document.getElementById('bookingsTableWrap');
  wrap.innerHTML = `<div class="empty-note">Loading…</div>`;
  const { data, error } = await supabase.from('bookings').select('*').eq('booking_page_id', pageId).order('starts_at', { ascending: false });
  if (error) { wrap.innerHTML = `<div class="empty-note">Could not load bookings: ${error.message}</div>`; return; }
  lastBookings = data || [];
  renderBookingsTable();
}

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (!lastBookings.length) { toast('No bookings to export yet.'); return; }
  const header = ['When', 'Service', 'Customer', 'Phone', 'Email', 'Status'];
  const rows = lastBookings.map(b => [
    new Date(b.starts_at).toISOString(),
    (eventTypes.find(et => et.id === b.event_type_id) || {}).name || '',
    b.customer_name, b.customer_phone || '', b.customer_email || '', b.status,
  ]);
  const esc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = [header, ...rows].map(row => row.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${page.slug}-bookings.csv`;
  a.click();
});

// ---------- Init ----------
(async () => {
  ctx = await window.BookingGuard.requireAccess();
  if (!ctx) return;
  if (!pageId) { window.location.href = '/booking/app/'; return; }

  const { supabase } = ctx;
  const { data, error } = await supabase.from('booking_pages').select('*').eq('id', pageId).single();
  if (error || !data) {
    toast('Booking page not found.');
    setTimeout(() => window.location.href = '/booking/app/', 1200);
    return;
  }
  page = data;
  document.getElementById('businessNameInput').value = page.business_name || '';
  document.getElementById('pageDescInput').value = page.description || '';
  renderHoursGrid();
  renderSettings();
  renderShare();
  await loadStaff();
  await loadEventTypes();
})();
