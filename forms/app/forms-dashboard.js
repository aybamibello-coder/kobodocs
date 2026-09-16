let ctx = null;

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3500);
}

function slugify(title) {
  const base = (title || 'form').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'form';
  return base + '-' + Math.random().toString(36).slice(2, 8);
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function loadPlanStrip() {
  const { supabase, session } = ctx;
  const [{ data: limits }, { count }] = await Promise.all([
    supabase.rpc('get_form_plan_limits', { p_user_id: session.user.id }),
    supabase.from('forms').select('id', { count: 'exact', head: true }).eq('owner_id', session.user.id),
  ]);
  const row = Array.isArray(limits) ? limits[0] : limits;
  if (!row) return;
  const formsLabel = row.max_forms === null ? `${count ?? 0} forms (unlimited)` : `${count ?? 0} / ${row.max_forms} forms`;
  const subLabel = row.max_submissions_per_month === null ? 'unlimited submissions/mo' : `${row.max_submissions_per_month.toLocaleString()} submissions/mo`;
  document.getElementById('planStrip').innerHTML =
    `<strong>${row.plan_key[0].toUpperCase() + row.plan_key.slice(1)} plan</strong> — ${formsLabel} · ${subLabel} · <a href="/pricing/">Change plan</a>`;
}

async function loadForms() {
  const { supabase, session } = ctx;
  const { data: forms, error } = await supabase
    .from('forms')
    .select('id, title, status, response_count, created_at')
    .eq('owner_id', session.user.id)
    .order('created_at', { ascending: false });

  const container = document.getElementById('formsList');
  if (error) {
    container.innerHTML = `<div class="empty-note">Could not load your forms: ${error.message}</div>`;
    return;
  }
  if (!forms || !forms.length) {
    container.innerHTML = `<div class="empty-note">No forms yet. Create your first one above.</div>`;
    return;
  }

  container.innerHTML = forms.map(f => `
    <div class="fm-card">
      <div>
        <div class="fm-card-name">${f.title}</div>
        <div class="fm-card-meta">${fmtDate(f.created_at)} · ${f.response_count} response${f.response_count === 1 ? '' : 's'}</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="fm-badge ${f.status}">${f.status}</span>
        <a href="/forms/app/form/?id=${f.id}" class="btn primary">Open</a>
      </div>
    </div>
  `).join('');
}

document.getElementById('newFormBtn').addEventListener('click', () => {
  document.getElementById('newFormForm').classList.add('show');
});
document.getElementById('cancelFormBtn').addEventListener('click', () => {
  document.getElementById('newFormForm').classList.remove('show');
});

document.getElementById('createFormBtn').addEventListener('click', async () => {
  const btn = document.getElementById('createFormBtn');
  const title = document.getElementById('formTitle').value.trim();
  if (!title) { toast('Give the form a title first.'); return; }

  btn.textContent = 'Creating…';
  btn.disabled = true;

  const { supabase, session } = ctx;
  const { data, error } = await supabase
    .from('forms')
    .insert({
      owner_id: session.user.id,
      title,
      description: document.getElementById('formDescription').value.trim() || null,
      slug: slugify(title),
    })
    .select('id')
    .single();

  if (error) {
    const msg = error.message.includes('form_limit_reached')
      ? "You've reached your plan's form limit. Upgrade to create more."
      : 'Could not create form: ' + error.message;
    toast(msg);
    btn.textContent = 'Create form';
    btn.disabled = false;
    return;
  }

  window.location.href = `/forms/app/form/?id=${data.id}`;
});

(async () => {
  ctx = await window.FormsGuard.requireAccess();
  if (!ctx) return;
  await Promise.all([loadPlanStrip(), loadForms()]);
})();
