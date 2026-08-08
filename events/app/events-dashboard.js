let ctx = null;
let selectedType = 'wedding';

const TYPE_LABELS = { wedding: 'Wedding', naming: 'Naming Ceremony', funeral: 'Funeral / Memorial', custom: 'Custom Event' };

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function naira(n) { return '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG'); }

function fmtDate(iso) {
  if (!iso) return 'No date set';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function loadEvents() {
  const { supabase, session } = ctx;
  const { data: events, error } = await supabase
    .from('events')
    .select('id, event_type, event_name, event_date, pass_status, guest_count')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });

  const container = document.getElementById('eventsList');
  if (error) {
    container.innerHTML = `<div class="empty-note">Could not load your events: ${error.message}</div>`;
    return;
  }
  if (!events || !events.length) {
    container.innerHTML = `<div class="empty-note">No events yet. Create your first one above — the budget calculator and basic guest list are free to start.</div>`;
    return;
  }

  container.innerHTML = events.map(e => `
    <div class="ev-card">
      <div>
        <div class="ev-card-name">${e.event_name}</div>
        <div class="ev-card-meta">${TYPE_LABELS[e.event_type] || e.event_type} · ${fmtDate(e.event_date)}${e.guest_count ? ` · ~${e.guest_count} guests` : ''}</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="ev-badge ${e.pass_status === 'active' ? 'active' : 'none'}">${e.pass_status === 'active' ? 'Event Pass active' : 'Free tier'}</span>
        <a href="/events/app/event/?id=${e.id}" class="btn primary">Open</a>
      </div>
    </div>
  `).join('');
}

document.getElementById('newEventBtn').addEventListener('click', () => {
  document.getElementById('newEventForm').classList.add('show');
});
document.getElementById('cancelEventBtn').addEventListener('click', () => {
  document.getElementById('newEventForm').classList.remove('show');
});

document.getElementById('typeTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  selectedType = btn.dataset.type;
  document.querySelectorAll('#typeTabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
});

document.getElementById('createEventBtn').addEventListener('click', async () => {
  const btn = document.getElementById('createEventBtn');
  const eventName = document.getElementById('eventName').value.trim();
  if (!eventName) { toast('Give the event a name first.'); return; }

  const eventDate = document.getElementById('eventDate').value || null;
  const cityTier = document.getElementById('cityTier').value;
  const guestCount = parseInt(document.getElementById('guestCount').value, 10) || null;

  btn.textContent = 'Creating…';
  btn.disabled = true;

  const { supabase, session } = ctx;
  const { data, error } = await supabase
    .from('events')
    .insert({
      user_id: session.user.id,
      event_type: selectedType,
      event_name: eventName,
      event_date: eventDate,
      city_tier: cityTier,
      guest_count: guestCount,
    })
    .select('id')
    .single();

  if (error) {
    toast('Could not create event: ' + error.message);
    btn.textContent = 'Create event';
    btn.disabled = false;
    return;
  }

  window.location.href = `/events/app/event/?id=${data.id}`;
});

(async () => {
  ctx = await window.EventsGuard.requireAccess();
  if (!ctx) return;
  await loadEvents();
})();
