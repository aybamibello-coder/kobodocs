import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://vwmzulzluaxedkozxjfy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4HDVb8ZzRh1W-Z97m2uT1Q_4FwH6bTt';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const LIKERT_LABELS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

const slug = new URLSearchParams(window.location.search).get('s');
const card = document.getElementById('fillCard');

function renderError(message) {
  card.innerHTML = `<div class="fill-logo">KoboDocs Survey</div><div class="fill-error" style="display:block;">${message}</div>`;
}

function questionHtml(q) {
  const common = `id="q_${q.id}" ${q.required ? 'required' : ''}`;

  switch (q.type) {
    case 'textarea':
      return `<textarea ${common} rows="3"></textarea>`;
    case 'multiple_choice':
      return `<div class="fill-choice-list">${(q.options || []).map(o => `
        <label><input type="radio" name="q_${q.id}" value="${o}"> ${o}</label>
      `).join('')}</div>`;
    case 'checkbox':
      return `<div class="fill-choice-list">${(q.options || []).map(o => `
        <label><input type="checkbox" name="q_${q.id}" value="${o}"> ${o}</label>
      `).join('')}</div>`;
    case 'rating':
      return `<div class="rating-stars" data-q="${q.id}">${[1, 2, 3, 4, 5].map(n => `<span data-value="${n}">★</span>`).join('')}</div>
              <input type="hidden" ${common}>`;
    case 'nps':
      return `<div class="nps-scale" data-q="${q.id}">${Array.from({ length: 11 }, (_, n) => `<button type="button" data-value="${n}">${n}</button>`).join('')}</div>
              <div class="nps-hint"><span>Not likely</span><span>Very likely</span></div>
              <input type="hidden" ${common}>`;
    case 'likert':
      return `<div class="likert-row">${LIKERT_LABELS.map((label, i) => `
        <label class="likert-opt"><input type="radio" name="q_${q.id}" value="${i + 1}">${label}</label>
      `).join('')}</div>`;
    case 'ranking':
      return `<ul class="ranking-list" data-q="${q.id}">${(q.options || []).map((o, i) => `
        <li data-value="${o}"><span>${i + 1}. ${o}</span>
          <span class="rank-btns"><button type="button" data-dir="up">↑</button><button type="button" data-dir="down">↓</button></span>
        </li>
      `).join('')}</ul>
              <input type="hidden" id="q_${q.id}">`;
    default:
      return `<input type="text" ${common}>`;
  }
}

function currentValue(q) {
  if (q.type === 'checkbox') {
    return Array.from(document.querySelectorAll(`input[name="q_${q.id}"]:checked`)).map(el => el.value);
  }
  if (q.type === 'multiple_choice' || q.type === 'likert') {
    const checked = document.querySelector(`input[name="q_${q.id}"]:checked`);
    return checked ? checked.value : null;
  }
  if (q.type === 'ranking') {
    const list = document.querySelector(`.ranking-list[data-q="${q.id}"]`);
    return list ? Array.from(list.children).map(li => li.dataset.value) : null;
  }
  const input = document.getElementById(`q_${q.id}`);
  return input ? input.value : null;
}

function isVisible(q, allQuestions) {
  if (!q.showIf || !q.showIf.fieldId) return true;
  const source = allQuestions.find(x => x.id === q.showIf.fieldId);
  if (!source) return true;
  const val = currentValue(source);
  const isEmpty = val === null || val === '' || (Array.isArray(val) && !val.length);
  switch (q.showIf.op) {
    case 'answered': return !isEmpty;
    case 'not_answered': return isEmpty;
    case 'not_equals': return String(val ?? '') !== String(q.showIf.value ?? '');
    case 'equals':
    default: return String(val ?? '') === String(q.showIf.value ?? '');
  }
}

function evaluateConditions(allQuestions) {
  allQuestions.forEach(q => {
    const wrap = document.getElementById(`wrap_${q.id}`);
    if (!wrap) return;
    wrap.style.display = isVisible(q, allQuestions) ? '' : 'none';
  });
}

function renderSurvey(s) {
  card.innerHTML = `
    <div class="fill-logo">KoboDocs Survey</div>
    <div class="fill-title">${s.title}</div>
    ${s.description ? `<div class="fill-desc">${s.description}</div>` : ''}
    <form id="fillForm">
      ${s.questions.map(q => `
        <div class="fill-field" id="wrap_${q.id}">
          <label class="qlabel">${q.label}${q.required ? ' <span class="req">*</span>' : ''}</label>
          ${questionHtml(q)}
        </div>
      `).join('')}
      <button type="submit" class="fill-submit" id="submitBtn">Submit</button>
      <div class="fill-error" id="fillErrorMsg"></div>
    </form>
  `;

  document.querySelectorAll('.rating-stars').forEach(wrap => {
    wrap.addEventListener('click', (e) => {
      const star = e.target.closest('span[data-value]');
      if (!star) return;
      const val = parseInt(star.dataset.value, 10);
      wrap.querySelectorAll('span').forEach(sp => sp.classList.toggle('active', parseInt(sp.dataset.value, 10) <= val));
      wrap.nextElementSibling.value = val;
      evaluateConditions(s.questions);
    });
  });

  document.querySelectorAll('.nps-scale').forEach(wrap => {
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-value]');
      if (!btn) return;
      wrap.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
      wrap.nextElementSibling.nextElementSibling.value = btn.dataset.value;
      evaluateConditions(s.questions);
    });
  });

  document.querySelectorAll('.ranking-list').forEach(list => {
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-dir]');
      if (!btn) return;
      const li = btn.closest('li');
      if (btn.dataset.dir === 'up' && li.previousElementSibling) {
        list.insertBefore(li, li.previousElementSibling);
      } else if (btn.dataset.dir === 'down' && li.nextElementSibling) {
        list.insertBefore(li.nextElementSibling, li);
      }
      Array.from(list.children).forEach((el, i) => { el.querySelector('span').textContent = `${i + 1}. ${el.dataset.value}`; });
      evaluateConditions(s.questions);
    });
  });

  const formEl = document.getElementById('fillForm');
  formEl.addEventListener('input', () => evaluateConditions(s.questions));
  formEl.addEventListener('change', () => evaluateConditions(s.questions));
  formEl.addEventListener('submit', (e) => onSubmit(e, s));

  evaluateConditions(s.questions);
}

async function onSubmit(e, surveyDef) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const errEl = document.getElementById('fillErrorMsg');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    const visibleQuestions = surveyDef.questions.filter(q => isVisible(q, surveyDef.questions));
    const answers = {};
    for (const q of visibleQuestions) {
      if (q.type === 'checkbox') {
        answers[q.id] = Array.from(document.querySelectorAll(`input[name="q_${q.id}"]:checked`)).map(el => el.value);
      } else if (q.type === 'multiple_choice' || q.type === 'likert') {
        const checked = document.querySelector(`input[name="q_${q.id}"]:checked`);
        answers[q.id] = checked ? checked.value : null;
      } else if (q.type === 'ranking') {
        const list = document.querySelector(`.ranking-list[data-q="${q.id}"]`);
        answers[q.id] = Array.from(list.children).map(li => li.dataset.value);
      } else if (q.type === 'rating' || q.type === 'nps') {
        const input = document.getElementById(`q_${q.id}`);
        answers[q.id] = input.value ? parseInt(input.value, 10) : null;
      } else {
        const input = document.getElementById(`q_${q.id}`);
        answers[q.id] = input.value.trim();
      }

      if (q.required && (answers[q.id] === null || answers[q.id] === '' || (Array.isArray(answers[q.id]) && !answers[q.id].length))) {
        throw new Error(`Please answer "${q.label}".`);
      }
    }

    const { data, error } = await supabase.rpc('submit_survey_response', { p_slug: slug, p_answers: answers });
    if (error) throw error;
    if (!data || !data.success) throw new Error(data?.error || 'Could not submit the survey.');

    card.innerHTML = `
      <div class="fill-logo">KoboDocs Survey</div>
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
    renderError("This survey link looks incomplete. Please check the link and try again.");
    return;
  }
  try {
    const { data, error } = await supabase.rpc('get_public_survey', { p_slug: slug });
    if (error || !data) {
      renderError("We couldn't find this survey. It may have been unpublished or the link may be incorrect.");
      return;
    }
    renderSurvey(data);
  } catch {
    renderError("Something went wrong loading this survey. Please try again in a moment.");
  }
})();
