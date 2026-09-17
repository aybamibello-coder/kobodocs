let ctx = null;
let survey = null;
const surveyId = new URLSearchParams(window.location.search).get('id');

const TYPE_LABELS = {
  text: 'Short text', textarea: 'Paragraph', multiple_choice: 'Multiple choice',
  checkbox: 'Checkboxes', rating: 'Rating', nps: 'NPS', likert: 'Likert', ranking: 'Ranking',
  matrix: 'Matrix (grid)',
};
const OPTION_TYPES = new Set(['multiple_choice', 'checkbox', 'ranking']);
const COND_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'answered', label: 'is answered' },
  { value: 'not_answered', label: 'is not answered' },
];

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
function conditionSummary(q, allQuestions) {
  if (!q.showIf) return 'Always shown';
  const src = allQuestions.find(x => x.id === q.showIf.fieldId);
  const opLabel = (COND_OPERATORS.find(o => o.value === q.showIf.op) || {}).label || q.showIf.op;
  const srcLabel = src ? src.label : '(deleted question)';
  return q.showIf.op.includes('answered') ? `Shown if "${srcLabel}" ${opLabel}` : `Shown if "${srcLabel}" ${opLabel} "${q.showIf.value || ''}"`;
}

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
          ${(q.options || []).map((opt, oi) => `
            <div class="option-row" data-idx="${oi}">
              <input type="text" data-role="option-value" value="${(opt || '').replace(/"/g, '&quot;')}" placeholder="Option ${oi + 1}">
              <button type="button" class="icon-btn" data-role="option-delete" title="Remove option">✕</button>
            </div>
          `).join('')}
          <button type="button" class="btn" data-role="option-add">+ Add option</button>
        </div>
      ` : ''}
      ${q.type === 'matrix' ? `
        <div class="matrix-editor">
          <div>
            <textarea data-role="matrix-rows" rows="3" placeholder="One row per line, e.g.&#10;Speed of service&#10;Staff friendliness">${(q.rows || []).join('\n')}</textarea>
            <div class="field-options-hint">Rows (statements to rate).</div>
          </div>
          <div>
            <textarea data-role="matrix-columns" rows="3" placeholder="One column per line, e.g.&#10;Poor&#10;Average&#10;Good">${(q.columns || []).join('\n')}</textarea>
            <div class="field-options-hint">Columns (answer scale).</div>
          </div>
        </div>
      ` : ''}
      ${q.type === 'nps' ? `<div class="field-options-hint">Respondents pick 0 (not likely) to 10 (very likely).</div>` : ''}
      ${q.type === 'likert' ? `<div class="field-options-hint">Strongly disagree — Disagree — Neutral — Agree — Strongly agree.</div>` : ''}
      ${i > 0 ? `
        <div class="field-condition">
          <button type="button" class="cond-toggle-link" data-role="cond-toggle">${conditionSummary(q, survey.questions)} — edit</button>
          <div class="field-condition-row" data-role="cond-editor" style="display:none; margin-top:8px;">
            <select data-role="cond-field">
              <option value="">Always show</option>
              ${survey.questions.slice(0, i).map(other => `<option value="${other.id}" ${q.showIf && q.showIf.fieldId === other.id ? 'selected' : ''}>${other.label}</option>`).join('')}
            </select>
            <select data-role="cond-op">
              ${COND_OPERATORS.map(o => `<option value="${o.value}" ${q.showIf && q.showIf.op === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
            <input type="text" data-role="cond-value" placeholder="value" value="${q.showIf && q.showIf.value ? q.showIf.value.replace(/"/g, '&quot;') : ''}" ${q.showIf && q.showIf.op && q.showIf.op.includes('answered') ? 'style="display:none;"' : ''}>
          </div>
        </div>
      ` : ''}
    </div>
  `).join('');
}

document.getElementById('questionsList').addEventListener('input', (e) => {
  const row = e.target.closest('.field-row');
  if (!row) return;
  const q = survey.questions.find(q => q.id === row.dataset.id);
  if (!q) return;
  if (e.target.dataset.role === 'label') q.label = e.target.value;
  if (e.target.dataset.role === 'option-value') {
    const idx = parseInt(e.target.closest('.option-row').dataset.idx, 10);
    q.options[idx] = e.target.value;
  }
  if (e.target.dataset.role === 'matrix-rows') q.rows = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
  if (e.target.dataset.role === 'matrix-columns') q.columns = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
  if (e.target.dataset.role === 'cond-value') {
    q.showIf = q.showIf || {};
    q.showIf.value = e.target.value;
  }
  saveQuestionsDebounced();
});

document.getElementById('questionsList').addEventListener('change', (e) => {
  const row = e.target.closest('.field-row');
  if (!row) return;
  const q = survey.questions.find(q => q.id === row.dataset.id);
  if (!q) return;

  if (e.target.dataset.role === 'required') q.required = e.target.checked;

  if (e.target.dataset.role === 'cond-field') {
    if (!e.target.value) {
      q.showIf = null;
    } else {
      q.showIf = { fieldId: e.target.value, op: (q.showIf && q.showIf.op) || 'equals', value: (q.showIf && q.showIf.value) || '' };
    }
    renderQuestions();
  }
  if (e.target.dataset.role === 'cond-op') {
    q.showIf = q.showIf || { fieldId: '', value: '' };
    q.showIf.op = e.target.value;
    renderQuestions();
  }
  saveQuestionsDebounced();
});

document.getElementById('questionsList').addEventListener('click', (e) => {
  const toggleBtn = e.target.closest('button[data-role="cond-toggle"]');
  if (toggleBtn) {
    const editor = toggleBtn.parentElement.querySelector('[data-role="cond-editor"]');
    editor.style.display = editor.style.display === 'none' ? 'flex' : 'none';
    return;
  }

  const btn = e.target.closest('button[data-role]');
  if (!btn) return;
  const row = btn.closest('.field-row');
  const idx = survey.questions.findIndex(q => q.id === row.dataset.id);
  if (idx === -1) return;

  if (btn.dataset.role === 'option-add') {
    survey.questions[idx].options = survey.questions[idx].options || [];
    survey.questions[idx].options.push(`Option ${survey.questions[idx].options.length + 1}`);
  } else if (btn.dataset.role === 'option-delete') {
    const optIdx = parseInt(btn.closest('.option-row').dataset.idx, 10);
    survey.questions[idx].options.splice(optIdx, 1);
  } else if (btn.dataset.role === 'delete') {
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
  if (type === 'matrix') { q.rows = ['Row 1', 'Row 2']; q.columns = ['Poor', 'Average', 'Good']; }
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
  if (btn.dataset.tab === 'analytics') initCrossTab();
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
  if (typeof val === 'object') return Object.entries(val).map(([k, v]) => `${k}: ${v}`).join('; ');
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
      if (Array.isArray(v)) return v.join('; ');
      if (v && typeof v === 'object') return Object.entries(v).map(([k, val]) => `${k}: ${val}`).join('; ');
      return v ?? '';
    }),
  ]);
  const csv = [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${survey.slug}-responses.csv`;
  a.click();
});

// ---------- Cross-tab analytics ----------
const CROSSTAB_TYPES = new Set(['multiple_choice', 'rating', 'nps', 'likert']);
const LIKERT_LABELS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

function crossTabValue(q, answers) {
  const v = answers[q.id];
  if (v === undefined || v === null || v === '') return null;
  if (q.type === 'likert') return LIKERT_LABELS[parseInt(v, 10) - 1] || String(v);
  return String(v);
}

async function initCrossTab() {
  const eligible = survey.questions.filter(q => CROSSTAB_TYPES.has(q.type));
  const selA = document.getElementById('crossTabA');
  const selB = document.getElementById('crossTabB');
  if (eligible.length < 2) {
    document.getElementById('crossTabResult').innerHTML = `<div class="empty-note">Add at least two multiple choice / rating / NPS / Likert questions to cross-tabulate.</div>`;
    selA.innerHTML = '';
    selB.innerHTML = '';
    return;
  }
  const optionsHtml = eligible.map(q => `<option value="${q.id}">${q.label}</option>`).join('');
  selA.innerHTML = optionsHtml;
  selB.innerHTML = optionsHtml;
  selB.selectedIndex = 1;

  if (!lastResponses.length) await loadResponsesQuietly();
}

async function loadResponsesQuietly() {
  const { supabase } = ctx;
  const { data } = await supabase.from('survey_responses').select('id, answers, submitted_at').eq('survey_id', surveyId);
  lastResponses = data || [];
}

document.getElementById('runCrossTabBtn').addEventListener('click', () => {
  const qA = survey.questions.find(q => q.id === document.getElementById('crossTabA').value);
  const qB = survey.questions.find(q => q.id === document.getElementById('crossTabB').value);
  const result = document.getElementById('crossTabResult');
  if (!qA || !qB) return;
  if (qA.id === qB.id) { result.innerHTML = `<div class="empty-note">Choose two different questions.</div>`; return; }
  if (!lastResponses.length) { result.innerHTML = `<div class="empty-note">No responses yet.</div>`; return; }

  const bValues = qB.type === 'likert' ? LIKERT_LABELS.slice() : Array.from(new Set(lastResponses.map(r => crossTabValue(qB, r.answers)).filter(Boolean)));
  const grid = {};
  lastResponses.forEach(r => {
    const a = crossTabValue(qA, r.answers);
    const b = crossTabValue(qB, r.answers);
    if (a === null || b === null) return;
    grid[a] = grid[a] || {};
    grid[a][b] = (grid[a][b] || 0) + 1;
  });
  const aValues = Object.keys(grid);
  if (!aValues.length) { result.innerHTML = `<div class="empty-note">No overlapping answers for these two questions yet.</div>`; return; }

  result.innerHTML = `
    <table class="resp-table">
      <thead><tr><th>${qA.label} \\ ${qB.label}</th>${bValues.map(b => `<th>${b}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>
        ${aValues.map(a => {
          const rowTotal = bValues.reduce((sum, b) => sum + (grid[a][b] || 0), 0);
          return `<tr><td>${a}</td>${bValues.map(b => `<td>${grid[a][b] || 0}</td>`).join('')}<td><strong>${rowTotal}</strong></td></tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
});

// ---------- AI generator ----------
document.getElementById('aiGenerateBtn').addEventListener('click', () => {
  document.getElementById('aiGenerateBox').style.display = 'block';
});
document.getElementById('aiGenerateCancelBtn').addEventListener('click', () => {
  document.getElementById('aiGenerateBox').style.display = 'none';
});

document.getElementById('aiGenerateSubmitBtn').addEventListener('click', async () => {
  const { supabase } = ctx;
  const btn = document.getElementById('aiGenerateSubmitBtn');
  const errEl = document.getElementById('aiGenerateError');
  const description = document.getElementById('aiPromptInput').value.trim();
  errEl.style.display = 'none';
  if (!description) { errEl.textContent = 'Describe the survey you want first.'; errEl.style.display = 'block'; return; }

  btn.disabled = true;
  btn.textContent = 'Generating…';

  const { data, error } = await supabase.functions.invoke('generate-schema', { body: { product: 'survey', description } });

  btn.disabled = false;
  btn.textContent = 'Generate';

  if (error || !data || !data.success) {
    errEl.textContent = (data && data.error) || (error && error.message) || 'Could not generate a survey from that description.';
    errEl.style.display = 'block';
    return;
  }

  if (!survey.title || survey.title === 'Untitled survey') {
    document.getElementById('surveyTitleInput').value = data.title;
    survey.title = data.title;
  }
  if (!survey.description && data.description) {
    document.getElementById('surveyDescInput').value = data.description;
    survey.description = data.description;
  }
  survey.questions.push(...data.items);
  renderQuestions();
  saveSurvey({ title: survey.title, description: survey.description, questions: survey.questions });
  document.getElementById('aiGenerateBox').style.display = 'none';
  document.getElementById('aiPromptInput').value = '';
  toast('Added ' + data.items.length + ' question(s) from AI. Review before publishing.');
});

async function loadAiPlanHint() {
  const { supabase, session } = ctx;
  const { data } = await supabase.rpc('get_survey_plan_limits', { p_user_id: session.user.id });
  const row = Array.isArray(data) ? data[0] : data;
  const hintEl = document.getElementById('aiPlanHint');
  if (row && ['pro', 'team'].includes(row.plan_key)) {
    hintEl.textContent = '';
  } else {
    hintEl.textContent = 'Pro-plan feature — you can still try it, but generation is gated server-side.';
  }
}

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
  loadAiPlanHint();
})();
