import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://vwmzulzluaxedkozxjfy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4HDVb8ZzRh1W-Z97m2uT1Q_4FwH6bTt';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const slug = new URLSearchParams(window.location.search).get('s');
const card = document.getElementById('fillCard');

function renderError(message) {
  card.innerHTML = `<div class="fill-logo">KoboDocs Form</div><div class="fill-error" style="display:block;">${message}</div>`;
}

function fieldHtml(f) {
  const common = `id="field_${f.id}" ${f.required ? 'required' : ''}`;

  switch (f.type) {
    case 'textarea':
      return `<textarea ${common} rows="3"></textarea>`;
    case 'number':
      return `<input type="number" ${common}>`;
    case 'email':
      return `<input type="email" ${common}>`;
    case 'phone':
      return `<input type="tel" ${common}>`;
    case 'date':
      return `<input type="date" ${common}>`;
    case 'select':
      return `<select ${common}><option value="">Choose…</option>${(f.options || []).map(o => `<option value="${o}">${o}</option>`).join('')}</select>`;
    case 'radio':
      return `<div class="fill-choice-list">${(f.options || []).map(o => `
        <label><input type="radio" name="field_${f.id}" value="${o}"> ${o}</label>
      `).join('')}</div>`;
    case 'checkbox':
      return `<div class="fill-choice-list">${(f.options || []).map(o => `
        <label><input type="checkbox" name="field_${f.id}" value="${o}"> ${o}</label>
      `).join('')}</div>`;
    case 'rating':
      return `<div class="rating-stars" data-field="${f.id}">${[1, 2, 3, 4, 5].map(n => `<span data-value="${n}">★</span>`).join('')}</div>
              <input type="hidden" ${common}>`;
    case 'file':
      return `<input type="file" ${common}>`;
    case 'signature':
      return `<canvas class="sig-pad" id="field_${f.id}" width="480" height="140"></canvas>
              <button type="button" class="btn sig-clear" data-field="${f.id}" style="margin-top:6px;">Clear</button>`;
    default:
      return `<input type="text" ${common}>`;
  }
}

function setupSignaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  ctx.strokeStyle = '#0D2620';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  let drawing = false;
  let hasDrawn = false;

  function pos(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  function start(e) { drawing = true; hasDrawn = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(e) { if (!drawing) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }
  function end() { drawing = false; }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start);
  canvas.addEventListener('touchmove', move);
  canvas.addEventListener('touchend', end);

  return {
    clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); hasDrawn = false; },
    hasSignature() { return hasDrawn; },
    toBlob() { return new Promise(resolve => canvas.toBlob(resolve, 'image/png')); },
  };
}

// ---------- Conditional logic ----------
const sigPads = {};

function currentValue(field) {
  if (field.type === 'checkbox') {
    return Array.from(document.querySelectorAll(`input[name="field_${field.id}"]:checked`)).map(el => el.value);
  }
  if (field.type === 'radio') {
    const checked = document.querySelector(`input[name="field_${field.id}"]:checked`);
    return checked ? checked.value : null;
  }
  if (field.type === 'signature') {
    return sigPads[field.id] && sigPads[field.id].hasSignature() ? 'signed' : null;
  }
  if (field.type === 'rating') {
    const input = document.getElementById(`field_${field.id}`);
    return input && input.value ? input.value : null;
  }
  const input = document.getElementById(`field_${field.id}`);
  return input ? input.value : null;
}

function isVisible(field, allFields) {
  if (!field.showIf || !field.showIf.fieldId) return true;
  const source = allFields.find(f => f.id === field.showIf.fieldId);
  if (!source) return true;
  const val = currentValue(source);
  const isEmpty = val === null || val === '' || (Array.isArray(val) && !val.length);
  switch (field.showIf.op) {
    case 'answered': return !isEmpty;
    case 'not_answered': return isEmpty;
    case 'not_equals': return String(val ?? '') !== String(field.showIf.value ?? '');
    case 'equals':
    default: return String(val ?? '') === String(field.showIf.value ?? '');
  }
}

function evaluateConditions(allFields) {
  allFields.forEach(f => {
    const wrap = document.getElementById(`wrap_${f.id}`);
    if (!wrap) return;
    wrap.style.display = isVisible(f, allFields) ? '' : 'none';
  });
}

function renderForm(f) {
  card.innerHTML = `
    <div class="fill-logo">KoboDocs Form</div>
    <div class="fill-title">${f.title}</div>
    ${f.description ? `<div class="fill-desc">${f.description}</div>` : ''}
    <form id="fillForm">
      ${f.fields.map(field => `
        <div class="fill-field" id="wrap_${field.id}">
          <label for="field_${field.id}">${field.label}${field.required ? ' <span class="req">*</span>' : ''}</label>
          ${fieldHtml(field)}
        </div>
      `).join('')}
      <button type="submit" class="fill-submit" id="submitBtn">Submit</button>
      <div class="fill-error" id="fillErrorMsg"></div>
    </form>
  `;

  document.querySelectorAll('.sig-pad').forEach(canvas => {
    sigPads[canvas.id.replace('field_', '')] = setupSignaturePad(canvas);
  });
  document.querySelectorAll('.sig-clear').forEach(btn => {
    btn.addEventListener('click', () => sigPads[btn.dataset.field] && sigPads[btn.dataset.field].clear());
  });

  // Rating stars behavior
  document.querySelectorAll('.rating-stars').forEach(wrap => {
    wrap.addEventListener('click', (e) => {
      const star = e.target.closest('span[data-value]');
      if (!star) return;
      const val = parseInt(star.dataset.value, 10);
      wrap.querySelectorAll('span').forEach(s => s.classList.toggle('active', parseInt(s.dataset.value, 10) <= val));
      wrap.nextElementSibling.value = val;
      evaluateConditions(f.fields);
    });
  });

  const formEl = document.getElementById('fillForm');
  formEl.addEventListener('input', () => evaluateConditions(f.fields));
  formEl.addEventListener('change', () => evaluateConditions(f.fields));
  formEl.addEventListener('submit', (e) => onSubmit(e, f));

  evaluateConditions(f.fields);
}

async function uploadBlob(formId, blob, filename) {
  const path = `${formId}/${Math.random().toString(36).slice(2, 10)}-${filename}`;
  const { error } = await supabase.storage.from('form-uploads').upload(path, blob);
  if (error) throw error;
  return path; // owner reads it back from their dashboard; bucket is private
}

async function onSubmit(e, formDef) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const errEl = document.getElementById('fillErrorMsg');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    const visibleFields = formDef.fields.filter(field => isVisible(field, formDef.fields));
    const answers = {};
    for (const field of visibleFields) {
      if (field.type === 'checkbox') {
        answers[field.id] = Array.from(document.querySelectorAll(`input[name="field_${field.id}"]:checked`)).map(el => el.value);
      } else if (field.type === 'radio') {
        const checked = document.querySelector(`input[name="field_${field.id}"]:checked`);
        answers[field.id] = checked ? checked.value : null;
      } else if (field.type === 'file') {
        const input = document.getElementById(`field_${field.id}`);
        if (input.files && input.files[0]) {
          answers[field.id] = await uploadBlob(formDef.id, input.files[0], input.files[0].name);
        } else {
          answers[field.id] = null;
        }
      } else if (field.type === 'signature') {
        const pad = sigPads[field.id];
        if (pad && pad.hasSignature()) {
          const blob = await pad.toBlob();
          answers[field.id] = await uploadBlob(formDef.id, blob, 'signature.png');
        } else {
          answers[field.id] = null;
        }
      } else if (field.type === 'rating') {
        const input = document.getElementById(`field_${field.id}`);
        answers[field.id] = input.value ? parseInt(input.value, 10) : null;
      } else {
        const input = document.getElementById(`field_${field.id}`);
        answers[field.id] = input.value.trim();
      }

      if (field.required && (answers[field.id] === null || answers[field.id] === '' || (Array.isArray(answers[field.id]) && !answers[field.id].length))) {
        throw new Error(`Please fill in "${field.label}".`);
      }
    }

    const { data, error } = await supabase.rpc('submit_form_response', { p_slug: slug, p_answers: answers });
    if (error) throw error;
    if (!data || !data.success) throw new Error(data?.error || 'Could not submit the form.');

    card.innerHTML = `
      <div class="fill-logo">KoboDocs Form</div>
      <div class="fill-success">
        <h2>Thank you! 🎉</h2>
        <p style="opacity:0.75; font-size:0.9rem;">Your response has been recorded.</p>
      </div>
    `;
  } catch (err) {
    errEl.textContent = err.message || 'Something went wrong. Please try again.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Submit';
  }
}

(async () => {
  if (!slug) {
    renderError("This form link looks incomplete. Please check the link and try again.");
    return;
  }
  try {
    const { data, error } = await supabase.rpc('get_public_form', { p_slug: slug });
    if (error || !data) {
      renderError("We couldn't find this form. It may have been unpublished or the link may be incorrect.");
      return;
    }
    renderForm(data);
  } catch {
    renderError("Something went wrong loading this form. Please try again in a moment.");
  }
})();
