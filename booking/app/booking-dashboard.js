let ctx = null;

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3500);
}

function slugify(name) {
  const base = (name || 'business').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'business';
  return base + '-' + Math.random().toString(36).slice(2, 8);
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function loadPlanStrip() {
  const { supabase, session } = ctx;
  const [{ data: limits }, { count: pageCount }] = await Promise.all([
    supabase.rpc('get_booking_plan_limits', { p_user_id: session.user.id }),
    supabase.from('booking_pages').select('id', { count: 'exact', head: true }).eq('owner_id', session.user.id),
  ]);
  const row = Array.isArray(limits) ? limits[0] : limits;
  if (!row) return;
  document.getElementById('planStrip').innerHTML =
    `<strong>${row.plan_key[0].toUpperCase() + row.plan_key.slice(1)} plan</strong> — ${pageCount ?? 0} booking page(s) · ` +
    `${row.max_bookings_per_month === null ? 'unlimited' : row.max_bookings_per_month.toLocaleString()} bookings/mo · ` +
    `${row.max_staff === null ? 'unlimited' : row.max_staff} staff calendar(s) · <a href="/pricing/">Change plan</a>`;
}

async function loadPages() {
  const { supabase, session } = ctx;
  const { data: pages, error } = await supabase
    .from('booking_pages')
    .select('id, business_name, status, created_at')
    .eq('owner_id', session.user.id)
    .order('created_at', { ascending: false });

  const container = document.getElementById('pagesList');
  if (error) {
    container.innerHTML = `<div class="empty-note">Could not load your booking pages: ${error.message}</div>`;
    return;
  }
  if (!pages || !pages.length) {
    container.innerHTML = `<div class="empty-note">No booking pages yet. Create your first one above.</div>`;
    return;
  }

  container.innerHTML = pages.map(p => `
    <div class="fm-card">
      <div>
        <div class="fm-card-name">${p.business_name}</div>
        <div class="fm-card-meta">Created ${fmtDate(p.created_at)}</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="fm-badge ${p.status}">${p.status}</span>
        <a href="/booking/app/page/?id=${p.id}" class="btn primary">Open</a>
      </div>
    </div>
  `).join('');
}

document.getElementById('newPageBtn').addEventListener('click', () => {
  document.getElementById('newPageForm').classList.add('show');
});
document.getElementById('cancelPageBtn').addEventListener('click', () => {
  document.getElementById('newPageForm').classList.remove('show');
});

document.getElementById('createPageBtn').addEventListener('click', async () => {
  const btn = document.getElementById('createPageBtn');
  const businessName = document.getElementById('businessNameInput').value.trim();
  if (!businessName) { toast('Give your business a name first.'); return; }

  btn.textContent = 'Creating…';
  btn.disabled = true;

  const { supabase, session } = ctx;
  const { data, error } = await supabase
    .from('booking_pages')
    .insert({
      owner_id: session.user.id,
      business_name: businessName,
      description: document.getElementById('pageDescriptionInput').value.trim() || null,
      slug: slugify(businessName),
    })
    .select('id')
    .single();

  if (error) {
    toast('Could not create booking page: ' + error.message);
    btn.textContent = 'Create page';
    btn.disabled = false;
    return;
  }

  window.location.href = `/booking/app/page/?id=${data.id}`;
});

(async () => {
  ctx = await window.BookingGuard.requireAccess();
  if (!ctx) return;
  await Promise.all([loadPlanStrip(), loadPages()]);
})();
