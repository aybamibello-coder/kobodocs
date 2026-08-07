let ctx = null;
let event = null;
let currentTab = 'overview';
let hasPass = false;

const EVENT_ID = new URLSearchParams(window.location.search).get('id');
const TYPE_LABELS = { wedding: 'Wedding', naming: 'Naming Ceremony', funeral: 'Funeral / Memorial', custom: 'Custom Event' };
const EVENT_PRICES = { wedding: 7500, naming: 2000, funeral: 3500, custom: 3500 };
const BUDGET_PRESETS = {
  wedding: ['Venue', 'Catering', 'Aso-ebi & attire', 'Photography/Videography', 'Music & entertainment', 'Décor'],
  naming: ['Venue/home setup', 'Catering', 'Naming items', 'Photography', 'Aso-ebi & attire'],
  funeral: ['Venue/hall', 'Catering', 'Order of service printing', 'Transport/logistics', 'Burial/interment costs'],
  custom: ['Venue', 'Catering', 'Decor', 'Other'],
};

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}
function naira(n) { return '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG'); }
function fmtDate(iso) {
  if (!iso) return 'No date set';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function loadEvent() {
  const { supabase, session } = ctx;
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', EVENT_ID)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error || !data) {
    document.getElementById('eventTitle').textContent = 'Event not found';
    document.getElementById('tabContent').innerHTML = '<div class="empty-note">This event doesn\'t exist, or isn\'t yours. <a href="/events/app/">Back to your events</a></div>';
    document.getElementById('evTabs').style.display = 'none';
    return false;
  }
  event = data;
  hasPass = event.pass_status === 'active';

  document.getElementById('eventTitle').textContent = event.event_name;
  document.getElementById('eventMeta').textContent = `${TYPE_LABELS[event.event_type] || event.event_type} · ${fmtDate(event.event_date)}${event.guest_count ? ` · ~${event.guest_count} guests` : ''}`;
  const badge = document.getElementById('passBadge');
  badge.textContent = hasPass ? 'Event Pass active' : 'Free tier';
  badge.className = 'ev-badge ' + (hasPass ? 'active' : 'none');

  if (event.event_type !== 'wedding') {
    document.getElementById('vendorsTabBtn').style.display = 'none';
  }
  return true;
}

function lockedPanel(featureLabel) {
  const price = naira(EVENT_PRICES[event.event_type] || 3500);
  return `
    <div class="ev-panel lock-panel">
      <span style="font-family:'Space Mono', monospace; font-size:0.7rem; text-transform:uppercase; color:var(--stamp-gold);">Event Pass</span>
      <div class="price">${price} <small style="font-size:0.85rem; opacity:0.6;">one-time</small></div>
      <p style="font-size:0.88rem; opacity:0.75; margin-bottom:16px;">Unlocks ${featureLabel} — plus everything else in the ${TYPE_LABELS[event.event_type]} Event Pass, for this event, forever.</p>
      <button class="btn primary" id="unlockBtn">Unlock Event Pass</button>
    </div>
  `;
}

function wireUnlockButton() {
  const btn = document.getElementById('unlockBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const original = btn.textContent;
    btn.textContent = 'Redirecting…';
    btn.disabled = true;
    try {
      await KoboSubscribe.start('init-event-pass-payment', { event_id: EVENT_ID });
    } catch {
      btn.textContent = original;
      btn.disabled = false;
    }
  });
}

// ---------- Tab: Overview & Budget (free) ----------
async function renderOverview() {
  const { supabase } = ctx;
  const { data: items } = await supabase.from('event_budget_items').select('*').eq('event_id', EVENT_ID).order('sort_order');
  const total = (items || []).reduce((s, i) => s + Number(i.planned_amount || 0), 0);
  const presets = BUDGET_PRESETS[event.event_type] || BUDGET_PRESETS.custom;

  document.getElementById('tabContent').innerHTML = `
    <div class="ev-panel">
      <div class="summary-strip">
        <div><strong>${naira(total)}</strong>Total planned budget</div>
        <div><strong>${(items || []).length}</strong>Line items</div>
      </div>
      <div id="budgetList">
        ${(items || []).length ? items.map(i => `
          <div class="ev-row" data-id="${i.id}">
            <div><div class="ev-name">${esc(i.category)}</div></div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span>${naira(i.planned_amount)}</span>
              <button class="btn small danger del-budget" data-id="${i.id}">Remove</button>
            </div>
          </div>
        `).join('') : '<div class="empty-note">No budget items yet — add one below.</div>'}
      </div>
      <div class="ev-form-row" style="margin-top:16px;">
        <select id="budgetCategory">
          ${presets.map(p => `<option>${p}</option>`).join('')}
          <option value="__custom">Other (type below)</option>
        </select>
        <input type="text" id="budgetAmount" placeholder="Amount, e.g. 500,000">
      </div>
      <input type="text" id="budgetCustomLabel" placeholder="Custom category name" style="display:none; margin-bottom:10px;">
      <button class="btn primary" id="addBudgetBtn">Add budget item</button>
    </div>
  `;

  document.getElementById('budgetCategory').addEventListener('change', (e) => {
    document.getElementById('budgetCustomLabel').style.display = e.target.value === '__custom' ? 'block' : 'none';
  });

  document.getElementById('addBudgetBtn').addEventListener('click', async () => {
    const catSelect = document.getElementById('budgetCategory').value;
    const category = catSelect === '__custom' ? document.getElementById('budgetCustomLabel').value.trim() : catSelect;
    const amount = parseFloat(document.getElementById('budgetAmount').value.replace(/,/g, '')) || 0;
    if (!category) { toast('Enter a category name.'); return; }
    const { error } = await supabase.from('event_budget_items').insert({ event_id: EVENT_ID, category, planned_amount: amount, sort_order: (items || []).length });
    if (error) { toast('Could not add: ' + error.message); return; }
    renderOverview();
  });

  document.querySelectorAll('.del-budget').forEach(b => b.addEventListener('click', async () => {
    await supabase.from('event_budget_items').delete().eq('id', b.dataset.id);
    renderOverview();
  }));
}

// ---------- Tab: Guests & RSVP (paid) ----------
async function renderGuests() {
  if (!hasPass) { document.getElementById('tabContent').innerHTML = lockedPanel('guest list with live RSVP tracking'); wireUnlockButton(); return; }
  const { supabase } = ctx;
  const { data: guests } = await supabase.from('event_guests').select('*').eq('event_id', EVENT_ID).order('created_at', { ascending: false });

  const attending = (guests || []).filter(g => g.rsvp_status === 'attending');
  const notAttending = (guests || []).filter(g => g.rsvp_status === 'not_attending');
  const pending = (guests || []).filter(g => g.rsvp_status === 'pending');
  const totalHeadcount = attending.reduce((s, g) => s + 1 + (g.plus_ones || 0), 0);

  document.getElementById('tabContent').innerHTML = `
    <div class="ev-panel">
      <div class="summary-strip">
        <div><strong>${(guests || []).length}</strong>Total guests</div>
        <div><strong>${attending.length}</strong>Attending</div>
        <div><strong>${notAttending.length}</strong>Not attending</div>
        <div><strong>${pending.length}</strong>Pending</div>
        <div><strong>${totalHeadcount}</strong>Expected headcount (incl. plus-ones)</div>
      </div>
      <div id="guestList">
        ${(guests || []).length ? guests.map(g => `
          <div class="ev-row">
            <div>
              <div class="ev-name">${esc(g.name)}${g.plus_ones ? ` <span class="ev-meta">+${g.plus_ones}</span>` : ''}</div>
              <div class="ev-meta">${g.phone ? esc(g.phone) + ' · ' : ''}${g.category ? esc(g.category) : (g.is_self_rsvp ? 'Self-RSVP' : 'Added by you')}${g.aso_ebi_required ? ' · Aso-ebi' : ''}</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="status-pill ${g.rsvp_status}">${g.rsvp_status.replace('_', ' ')}</span>
              <button class="btn small danger del-guest" data-id="${g.id}">Remove</button>
            </div>
          </div>
        `).join('') : '<div class="empty-note">No guests yet — add one manually, or share your invitation link from the Invitation tab so guests can RSVP themselves.</div>'}
      </div>
      <div class="ev-form-row" style="margin-top:16px;">
        <input type="text" id="guestName" placeholder="Guest name">
        <input type="text" id="guestPhone" placeholder="Phone (optional)">
      </div>
      <div class="ev-form-row">
        <select id="guestRsvpStatus">
          <option value="pending">Pending</option>
          <option value="attending">Attending</option>
          <option value="not_attending">Not attending</option>
        </select>
        <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem;"><input type="checkbox" id="guestAsoEbi" style="width:auto;"> Requires aso-ebi</label>
      </div>
      <button class="btn primary" id="addGuestBtn">Add guest</button>
    </div>
  `;

  document.getElementById('addGuestBtn').addEventListener('click', async () => {
    const name = document.getElementById('guestName').value.trim();
    if (!name) { toast('Enter a guest name.'); return; }
    const { error } = await supabase.from('event_guests').insert({
      event_id: EVENT_ID,
      name,
      phone: document.getElementById('guestPhone').value.trim() || null,
      rsvp_status: document.getElementById('guestRsvpStatus').value,
      aso_ebi_required: document.getElementById('guestAsoEbi').checked,
      category: 'Added by host',
    });
    if (error) { toast('Could not add: ' + error.message); return; }
    renderGuests();
  });

  document.querySelectorAll('.del-guest').forEach(b => b.addEventListener('click', async () => {
    await supabase.from('event_guests').delete().eq('id', b.dataset.id);
    renderGuests();
  }));
}

// ---------- Tab: Vendors (paid, wedding only) ----------
async function renderVendors() {
  if (!hasPass) { document.getElementById('tabContent').innerHTML = lockedPanel('the vendor & payment tracker'); wireUnlockButton(); return; }
  const { supabase } = ctx;
  const { data: vendors } = await supabase.from('event_vendors').select('*').eq('event_id', EVENT_ID).order('created_at', { ascending: false });

  const totalContract = (vendors || []).reduce((s, v) => s + Number(v.contract_amount || 0), 0);
  const totalPaid = (vendors || []).reduce((s, v) => s + Number(v.deposit_paid || 0), 0);

  document.getElementById('tabContent').innerHTML = `
    <div class="ev-panel">
      <div class="summary-strip">
        <div><strong>${naira(totalContract)}</strong>Total contracted</div>
        <div><strong>${naira(totalPaid)}</strong>Paid so far</div>
        <div><strong>${naira(totalContract - totalPaid)}</strong>Balance owed</div>
      </div>
      <div id="vendorList">
        ${(vendors || []).length ? vendors.map(v => `
          <div class="ev-row">
            <div>
              <div class="ev-name">${esc(v.vendor_name)}</div>
              <div class="ev-meta">${v.category ? esc(v.category) + ' · ' : ''}${naira(v.deposit_paid)} paid of ${naira(v.contract_amount)}${v.payment_due_date ? ` · next due ${fmtDate(v.payment_due_date)}` : ''}</div>
            </div>
            <button class="btn small danger del-vendor" data-id="${v.id}">Remove</button>
          </div>
        `).join('') : '<div class="empty-note">No vendors yet — add your caterer, photographer, decorator, etc.</div>'}
      </div>
      <div class="ev-form-row" style="margin-top:16px;">
        <input type="text" id="vendorName" placeholder="Vendor name">
        <input type="text" id="vendorCategory" placeholder="Category, e.g. Catering">
      </div>
      <div class="ev-form-row">
        <input type="text" id="vendorContract" placeholder="Contract amount">
        <input type="text" id="vendorDeposit" placeholder="Deposit/amount paid so far">
      </div>
      <div class="ev-form-row">
        <input type="date" id="vendorDueDate">
        <input type="text" id="vendorNotes" placeholder="Notes (optional)">
      </div>
      <button class="btn primary" id="addVendorBtn">Add vendor</button>
    </div>
  `;

  document.getElementById('addVendorBtn').addEventListener('click', async () => {
    const name = document.getElementById('vendorName').value.trim();
    if (!name) { toast('Enter a vendor name.'); return; }
    const { error } = await supabase.from('event_vendors').insert({
      event_id: EVENT_ID,
      vendor_name: name,
      category: document.getElementById('vendorCategory').value.trim() || null,
      contract_amount: parseFloat(document.getElementById('vendorContract').value.replace(/,/g, '')) || 0,
      deposit_paid: parseFloat(document.getElementById('vendorDeposit').value.replace(/,/g, '')) || 0,
      payment_due_date: document.getElementById('vendorDueDate').value || null,
      notes: document.getElementById('vendorNotes').value.trim() || null,
    });
    if (error) { toast('Could not add: ' + error.message); return; }
    renderVendors();
  });

  document.querySelectorAll('.del-vendor').forEach(b => b.addEventListener('click', async () => {
    await supabase.from('event_vendors').delete().eq('id', b.dataset.id);
    renderVendors();
  }));
}

// ---------- Tab: Contributions (paid) ----------
async function renderContributions() {
  if (!hasPass) { document.getElementById('tabContent').innerHTML = lockedPanel('the contribution tracker'); wireUnlockButton(); return; }
  const { supabase } = ctx;
  const { data: contributions } = await supabase.from('event_contributions').select('*').eq('event_id', EVENT_ID).order('created_at', { ascending: false });

  const totalPledged = (contributions || []).reduce((s, c) => s + Number(c.amount || 0), 0);
  const totalPaid = (contributions || []).filter(c => c.paid).reduce((s, c) => s + Number(c.amount || 0), 0);
  const label = event.event_type === 'funeral' ? 'Family contribution' : 'Contribution';

  document.getElementById('tabContent').innerHTML = `
    <div class="ev-panel">
      <div class="summary-strip">
        <div><strong>${naira(totalPledged)}</strong>Total pledged</div>
        <div><strong>${naira(totalPaid)}</strong>Received</div>
      </div>
      <div id="contribList">
        ${(contributions || []).length ? contributions.map(c => `
          <div class="ev-row">
            <div><div class="ev-name">${esc(c.contributor_name)}</div><div class="ev-meta">${naira(c.amount)}</div></div>
            <div style="display:flex; align-items:center; gap:10px;">
              <label style="display:flex; align-items:center; gap:5px; font-size:0.82rem;"><input type="checkbox" class="toggle-paid" data-id="${c.id}" ${c.paid ? 'checked' : ''} style="width:auto;"> Paid</label>
              <button class="btn small danger del-contrib" data-id="${c.id}">Remove</button>
            </div>
          </div>
        `).join('') : `<div class="empty-note">No ${label.toLowerCase()}s recorded yet.</div>`}
      </div>
      <div class="ev-form-row" style="margin-top:16px;">
        <input type="text" id="contribName" placeholder="${label} from">
        <input type="text" id="contribAmount" placeholder="Amount">
      </div>
      <button class="btn primary" id="addContribBtn">Add ${label.toLowerCase()}</button>
    </div>
  `;

  document.getElementById('addContribBtn').addEventListener('click', async () => {
    const name = document.getElementById('contribName').value.trim();
    if (!name) { toast('Enter a name.'); return; }
    const { error } = await supabase.from('event_contributions').insert({
      event_id: EVENT_ID,
      contributor_name: name,
      amount: parseFloat(document.getElementById('contribAmount').value.replace(/,/g, '')) || 0,
    });
    if (error) { toast('Could not add: ' + error.message); return; }
    renderContributions();
  });

  document.querySelectorAll('.toggle-paid').forEach(cb => cb.addEventListener('change', async () => {
    await supabase.from('event_contributions').update({ paid: cb.checked }).eq('id', cb.dataset.id);
    renderContributions();
  }));
  document.querySelectorAll('.del-contrib').forEach(b => b.addEventListener('click', async () => {
    await supabase.from('event_contributions').delete().eq('id', b.dataset.id);
    renderContributions();
  }));
}

// ---------- Tab: Timeline (paid) ----------
async function renderTimeline() {
  if (!hasPass) { document.getElementById('tabContent').innerHTML = lockedPanel('the event-day timeline'); wireUnlockButton(); return; }
  const { supabase } = ctx;
  const { data: items } = await supabase.from('event_timeline_items').select('*').eq('event_id', EVENT_ID).order('sort_order');

  document.getElementById('tabContent').innerHTML = `
    <div class="ev-panel">
      <div id="timelineList">
        ${(items || []).length ? items.map(t => `
          <div class="ev-row">
            <div><div class="ev-name">${t.time_label ? esc(t.time_label) + ' — ' : ''}${esc(t.activity)}</div></div>
            <button class="btn small danger del-timeline" data-id="${t.id}">Remove</button>
          </div>
        `).join('') : '<div class="empty-note">No timeline items yet — build out the run of the day below.</div>'}
      </div>
      <div class="ev-form-row" style="margin-top:16px;">
        <input type="text" id="timelineTime" placeholder="Time, e.g. 2:00 PM">
        <input type="text" id="timelineActivity" placeholder="Activity, e.g. Guests arrive">
      </div>
      <button class="btn primary" id="addTimelineBtn">Add to timeline</button>
    </div>
  `;

  document.getElementById('addTimelineBtn').addEventListener('click', async () => {
    const activity = document.getElementById('timelineActivity').value.trim();
    if (!activity) { toast('Enter an activity.'); return; }
    const { error } = await supabase.from('event_timeline_items').insert({
      event_id: EVENT_ID,
      time_label: document.getElementById('timelineTime').value.trim() || null,
      activity,
      sort_order: (items || []).length,
    });
    if (error) { toast('Could not add: ' + error.message); return; }
    renderTimeline();
  });

  document.querySelectorAll('.del-timeline').forEach(b => b.addEventListener('click', async () => {
    await supabase.from('event_timeline_items').delete().eq('id', b.dataset.id);
    renderTimeline();
  }));
}

// ---------- Tab: Invitation & Documents (paid) ----------
function renderInvitation() {
  if (!hasPass) { document.getElementById('tabContent').innerHTML = lockedPanel('the invitation card, QR RSVP link, and printable documents'); wireUnlockButton(); return; }

  const rsvpLink = `${window.location.origin}/events/rsvp/?t=${event.rsvp_token}`;
  const isNaming = event.event_type === 'naming';
  const isFuneral = event.event_type === 'funeral';

  document.getElementById('tabContent').innerHTML = `
    <div class="ev-panel">
      <label for="inviteVenue">Venue</label>
      <input type="text" id="inviteVenue" value="${esc(event.invite_venue || '')}" placeholder="e.g. The Grand Hall, Victoria Island, Lagos" style="margin-bottom:12px;">
      <label for="inviteMessage">Invitation message</label>
      <textarea id="inviteMessage" rows="3" placeholder="e.g. Please join us as we celebrate...">${esc(event.invite_message || '')}</textarea>
      <button class="btn primary" id="saveInviteBtn" style="margin-top:10px;">Save</button>
    </div>

    <div class="ev-panel">
      <h3 style="font-size:1rem; margin-bottom:10px;">Shareable RSVP link &amp; QR code</h3>
      <p class="ev-meta" style="margin-bottom:10px;">Guests scan this or open the link — no account needed on their end. Their RSVP shows up live on the Guests &amp; RSVP tab.</p>
      <input type="text" readonly value="${rsvpLink}" id="rsvpLinkInput" style="margin-bottom:10px; font-size:0.82rem;">
      <div id="qrHolder"></div>
      <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
        <button class="btn" id="copyLinkBtn">Copy link</button>
        <button class="btn primary" id="downloadInviteBtn">Download invitation card (PDF)</button>
      </div>
    </div>

    ${isNaming ? `
    <div class="ev-panel">
      <h3 style="font-size:1rem; margin-bottom:10px;">Naming certificate</h3>
      <div class="ev-form-row">
        <select id="namingTradition">
          <option value="Yoruba">Yoruba</option>
          <option value="Igbo">Igbo</option>
          <option value="Hausa">Hausa</option>
        </select>
        <input type="text" id="childName" placeholder="Child's name(s)">
      </div>
      <button class="btn primary" id="downloadCertBtn">Download naming certificate (PDF)</button>
    </div>` : ''}

    ${isFuneral ? `
    <div class="ev-panel">
      <h3 style="font-size:1rem; margin-bottom:10px;">Order of service / Obituary</h3>
      <div class="ev-form-row">
        <input type="text" id="deceasedName" placeholder="Full name of the departed">
        <input type="text" id="deceasedDates" placeholder="e.g. 12 March 1948 — 2 July 2026">
      </div>
      <textarea id="obituaryText" rows="4" placeholder="A short life summary / tribute..."></textarea>
      <button class="btn primary" id="downloadObituaryBtn" style="margin-top:10px;">Download order of service (PDF)</button>
    </div>` : ''}
  `;

  new QRCode(document.getElementById('qrHolder'), { text: rsvpLink, width: 160, height: 160 });

  document.getElementById('saveInviteBtn').addEventListener('click', async () => {
    const { supabase } = ctx;
    const { error } = await supabase.from('events').update({
      invite_venue: document.getElementById('inviteVenue').value.trim(),
      invite_message: document.getElementById('inviteMessage').value.trim(),
    }).eq('id', EVENT_ID);
    if (error) { toast('Could not save: ' + error.message); return; }
    event.invite_venue = document.getElementById('inviteVenue').value.trim();
    event.invite_message = document.getElementById('inviteMessage').value.trim();
    toast('Saved.');
  });

  document.getElementById('copyLinkBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(rsvpLink).then(() => toast('Link copied.'));
  });

  document.getElementById('downloadInviteBtn').addEventListener('click', () => {
    const qrCanvas = document.querySelector('#qrHolder canvas');
    const bodyText = `${document.getElementById('inviteMessage').value.trim() || 'You are cordially invited.'}\n\nVenue: ${document.getElementById('inviteVenue').value.trim() || '[Venue]'}\nDate: ${fmtDate(event.event_date)}\n\nPlease RSVP: ${rsvpLink}`;
    const doc = KoboExport.buildLetterPdf({ letterhead: event.event_name, dateLine: TYPE_LABELS[event.event_type], bodyText });
    if (qrCanvas) {
      try {
        const imgData = qrCanvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 240, 620, 100, 100);
      } catch (e) { /* ignore if canvas not ready */ }
    }
    KoboExport.download(`${event.event_name.replace(/[^a-z0-9]+/gi, '-')}-invitation.pdf`, doc);
  });

  const certBtn = document.getElementById('downloadCertBtn');
  if (certBtn) certBtn.addEventListener('click', () => {
    const tradition = document.getElementById('namingTradition').value;
    const childName = document.getElementById('childName').value.trim() || '[Child\'s name]';
    const bodyText = `This certifies that on ${fmtDate(event.event_date)}, at a naming ceremony held according to ${tradition} tradition, the child was given the name:\n\n${childName}\n\nVenue: ${event.invite_venue || '[Venue]'}\n\nWith blessings and best wishes from family and friends gathered to celebrate this occasion.`;
    const doc = KoboExport.buildLetterPdf({ letterhead: 'Naming Certificate', dateLine: fmtDate(event.event_date), bodyText });
    KoboExport.download('naming-certificate.pdf', doc);
  });

  const obitBtn = document.getElementById('downloadObituaryBtn');
  if (obitBtn) obitBtn.addEventListener('click', () => {
    const name = document.getElementById('deceasedName').value.trim() || '[Name]';
    const dates = document.getElementById('deceasedDates').value.trim();
    const tribute = document.getElementById('obituaryText').value.trim() || '[Tribute text]';
    const bodyText = `IN LOVING MEMORY OF\n\n${name}\n${dates}\n\n${tribute}\n\nOrder of Service\nVenue: ${event.invite_venue || '[Venue]'}\nDate: ${fmtDate(event.event_date)}`;
    const doc = KoboExport.buildLetterPdf({ letterhead: 'Order of Service', dateLine: name, bodyText });
    KoboExport.download('order-of-service.pdf', doc);
  });
}

// ---------- Tab switching ----------
const TAB_RENDERERS = {
  overview: renderOverview,
  guests: renderGuests,
  vendors: renderVendors,
  contributions: renderContributions,
  timeline: renderTimeline,
  invitation: renderInvitation,
};

document.getElementById('evTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  currentTab = btn.dataset.tab;
  document.querySelectorAll('#evTabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  TAB_RENDERERS[currentTab]();
});

(async () => {
  ctx = await window.EventsGuard.requireAccess();
  if (!ctx) return;
  const ok = await loadEvent();
  if (!ok) return;
  renderOverview();
  KoboSubscribe.resumePendingIfAny().then(async () => {
    await loadEvent();
    TAB_RENDERERS[currentTab]();
  });
})();
