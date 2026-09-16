let ctx = null;

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3500);
}

function slugify(title) {
  const base = (title || 'survey').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'survey';
  return base + '-' + Math.random().toString(36).slice(2, 8);
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function loadPlanStrip() {
  const { supabase, session } = ctx;
  const [{ data: limits }, { count }] = await Promise.all([
    supabase.rpc('get_survey_plan_limits', { p_user_id: session.user.id }),
    supabase.from('surveys').select('id', { count: 'exact', head: true }).eq('owner_id', session.user.id),
  ]);
  const row = Array.isArray(limits) ? limits[0] : limits;
  if (!row) return;
  const surveysLabel = row.max_surveys === null ? `${count ?? 0} surveys (unlimited)` : `${count ?? 0} / ${row.max_surveys} surveys`;
  const respLabel = row.max_responses_per_month === null ? 'unlimited responses/mo' : `${row.max_responses_per_month.toLocaleString()} responses/mo`;
  document.getElementById('planStrip').innerHTML =
    `<strong>${row.plan_key[0].toUpperCase() + row.plan_key.slice(1)} plan</strong> — ${surveysLabel} · ${respLabel} · <a href="/pricing/">Change plan</a>`;
}

async function loadSurveys() {
  const { supabase, session } = ctx;
  const { data: surveys, error } = await supabase
    .from('surveys')
    .select('id, title, status, response_count, created_at')
    .eq('owner_id', session.user.id)
    .order('created_at', { ascending: false });

  const container = document.getElementById('surveysList');
  if (error) {
    container.innerHTML = `<div class="empty-note">Could not load your surveys: ${error.message}</div>`;
    return;
  }
  if (!surveys || !surveys.length) {
    container.innerHTML = `<div class="empty-note">No surveys yet. Create your first one above.</div>`;
    return;
  }

  container.innerHTML = surveys.map(s => `
    <div class="sv-card">
      <div>
        <div class="sv-card-name">${s.title}</div>
        <div class="sv-card-meta">${fmtDate(s.created_at)} · ${s.response_count} response${s.response_count === 1 ? '' : 's'}</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="sv-badge ${s.status}">${s.status}</span>
        <a href="/survey/app/survey/?id=${s.id}" class="btn primary">Open</a>
      </div>
    </div>
  `).join('');
}

document.getElementById('newSurveyBtn').addEventListener('click', () => {
  document.getElementById('newSurveyForm').classList.add('show');
});
document.getElementById('cancelSurveyBtn').addEventListener('click', () => {
  document.getElementById('newSurveyForm').classList.remove('show');
});

function initTemplatePickers() {
  const catSelect = document.getElementById('templateCategory');
  const langSelect = document.getElementById('templateLang');
  const langRow = document.getElementById('templateLangRow');
  const reviewNote = document.getElementById('templateReviewNote');

  window.SurveyTemplates.categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.key;
    opt.textContent = c.label;
    catSelect.appendChild(opt);
  });
  window.SurveyTemplates.languages.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l.key;
    opt.textContent = l.label;
    langSelect.appendChild(opt);
  });

  function applyPreview() {
    if (!catSelect.value) {
      document.getElementById('surveyTitle').value = '';
      document.getElementById('surveyDescription').value = '';
      return;
    }
    const tpl = window.SurveyTemplates.get(catSelect.value, langSelect.value);
    if (!tpl) return;
    document.getElementById('surveyTitle').value = tpl.title;
    document.getElementById('surveyDescription').value = tpl.description;
    reviewNote.style.display = tpl.needsReview ? 'block' : 'none';
  }

  catSelect.addEventListener('change', () => {
    langRow.style.display = catSelect.value ? 'block' : 'none';
    applyPreview();
  });
  langSelect.addEventListener('change', applyPreview);
}

document.getElementById('createSurveyBtn').addEventListener('click', async () => {
  const btn = document.getElementById('createSurveyBtn');
  const title = document.getElementById('surveyTitle').value.trim();
  if (!title) { toast('Give the survey a title first.'); return; }

  btn.textContent = 'Creating…';
  btn.disabled = true;

  const { supabase, session } = ctx;
  const catSelect = document.getElementById('templateCategory');
  const langSelect = document.getElementById('templateLang');
  const tpl = catSelect.value ? window.SurveyTemplates.get(catSelect.value, langSelect.value) : null;

  const { data, error } = await supabase
    .from('surveys')
    .insert({
      owner_id: session.user.id,
      title,
      description: document.getElementById('surveyDescription').value.trim() || null,
      slug: slugify(title),
      questions: tpl ? tpl.questions : [],
    })
    .select('id')
    .single();

  if (error) {
    const msg = error.message.includes('survey_limit_reached')
      ? "You've reached your plan's survey limit. Upgrade to create more."
      : 'Could not create survey: ' + error.message;
    toast(msg);
    btn.textContent = 'Create survey';
    btn.disabled = false;
    return;
  }

  window.location.href = `/survey/app/survey/?id=${data.id}`;
});

(async () => {
  ctx = await window.SurveyGuard.requireAccess();
  if (!ctx) return;
  initTemplatePickers();
  await Promise.all([loadPlanStrip(), loadSurveys()]);
})();
