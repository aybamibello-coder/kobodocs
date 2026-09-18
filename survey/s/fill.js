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

function applyBranding(settings) {
  if (settings.brandColor) document.documentElement.style.setProperty('--ink-green-deep', settings.brandColor);
}

function brandHeaderHtml(settings) {
  if (settings.logoUrl) return `<img src="${settings.logoUrl}" alt="" style="max-height:52px; margin-bottom:14px; display:block;">`;
  return `<div class="fill-logo">KoboDocs Survey</div>`;
}

// ---------- Simple human-check (only shown when the survey owner enables it) ----------
let captchaAnswer = null;
function captchaHtml() {
  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 8) + 2;
  captchaAnswer = a + b;
  return `
    <div class="fill-field">
      <label class="qlabel">Quick check: what is ${a} + ${b}? <span class="req">*</span></label>
      <input type="number" id="captchaInput" required>
    </div>
  `;
}

function questionHtml(q) {
  const common = `id="q_${q.id}" ${q.required ? 'required' : ''}`;

  switch (q.type) {
    case 'textarea':
      return `<textarea ${common} rows="3"></textarea>`;
    case 'email':
      return `<input type="email" ${common}>`;
    case 'multiple_choice':
      return `<div class="fill-choice-list">${(q.options || []).map(o => `
        <label><input type="radio" name="q_${q.id}" value="${o}"> ${o}</label>
      `).join('')}</div>`;
    case 'checkbox':
      return `<div class="fill-choice-list">${(q.options || []).map(o => `
        <label><input type="checkbox" name="q_${q.id}" value="${o}"> ${o}</label>
      `).join('')}</div>`;
    case 'yesno':
      return `<div class="fill-choice-list">
        <label><input type="radio" name="q_${q.id}" value="Yes"> Yes</label>
        <label><input type="radio" name="q_${q.id}" value="No"> No</label>
      </div>`;
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
    case 'matrix':
      return `<div class="matrix-grid-wrap"><table class="matrix-grid" data-q="${q.id}">
        <thead><tr><th></th>${(q.columns || []).map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>
          ${(q.rows || []).map((row, ri) => `
            <tr data-row="${row}">
              <td>${row}</td>
              ${(q.columns || []).map(col => `<td><input type="radio" name="q_${q.id}_r${ri}" value="${col}"></td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table></div>`;
    default:
      return `<input type="text" ${common}>`;
  }
}

function currentValue(q) {
  if (q.type === 'checkbox') {
    return Array.from(document.querySelectorAll(`input[name="q_${q.id}"]:checked`)).map(el => el.value);
  }
  if (q.type === 'multiple_choice' || q.type === 'likert' || q.type === 'yesno') {
    const checked = document.querySelector(`input[name="q_${q.id}"]:checked`);
    return checked ? checked.value : null;
  }
  if (q.type === 'ranking') {
    const list = document.querySelector(`.ranking-list[data-q="${q.id}"]`);
    return list ? Array.from(list.children).map(li => li.dataset.value) : null;
  }
  if (q.type === 'matrix') {
    const table = document.querySelector(`.matrix-grid[data-q="${q.id}"]`);
    if (!table) return null;
    const result = {};
    table.querySelectorAll('tbody tr').forEach(tr => {
      const checked = tr.querySelector('input:checked');
      if (checked) result[tr.dataset.row] = checked.value;
    });
    return Object.keys(result).length ? result : null;
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

// ---------- Pagination (section breaks) ----------
function buildPages(questions) {
  const pages = [{ title: null, fields: [] }];
  questions.forEach(q => {
    if (q.type === 'section') {
      pages.push({ title: q.label, fields: [] });
    } else {
      pages[pages.length - 1].fields.push(q);
    }
  });
  return pages;
}

let currentPageIdx = 0;
let totalPages = 1;

function showPage(idx, allQuestions) {
  document.querySelectorAll('.form-page').forEach((el, i) => { el.style.display = i === idx ? '' : 'none'; });
  const backBtn = document.getElementById('pageBackBtn');
  const nextBtn = document.getElementById('pageNextBtn');
  const submitBtn = document.getElementById('submitBtn');
  if (backBtn) backBtn.style.display = idx === 0 ? 'none' : 'inline-block';
  if (nextBtn) nextBtn.style.display = idx === totalPages - 1 ? 'none' : 'inline-block';
  if (submitBtn) submitBtn.style.display = idx === totalPages - 1 ? 'block' : 'none';
  const progress = document.getElementById('pageProgress');
  if (progress) progress.textContent = totalPages > 1 ? `Page ${idx + 1} of ${totalPages}` : '';
  currentPageIdx = idx;
  evaluateConditions(allQuestions);
}

function validatePage(pageQuestions, allQuestions) {
  for (const q of pageQuestions) {
    if (!isVisible(q, allQuestions) || !q.required) continue;
    if (q.type === 'matrix') {
      const val = currentValue(q);
      if (Object.keys(val || {}).length < (q.rows || []).length) return `Please answer every row of "${q.label}".`;
      continue;
    }
    const val = currentValue(q);
    if (val === null || val === '' || (Array.isArray(val) && !val.length)) return `Please answer "${q.label}".`;
  }
  return null;
}

function renderSurvey(s) {
  const submittedKey = `kobodocs_survey_submitted_${s.id}`;
  if (s.settings && s.settings.oneResponsePerDevice && localStorage.getItem(submittedKey)) {
    card.innerHTML = `
      ${brandHeaderHtml(s.settings || {})}
      <div class="fill-success">
        <h2>${(s.settings && s.settings.confirmationHeading) || 'Already submitted'}</h2>
        <p style="opacity:0.75; font-size:0.9rem;">${(s.settings && s.settings.confirmationMessage) || 'Looks like you\u2019ve already responded to this survey from this device.'}</p>
      </div>
    `;
    return;
  }

  applyBranding(s.settings || {});
  const pages = buildPages(s.questions);
  totalPages = pages.length;

  card.innerHTML = `
    ${brandHeaderHtml(s.settings || {})}
    <div class="fill-title">${s.title}</div>
    ${s.description ? `<div class="fill-desc">${s.description}</div>` : ''}
    <form id="fillForm">
      ${pages.map((page, pi) => `
        <div class="form-page" data-page="${pi}" style="${pi === 0 ? '' : 'display:none;'}">
          ${page.title ? `<h3 style="font-family:'Fraunces', serif; font-size:1.1rem; margin:${pi === 0 ? '0' : '18px'} 0 14px;">${page.title}</h3>` : ''}
          ${page.fields.map(q => `
            <div class="fill-field" id="wrap_${q.id}">
              <label class="qlabel">${q.label}${q.required ? ' <span class="req">*</span>' : ''}</label>
              ${questionHtml(q)}
            </div>
          `).join('')}
          ${pi === pages.length - 1 && s.settings && s.settings.captcha ? captchaHtml() : ''}
        </div>
      `).join('')}
      <input type="text" name="website" id="hpField" tabindex="-1" autocomplete="off" style="position:absolute; left:-9999px; width:1px; height:1px; opacity:0;">
      <div class="page-nav" style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
        <span id="pageProgress" style="font-size:0.78rem; opacity:0.55;"></span>
        <div>
          <button type="button" class="btn" id="pageBackBtn" style="display:none; margin-right:8px;">Back</button>
          <button type="button" class="btn primary" id="pageNextBtn" style="display:none;">Next</button>
        </div>
      </div>
      <button type="submit" class="fill-submit" id="submitBtn">Submit</button>
      <div class="fill-error" id="fillErrorMsg"></div>
    </form>
    ${s.settings && s.settings.logoUrl ? `<div style="text-align:center; font-size:0.72rem; opacity:0.4; margin-top:18px;">Powered by KoboDocs</div>` : ''}
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

  const errEl = document.getElementById('fillErrorMsg');
  const nextBtn = document.getElementById('pageNextBtn');
  const backBtn = document.getElementById('pageBackBtn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      errEl.style.display = 'none';
      const msg = validatePage(pages[currentPageIdx].fields, s.questions);
      if (msg) { errEl.textContent = msg; errEl.style.display = 'block'; return; }
      showPage(currentPageIdx + 1, s.questions);
      window.scrollTo({ top: card.offsetTop - 20, behavior: 'smooth' });
    });
  }
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      errEl.style.display = 'none';
      showPage(currentPageIdx - 1, s.questions);
    });
  }

  showPage(0, s.questions);
}

async function onSubmit(e, surveyDef) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const errEl = document.getElementById('fillErrorMsg');
  errEl.style.display = 'none';

  const lastPageMsg = validatePage(buildPages(surveyDef.questions)[totalPages - 1].fields, surveyDef.questions);
  if (lastPageMsg) { errEl.textContent = lastPageMsg; errEl.style.display = 'block'; return; }

  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    if (surveyDef.settings && surveyDef.settings.captcha) {
      const val = parseInt(document.getElementById('captchaInput').value, 10);
      if (val !== captchaAnswer) throw new Error('That answer doesn\u2019t look right — please try again.');
    }

    const visibleQuestions = surveyDef.questions.filter(q => q.type !== 'section' && isVisible(q, surveyDef.questions));
    const answers = {};
    for (const q of visibleQuestions) {
      if (q.type === 'checkbox') {
        answers[q.id] = Array.from(document.querySelectorAll(`input[name="q_${q.id}"]:checked`)).map(el => el.value);
      } else if (q.type === 'multiple_choice' || q.type === 'likert' || q.type === 'yesno') {
        const checked = document.querySelector(`input[name="q_${q.id}"]:checked`);
        answers[q.id] = checked ? checked.value : null;
      } else if (q.type === 'ranking') {
        const list = document.querySelector(`.ranking-list[data-q="${q.id}"]`);
        answers[q.id] = Array.from(list.children).map(li => li.dataset.value);
      } else if (q.type === 'matrix') {
        const table = document.querySelector(`.matrix-grid[data-q="${q.id}"]`);
        const result = {};
        table.querySelectorAll('tbody tr').forEach(tr => {
          const checked = tr.querySelector('input:checked');
          if (checked) result[tr.dataset.row] = checked.value;
        });
        answers[q.id] = result;
      } else if (q.type === 'rating' || q.type === 'nps') {
        const input = document.getElementById(`q_${q.id}`);
        answers[q.id] = input.value ? parseInt(input.value, 10) : null;
      } else {
        const input = document.getElementById(`q_${q.id}`);
        answers[q.id] = input.value.trim();
      }

      if (q.required && q.type === 'matrix' && Object.keys(answers[q.id] || {}).length < (q.rows || []).length) {
        throw new Error(`Please answer every row of "${q.label}".`);
      }
      if (q.required && q.type !== 'matrix' && (answers[q.id] === null || answers[q.id] === '' || (Array.isArray(answers[q.id]) && !answers[q.id].length))) {
        throw new Error(`Please answer "${q.label}".`);
      }
    }

    const honeypot = document.getElementById('hpField').value;
    const { data, error } = await supabase.rpc('submit_survey_response', { p_slug: slug, p_answers: answers, p_honeypot: honeypot });
    if (error) throw error;
    if (!data || !data.success) throw new Error((data && data.error) || 'Could not submit the survey.');

    // Fire-and-forget: never let email notification issues affect the
    // submission the respondent just successfully made.
    try {
      const emailQuestion = surveyDef.questions.find(q => q.type === 'email' && answers[q.id]);
      const fieldLabels = {};
      surveyDef.questions.forEach(q => { fieldLabels[q.id] = q.label; });
      supabase.functions.invoke('send-form-notification', {
        body: {
          product: 'survey',
          slug,
          answers,
          field_labels: fieldLabels,
          respondent_email: emailQuestion ? answers[emailQuestion.id] : null,
        },
      });
    } catch { /* non-critical */ }

    if (surveyDef.settings && surveyDef.settings.oneResponsePerDevice) {
      localStorage.setItem(`kobodocs_survey_submitted_${surveyDef.id}`, '1');
    }

    if (surveyDef.settings && surveyDef.settings.redirectUrl) {
      window.location.href = surveyDef.settings.redirectUrl;
      return;
    }

    card.innerHTML = `
      ${brandHeaderHtml(surveyDef.settings || {})}
      <div class="fill-success">
        <h2>${(surveyDef.settings && surveyDef.settings.confirmationHeading) || 'Thank you! 🎉'}</h2>
        <p style="opacity:0.75; font-size:0.9rem;">${(surveyDef.settings && surveyDef.settings.confirmationMessage) || 'Your response has been recorded.'}</p>
      </div>
    `;
  } catch (err) {
    errEl.textContent = err.message || 'Something went wrong. Please try again.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Submit';
  }
}

// ---------- Access-code gate ----------
function renderAccessGate(data) {
  applyBranding(data.settings || {});
  card.innerHTML = `
    ${brandHeaderHtml(data.settings || {})}
    <div class="fill-title">${data.title}</div>
    <div class="fill-desc">This survey is protected. Enter the access code to continue.</div>
    <div class="fill-field">
      <label for="accessCodeField">Access code</label>
      <input type="text" id="accessCodeField">
    </div>
    <button type="button" class="fill-submit" id="unlockBtn">Continue</button>
    <div class="fill-error" id="gateErrorMsg"></div>
  `;
  document.getElementById('unlockBtn').addEventListener('click', () => unlockAndRender());
  document.getElementById('accessCodeField').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') unlockAndRender();
  });
}

async function unlockAndRender() {
  const btn = document.getElementById('unlockBtn');
  const errEl = document.getElementById('gateErrorMsg');
  const code = document.getElementById('accessCodeField').value.trim();
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Checking…';

  const { data, error } = await supabase.rpc('unlock_survey', { p_slug: slug, p_code: code });
  btn.disabled = false;
  btn.textContent = 'Continue';

  if (error || !data || !data.success) {
    errEl.textContent = (data && data.error) || 'Could not verify that code — please try again.';
    errEl.style.display = 'block';
    return;
  }
  renderSurvey(data);
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

    const settings = data.settings || {};
    if (settings.closesAt && new Date() > new Date(settings.closesAt)) {
      renderError(`This survey closed to new responses on ${new Date(settings.closesAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}.`);
      return;
    }
    if (settings.responseLimit && data.response_count >= settings.responseLimit) {
      renderError('This survey has reached its maximum number of responses.');
      return;
    }

    if (data.requires_access_code) {
      renderAccessGate(data);
      return;
    }

    renderSurvey(data);
  } catch {
    renderError("Something went wrong loading this survey. Please try again in a moment.");
  }
})();
