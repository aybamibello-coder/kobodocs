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
  const req = f.required ? '<span class="req">*</span>' : '';
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
      return `<div class="fill-choice-list">${(f.options || []).map((o, i) => `
        <label><input type="radio" name="field_${f.id}" value="${o}" ${f.required && i === 0 ? '' : ''}> ${o}</label>
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
    default:
      return `<input type="text" ${common}>`;
  }
}

function renderForm(f) {
  card.innerHTML = `
    <div class="fill-logo">KoboDocs Form</div>
    <div class="fill-title">${f.title}</div>
    ${f.description ? `<div class="fill-desc">${f.description}</div>` : ''}
    <form id="fillForm">
      ${f.fields.map(field => `
        <div class="fill-field">
          <label for="field_${field.id}">${field.label}${field.required ? ' <span class="req">*</span>' : ''}</label>
          ${fieldHtml(field)}
        </div>
      `).join('')}
      <button type="submit" class="fill-submit" id="submitBtn">Submit</button>
      <div class="fill-error" id="fillErrorMsg"></div>
    </form>
  `;

  // Rating stars behavior
  document.querySelectorAll('.rating-stars').forEach(wrap => {
    wrap.addEventListener('click', (e) => {
      const star = e.target.closest('span[data-value]');
      if (!star) return;
      const val = parseInt(star.dataset.value, 10);
      wrap.querySelectorAll('span').forEach(s => s.classList.toggle('active', parseInt(s.dataset.value, 10) <= val));
      wrap.nextElementSibling.value = val;
    });
  });

  document.getElementById('fillForm').addEventListener('submit', (e) => onSubmit(e, f));
}

async function uploadFile(formId, file) {
  const path = `${formId}/${Math.random().toString(36).slice(2, 10)}-${file.name}`;
  const { error } = await supabase.storage.from('form-uploads').upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from('form-uploads').getPublicUrl(path);
  return path; // owner reads it back via a signed URL from their dashboard; bucket is private
}

async function onSubmit(e, formDef) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const errEl = document.getElementById('fillErrorMsg');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    const answers = {};
    for (const field of formDef.fields) {
      if (field.type === 'checkbox') {
        answers[field.id] = Array.from(document.querySelectorAll(`input[name="field_${field.id}"]:checked`)).map(el => el.value);
      } else if (field.type === 'radio') {
        const checked = document.querySelector(`input[name="field_${field.id}"]:checked`);
        answers[field.id] = checked ? checked.value : null;
      } else if (field.type === 'file') {
        const input = document.getElementById(`field_${field.id}`);
        if (input.files && input.files[0]) {
          answers[field.id] = await uploadFile(formDef.id, input.files[0]);
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
