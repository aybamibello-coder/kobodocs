let ctx = null;
let survey = null;
const surveyId = new URLSearchParams(window.location.search).get('id');

const TYPE_LABELS = {
  text: 'Short text', textarea: 'Paragraph', multiple_choice: 'Multiple choice',
  checkbox: 'Checkboxes', rating: 'Rating', nps: 'NPS', likert: 'Likert', ranking: 'Ranking',
};
const OPTION_TYPES = new Set(['multiple_choice', 'checkbox', 'ranking']);

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function questionId() { return 'q_' + Math.random().toString(36).slice(2, 10); }

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function saveSurvey(patch) {
  const { supabase } = ctx;
  Object.assign(survey, patch);
  const { error } = await supabase.from('surveys').update(patch).eq('id', surveyId);
  if (error) toast('Could not save: ' + error.message);
}

const saveQuestionsDebounced = debounce(() => saveSurvey({ questions: survey.questions }), 600);
const saveMetaDebounced = debounce((patch) => saveSurvey(patch), 600);

// ---------- Build tab: questions ----------
function renderQuestions() {
  const list = document.getElementById('questionsList');
  if (!survey.questions.length) {
    list.innerHTML = `<div class="empty-note">No questions yet — add your first one below.</div>`;
    return;
  }
  list.innerHTML = survey.questions.map((q, i) => `
    <div class="field-row" data-id="${q.id}">
      <div class="field-row-top">
        <span class="field-type-badge">${TYPE_LABELS[q.type] || q.type}</span>
        <input class="field-label-input" data-role="label" value="${(q.label || '').replace(/"/g, '&quot;')}" placeholder="Question">
        <label class="field-required"><input type="checkbox" data-role="required" ${q.required ? 'checked' : ''}> Required</label>
        <div class="field-actions">
          <button class="icon-btn" data-role="up" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
          <button class="icon-btn" data-role="down" ${i === survey.questions.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
          <button class="icon-btn" data-role="delete" title="Delete">✕</button>
        </div>
      </div>
      ${OPTION_TYPES.has(q.type) ? `
        <div class="field-options">
          <textarea data-role="options" rows="2" placeholder="One option per line">${(q.options || []).join('\n')}</textarea>
          <div class="field-options-hint">One option per line.</div>
        </div>
      ` : ''}
      ${q.type === 'nps' ? `<div class="field-options-hint">Respondents pick 0 (not likely) to 10 (very likely).</div>` : ''}
      ${q.type === 'likert' ? `<div class="field-options-hint">Strongly disagree — Disagree — Neutral — Agree — Strongly agree.</div>` : ''}
    </div>
  `).join('');
}

document.getElementById('questionsList').addEventListener('input', (e) => {
  const row = e.target.closest('.field-row');
  if (!row) return;
  const q = survey.questions.find(q => q.id === row.dataset.id);
  if (!q) return;
  if (e.target.dataset.role === 'label') q.label = e.target.value;
  if (e.target.dataset.role === 'options') q.options = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
  saveQuestionsDebounced();
});

document.getElementById('questionsList').addEventListener('change', (e) => {
  if (e.target.dataset.role !== 'required') return;
  const row = e.target.closest('.field-row');
  const q = survey.questions.find(q => q.id === row.dataset.id);
  if (!q) return;
  q.required = e.target.checked;
  saveQuestionsDebounced();
});

document.getElementById('questionsList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-role]');
  if (!btn) return;
  const row = btn.closest('.field-row');
  const idx = survey.questions.findIndex(q => q.id === row.dataset.id);
  if (idx === -1) return;

  if (btn.dataset.role === 'delete') {
    survey.questions.splice(idx, 1);
  } else if (btn.dataset.role === 'up' && idx > 0) {
    [survey.questions[idx - 1], survey.questions[idx]] = [survey.questions[idx], survey.questions[idx - 1]];
  } else if (btn.dataset.role === 'down' && idx < survey.questions.length - 1) {
    [survey.questions[idx + 1], survey.questions[idx]] = [survey.questions[idx], survey.questions[idx + 1]];
  }
  renderQuestions();
  saveQuestionsDebounced();
});

document.getElementById('addQuestionBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('addQuestionMenu').classList.toggle('show');
});
document.addEventListener('click', () => document.getElementById('addQuestionMenu').classList.remove('show'));

document.getElementById('addQuestionMenu').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  const type = btn.dataset.type;
  const q = { id: questionId(), type, label: TYPE_LABELS[type], required: false };
  if (OPTION_TYPES.has(type)) q.options = ['Option 1', 'Option 2'];
  survey.questions.push(q);
  renderQuestions();
  saveQuestionsDebounced();
});

document.getElementById('surveyTitleInput').addEventListener('input', (e) => saveMetaDebounced({ title: e.target.value }));
document.getElementById('surveyDescInput').addEventListener('input', (e) => saveMetaDebounced({ description: e.target.value || null }));

// ---------- Tabs ----------
document.querySelector('.qb-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  document.querySelectorAll('.qb-tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.qb-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  if (btn.dataset.tab === 'responses') loadResponses();
});

// ---------- Share tab ----------
function renderShare() {
  document.querySelectorAll('#statusToggle button').forEach(b => b.classList.toggle('active', b.dataset.status === survey.status));
  const url = `${window.location.origin}/survey/s/?s=${survey.slug}`;
  document.getElementById('shareUrlInput').value = url;
  document.getElementById('waShareBtn').href = `https://wa.me/?text=${encodeURIComponent(survey.title + ' — ' + url)}`;
}

document.getElementById('statusToggle').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-status]');
  if (!btn) return;
  await saveSurvey({ status: btn.dataset.status });
  renderShare();
  toast('Survey is now ' + btn.dataset.status + '.');
});

document.getElementById('copyShareBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('shareUrlInput').value);
  toast('Link copied.');
});

// ---------- Responses tab ----------
let lastResponses = [];

async function loadResponses() {
  const { supabase } = ctx;
  const wrap = document.getElementById('responsesTableWrap');
  wrap.innerHTML = `<div class="empty-note">Loading…</div>`;
  const { data, error } = await supabase
    .from('survey_responses')
    .select('id, answers, submitted_at')
    .eq('survey_id', surveyId)
    .order('submitted_at', { ascending: false });

  if (error) {
    wrap.innerHTML = `<div class="empty-note">Could not load responses: ${error.message}</div>`;
    return;
  }
  lastResponses = data || [];
  document.getElementById('responseCount').textContent = `${lastResponses.length} response${lastResponses.length === 1 ? '' : 's'}`;

  if (!lastResponses.length) {
    wrap.innerHTML = `<div class="empty-note">No responses yet.</div>`;
    return;
  }

  const cols = survey.questions;
  wrap.innerHTML = `
    <table class="resp-table">
      <thead>
        <tr>
          <th>Submitted</th>
          ${cols.map(c => `<th>${c.label}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${lastResponses.map(r => `
          <tr>
            <td>${new Date(r.submitted_at).toLocaleString('en-GB')}</td>
            ${cols.map(c => `<td>${formatAnswer(r.answers[c.id])}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function formatAnswer(val) {
  if (val === undefined || val === null || val === '') return '';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (!lastResponses.length) { toast('No responses to export yet.'); return; }
  const cols = survey.questions;
  const header = ['Submitted', ...cols.map(c => c.label)];
  const rows = lastResponses.map(r => [
    new Date(r.submitted_at).toISOString(),
    ...cols.map(c => {
      const v = r.answers[c.id];
      return Array.isArray(v) ? v.join('; ') : (v ?? '');
    }),
  ]);
  const csv = [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${survey.slug}-responses.csv`;
  a.click();
});

// ---------- Init ----------
(async () => {
  ctx = await window.SurveyGuard.requireAccess();
  if (!ctx) return;
  if (!surveyId) { window.location.href = '/survey/app/'; return; }

  const { supabase } = ctx;
  const { data, error } = await supabase.from('surveys').select('*').eq('id', surveyId).single();
  if (error || !data) {
    toast('Survey not found.');
    setTimeout(() => window.location.href = '/survey/app/', 1200);
    return;
  }
  survey = data;
  document.getElementById('surveyTitleInput').value = survey.title || '';
  document.getElementById('surveyDescInput').value = survey.description || '';
  renderQuestions();
  renderShare();
})();
