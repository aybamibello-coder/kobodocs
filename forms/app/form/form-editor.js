let ctx = null;
let form = null;
const formId = new URLSearchParams(window.location.search).get('id');

const TYPE_LABELS = {
  text: 'Short text', textarea: 'Paragraph', number: 'Number', email: 'Email',
  phone: 'Phone', url: 'Website/URL', date: 'Date', time: 'Time', select: 'Dropdown', radio: 'Multiple choice',
  checkbox: 'Checkboxes', rating: 'Star rating', scale: 'Linear scale', emoji: 'Emoji rating',
  file: 'File upload', signature: 'Signature',
};
const OPTION_TYPES = new Set(['select', 'radio', 'checkbox']);
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

function fieldId() { return 'f_' + Math.random().toString(36).slice(2, 10); }

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function saveForm(patch) {
  const { supabase } = ctx;
  Object.assign(form, patch);
  const { error } = await supabase.from('forms').update(patch).eq('id', formId);
  if (error) toast('Could not save: ' + error.message);
}

const saveFieldsDebounced = debounce(() => saveForm({ fields: form.fields }), 600);
const saveMetaDebounced = debounce((patch) => saveForm(patch), 600);

// ---------- Build tab: fields ----------
function conditionSummary(f, allFields) {
  if (!f.showIf) return 'Always shown';
  const src = allFields.find(x => x.id === f.showIf.fieldId);
  const opLabel = (COND_OPERATORS.find(o => o.value === f.showIf.op) || {}).label || f.showIf.op;
  const srcLabel = src ? src.label : '(deleted field)';
  return f.showIf.op.includes('answered') ? `Shown if "${srcLabel}" ${opLabel}` : `Shown if "${srcLabel}" ${opLabel} "${f.showIf.value || ''}"`;
}

function renderFields() {
  const list = document.getElementById('fieldsList');
  if (!form.fields.length) {
    list.innerHTML = `<div class="empty-note">No fields yet — add your first one below.</div>`;
    return;
  }
  list.innerHTML = form.fields.map((f, i) => `
    <div class="field-row" data-id="${f.id}">
      <div class="field-row-top">
        <span class="field-type-badge">${TYPE_LABELS[f.type] || f.type}</span>
        <input class="field-label-input" data-role="label" value="${(f.label || '').replace(/"/g, '&quot;')}" placeholder="Field label">
        <label class="field-required"><input type="checkbox" data-role="required" ${f.required ? 'checked' : ''}> Required</label>
        <div class="field-actions">
          <button class="icon-btn" data-role="up" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
          <button class="icon-btn" data-role="down" ${i === form.fields.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
          <button class="icon-btn" data-role="delete" title="Delete">✕</button>
        </div>
      </div>
      ${OPTION_TYPES.has(f.type) ? `
        <div class="field-options">
          ${(f.options || []).map((opt, oi) => `
            <div class="option-row" data-idx="${oi}">
              <input type="text" data-role="option-value" value="${(opt || '').replace(/"/g, '&quot;')}" placeholder="Option ${oi + 1}">
              <button type="button" class="icon-btn" data-role="option-delete" title="Remove option">✕</button>
            </div>
          `).join('')}
          <button type="button" class="btn" data-role="option-add">+ Add option</button>
        </div>
      ` : ''}
      ${f.type === 'signature' ? `<div class="field-options-hint">Respondent draws a signature on a canvas; stored as an image.</div>` : ''}
      ${i > 0 ? `
        <div class="field-condition">
          <button type="button" class="cond-toggle-link" data-role="cond-toggle">${conditionSummary(f, form.fields)} — edit</button>
          <div class="field-condition-row" data-role="cond-editor" style="display:none; margin-top:8px;">
            <select data-role="cond-field">
              <option value="">Always show</option>
              ${form.fields.slice(0, i).map(other => `<option value="${other.id}" ${f.showIf && f.showIf.fieldId === other.id ? 'selected' : ''}>${other.label}</option>`).join('')}
            </select>
            <select data-role="cond-op">
              ${COND_OPERATORS.map(o => `<option value="${o.value}" ${f.showIf && f.showIf.op === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
            <input type="text" data-role="cond-value" placeholder="value" value="${f.showIf && f.showIf.value ? f.showIf.value.replace(/"/g, '&quot;') : ''}" ${f.showIf && f.showIf.op && f.showIf.op.includes('answered') ? 'style="display:none;"' : ''}>
          </div>
        </div>
      ` : ''}
    </div>
  `).join('');
}

document.getElementById('fieldsList').addEventListener('input', (e) => {
  const row = e.target.closest('.field-row');
  if (!row) return;
  const field = form.fields.find(f => f.id === row.dataset.id);
  if (!field) return;
  if (e.target.dataset.role === 'label') field.label = e.target.value;
  if (e.target.dataset.role === 'option-value') {
    const idx = parseInt(e.target.closest('.option-row').dataset.idx, 10);
    field.options[idx] = e.target.value;
  }
  if (e.target.dataset.role === 'cond-value') {
    field.showIf = field.showIf || {};
    field.showIf.value = e.target.value;
  }
  saveFieldsDebounced();
});

document.getElementById('fieldsList').addEventListener('change', (e) => {
  const row = e.target.closest('.field-row');
  if (!row) return;
  const field = form.fields.find(f => f.id === row.dataset.id);
  if (!field) return;

  if (e.target.dataset.role === 'required') field.required = e.target.checked;

  if (e.target.dataset.role === 'cond-field') {
    if (!e.target.value) {
      field.showIf = null;
    } else {
      field.showIf = { fieldId: e.target.value, op: (field.showIf && field.showIf.op) || 'equals', value: (field.showIf && field.showIf.value) || '' };
    }
    renderFields();
  }
  if (e.target.dataset.role === 'cond-op') {
    field.showIf = field.showIf || { fieldId: '', value: '' };
    field.showIf.op = e.target.value;
    renderFields();
  }
  saveFieldsDebounced();
});

document.getElementById('fieldsList').addEventListener('click', (e) => {
  const toggleBtn = e.target.closest('button[data-role="cond-toggle"]');
  if (toggleBtn) {
    const editor = toggleBtn.parentElement.querySelector('[data-role="cond-editor"]');
    editor.style.display = editor.style.display === 'none' ? 'flex' : 'none';
    return;
  }

  const btn = e.target.closest('button[data-role]');
  if (!btn) return;
  const row = btn.closest('.field-row');
  const idx = form.fields.findIndex(f => f.id === row.dataset.id);
  if (idx === -1) return;

  if (btn.dataset.role === 'option-add') {
    form.fields[idx].options = form.fields[idx].options || [];
    form.fields[idx].options.push(`Option ${form.fields[idx].options.length + 1}`);
  } else if (btn.dataset.role === 'option-delete') {
    const optIdx = parseInt(btn.closest('.option-row').dataset.idx, 10);
    form.fields[idx].options.splice(optIdx, 1);
  } else if (btn.dataset.role === 'delete') {
    form.fields.splice(idx, 1);
  } else if (btn.dataset.role === 'up' && idx > 0) {
    [form.fields[idx - 1], form.fields[idx]] = [form.fields[idx], form.fields[idx - 1]];
  } else if (btn.dataset.role === 'down' && idx < form.fields.length - 1) {
    [form.fields[idx + 1], form.fields[idx]] = [form.fields[idx], form.fields[idx + 1]];
  }
  renderFields();
  saveFieldsDebounced();
});

document.getElementById('addFieldBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('addFieldMenu').classList.toggle('show');
});
document.addEventListener('click', () => document.getElementById('addFieldMenu').classList.remove('show'));

document.getElementById('addFieldMenu').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  const type = btn.dataset.type;
  const field = { id: fieldId(), type, label: TYPE_LABELS[type], required: false };
  if (OPTION_TYPES.has(type)) field.options = ['Option 1', 'Option 2'];
  form.fields.push(field);
  renderFields();
  saveFieldsDebounced();
});

document.getElementById('formTitleInput').addEventListener('input', (e) => saveMetaDebounced({ title: e.target.value }));
document.getElementById('formDescInput').addEventListener('input', (e) => saveMetaDebounced({ description: e.target.value || null }));

// ---------- Tabs ----------
document.querySelector('.fb-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  document.querySelectorAll('.fb-tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.fb-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  if (btn.dataset.tab === 'responses') loadResponses();
  if (btn.dataset.tab === 'settings') renderSettings();
});

// ---------- Settings tab ----------
function renderSettings() {
  const s = form.settings || {};
  document.getElementById('responseLimitInput').value = s.responseLimit || '';
  document.getElementById('closesAtInput').value = s.closesAt ? s.closesAt.slice(0, 16) : '';
  document.getElementById('oneResponsePerDeviceInput').checked = !!s.oneResponsePerDevice;
  document.getElementById('captchaInput').checked = !!s.captcha;
  document.getElementById('confirmationHeadingInput').value = s.confirmationHeading || '';
  document.getElementById('confirmationMessageInput').value = s.confirmationMessage || '';
  document.getElementById('redirectUrlInput').value = s.redirectUrl || '';
}

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  const limitVal = document.getElementById('responseLimitInput').value;
  const closesVal = document.getElementById('closesAtInput').value;
  const settings = {
    responseLimit: limitVal ? parseInt(limitVal, 10) : null,
    closesAt: closesVal ? new Date(closesVal).toISOString() : null,
    oneResponsePerDevice: document.getElementById('oneResponsePerDeviceInput').checked,
    captcha: document.getElementById('captchaInput').checked,
    confirmationHeading: document.getElementById('confirmationHeadingInput').value.trim() || null,
    confirmationMessage: document.getElementById('confirmationMessageInput').value.trim() || null,
    redirectUrl: document.getElementById('redirectUrlInput').value.trim() || null,
  };
  await saveForm({ settings });
  toast('Settings saved.');
});

// ---------- Share tab ----------
function renderShare() {
  document.querySelectorAll('#statusToggle button').forEach(b => b.classList.toggle('active', b.dataset.status === form.status));
  const url = `${window.location.origin}/forms/f/?s=${form.slug}`;
  document.getElementById('shareUrlInput').value = url;
  document.getElementById('waShareBtn').href = `https://wa.me/?text=${encodeURIComponent(form.title + ' — ' + url)}`;
  document.getElementById('embedCodeInput').value = `<iframe src="${url}" width="100%" height="640" frameborder="0" style="max-width:560px; border:1px solid #ddd; border-radius:8px;"></iframe>`;
}

document.getElementById('statusToggle').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-status]');
  if (!btn) return;
  await saveForm({ status: btn.dataset.status });
  renderShare();
  toast('Form is now ' + btn.dataset.status + '.');
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
    new window.QRCode(document.getElementById('qrCanvas'), {
      text: document.getElementById('shareUrlInput').value,
      width: 200, height: 200,
    });
    wrap.dataset.rendered = '1';
  }
});

document.getElementById('downloadQrBtn').addEventListener('click', () => {
  const img = document.querySelector('#qrCanvas img') || document.querySelector('#qrCanvas canvas');
  if (!img) return;
  const a = document.createElement('a');
  a.download = `${form.slug}-qr.png`;
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

// ---------- Responses tab ----------
let lastResponses = [];

function renderStats() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 6);
  const today = lastResponses.filter(r => new Date(r.submitted_at) >= startOfToday).length;
  const week = lastResponses.filter(r => new Date(r.submitted_at) >= startOfWeek).length;
  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card"><div class="num">${lastResponses.length}</div><div class="lbl">Total</div></div>
    <div class="stat-card"><div class="num">${today}</div><div class="lbl">Today</div></div>
    <div class="stat-card"><div class="num">${week}</div><div class="lbl">Last 7 days</div></div>
  `;
}

async function loadResponses() {
  const { supabase } = ctx;
  const wrap = document.getElementById('responsesTableWrap');
  wrap.innerHTML = `<div class="empty-note">Loading…</div>`;
  const { data, error } = await supabase
    .from('form_responses')
    .select('id, answers, submitted_at')
    .eq('form_id', formId)
    .order('submitted_at', { ascending: false });

  if (error) {
    wrap.innerHTML = `<div class="empty-note">Could not load responses: ${error.message}</div>`;
    return;
  }
  lastResponses = data || [];
  document.getElementById('responseCount').textContent = `${lastResponses.length} response${lastResponses.length === 1 ? '' : 's'}`;
  renderStats();

  if (!lastResponses.length) {
    wrap.innerHTML = `<div class="empty-note">No responses yet.</div>`;
    return;
  }

  const cols = form.fields;
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
            ${cols.map(c => `<td>${formatAnswer(r.answers[c.id], c)}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function formatAnswer(val, field) {
  if (val === undefined || val === null || val === '') return '';
  if (Array.isArray(val)) return val.join(', ');
  if (field.type === 'file' && typeof val === 'string') {
    return `<a href="${val}" target="_blank" rel="noopener">file</a>`;
  }
  return String(val);
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (!lastResponses.length) { toast('No responses to export yet.'); return; }
  const cols = form.fields;
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
  a.download = `${form.slug}-responses.csv`;
  a.click();
});

document.getElementById('exportJsonBtn').addEventListener('click', () => {
  if (!lastResponses.length) { toast('No responses to export yet.'); return; }
  const cols = form.fields;
  const rows = lastResponses.map(r => {
    const obj = { submitted_at: r.submitted_at };
    cols.forEach(c => { obj[c.label] = r.answers[c.id] ?? null; });
    return obj;
  });
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${form.slug}-responses.json`;
  a.click();
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
  if (!description) { errEl.textContent = 'Describe the form you want first.'; errEl.style.display = 'block'; return; }

  btn.disabled = true;
  btn.textContent = 'Generating…';

  const { data, error } = await supabase.functions.invoke('generate-schema', { body: { product: 'form', description } });

  btn.disabled = false;
  btn.textContent = 'Generate';

  if (error || !data || !data.success) {
    errEl.textContent = (data && data.error) || (error && error.message) || 'Could not generate a form from that description.';
    errEl.style.display = 'block';
    return;
  }

  if (!form.title || form.title === 'Untitled form') {
    document.getElementById('formTitleInput').value = data.title;
    form.title = data.title;
  }
  if (!form.description && data.description) {
    document.getElementById('formDescInput').value = data.description;
    form.description = data.description;
  }
  form.fields.push(...data.items);
  renderFields();
  saveForm({ title: form.title, description: form.description, fields: form.fields });
  document.getElementById('aiGenerateBox').style.display = 'none';
  document.getElementById('aiPromptInput').value = '';
  toast('Added ' + data.items.length + ' field(s) from AI. Review before publishing.');
});

async function loadAiPlanHint() {
  const { supabase, session } = ctx;
  const { data } = await supabase.rpc('get_form_plan_limits', { p_user_id: session.user.id });
  const row = Array.isArray(data) ? data[0] : data;
  const hintEl = document.getElementById('aiPlanHint');
  if (row && ['pro', 'business'].includes(row.plan_key)) {
    hintEl.textContent = '';
  } else {
    hintEl.textContent = 'Pro-plan feature — you can still try it, but generation is gated server-side.';
  }
}

// ---------- Init ----------
(async () => {
  ctx = await window.FormsGuard.requireAccess();
  if (!ctx) return;
  if (!formId) { window.location.href = '/forms/app/'; return; }

  const { supabase } = ctx;
  const { data, error } = await supabase.from('forms').select('*').eq('id', formId).single();
  if (error || !data) {
    toast('Form not found.');
    setTimeout(() => window.location.href = '/forms/app/', 1200);
    return;
  }
  form = data;
  document.getElementById('formTitleInput').value = form.title || '';
  document.getElementById('formDescInput').value = form.description || '';
  renderFields();
  renderShare();
  renderSettings();
  loadAiPlanHint();
})();
