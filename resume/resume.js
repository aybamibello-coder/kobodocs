// ---------- KoboDocs Resume: builder logic ----------
let currentTemplate = 'classic';
let expCount = 0, eduCount = 0;
let creditBalance = 0;
let isProOrBusiness = false;
let selectedQty = 1;

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Experience entries ----------
function addExpEntry(data = {}) {
  const idx = expCount++;
  const div = document.createElement('div');
  div.className = 'entry-card';
  div.dataset.idx = idx;
  div.innerHTML = `
    <button type="button" class="entry-remove">Remove</button>
    <div class="field-row">
      <div class="field-group"><label>Job title</label><input class="exp-title" value="${escapeHtml(data.title)}"></div>
      <div class="field-group"><label>Company</label><input class="exp-company" value="${escapeHtml(data.company)}"></div>
    </div>
    <div class="field-row">
      <div class="field-group"><label>Location</label><input class="exp-location" value="${escapeHtml(data.location)}"></div>
      <div class="field-group"><label>Start (e.g. Jan 2023)</label><input class="exp-start" value="${escapeHtml(data.start)}"></div>
      <div class="field-group"><label>End</label><input class="exp-end" value="${escapeHtml(data.end)}" ${data.current ? 'disabled' : ''}></div>
    </div>
    <div class="field-group toggle-row">
      <input type="checkbox" class="exp-current" ${data.current ? 'checked' : ''}>
      <label style="margin:0;">Currently working here</label>
    </div>
    <div class="field-group">
      <label>Key achievements (one per line)</label>
      <textarea class="exp-bullets" rows="3">${escapeHtml((data.bullets || []).join('\n'))}</textarea>
    </div>
  `;
  document.getElementById('expContainer').appendChild(div);
  wireEntry(div);
}

function addEduEntry(data = {}) {
  const idx = eduCount++;
  const div = document.createElement('div');
  div.className = 'entry-card';
  div.dataset.idx = idx;
  div.innerHTML = `
    <button type="button" class="entry-remove">Remove</button>
    <div class="field-row">
      <div class="field-group"><label>School</label><input class="edu-school" value="${escapeHtml(data.school)}"></div>
      <div class="field-group"><label>Degree</label><input class="edu-degree" value="${escapeHtml(data.degree)}" placeholder="B.Sc."></div>
    </div>
    <div class="field-row">
      <div class="field-group"><label>Field of study</label><input class="edu-field" value="${escapeHtml(data.field)}"></div>
      <div class="field-group"><label>Start</label><input class="edu-start" value="${escapeHtml(data.start)}"></div>
      <div class="field-group"><label>End</label><input class="edu-end" value="${escapeHtml(data.end)}"></div>
    </div>
  `;
  document.getElementById('eduContainer').appendChild(div);
  wireEntry(div);
}

function wireEntry(div) {
  div.querySelector('.entry-remove').addEventListener('click', () => { div.remove(); renderPreview(); });
  div.querySelectorAll('input, textarea').forEach(el => {
    el.addEventListener('input', renderPreview);
    el.addEventListener('change', renderPreview);
  });
  const currentCb = div.querySelector('.exp-current');
  if (currentCb) {
    currentCb.addEventListener('change', () => {
      const endInput = div.querySelector('.exp-end');
      endInput.disabled = currentCb.checked;
      if (currentCb.checked) endInput.value = '';
      renderPreview();
    });
  }
}

// ---------- Collect state ----------
function collectExperience() {
  return [...document.querySelectorAll('#expContainer .entry-card')].map(div => ({
    title: div.querySelector('.exp-title').value,
    company: div.querySelector('.exp-company').value,
    location: div.querySelector('.exp-location').value,
    start: div.querySelector('.exp-start').value,
    end: div.querySelector('.exp-end').value,
    current: div.querySelector('.exp-current').checked,
    bullets: div.querySelector('.exp-bullets').value.split('\n').map(s => s.trim()).filter(Boolean)
  }));
}

function collectEducation() {
  return [...document.querySelectorAll('#eduContainer .entry-card')].map(div => ({
    school: div.querySelector('.edu-school').value,
    degree: div.querySelector('.edu-degree').value,
    field: div.querySelector('.edu-field').value,
    start: div.querySelector('.edu-start').value,
    end: div.querySelector('.edu-end').value
  }));
}

function collectCertifications() {
  return document.getElementById('certifications').value.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
    const parts = line.split(',').map(p => p.trim());
    return { name: parts[0] || '', issuer: parts[1] || '', year: parts[2] || '' };
  });
}

function collectState() {
  return {
    fullName: document.getElementById('fullName').value,
    jobTitle: document.getElementById('jobTitle').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
    location: document.getElementById('location').value,
    linkedin: document.getElementById('linkedin').value,
    portfolio: document.getElementById('portfolio').value,
    summary: document.getElementById('summary').value,
    skills: document.getElementById('skills').value.split(',').map(s => s.trim()).filter(Boolean),
    certifications: collectCertifications(),
    languages: document.getElementById('languages').value.split(',').map(s => s.trim()).filter(Boolean),
    experience: collectExperience(),
    education: collectEducation(),
    template: currentTemplate
  };
}

function dateRange(item) {
  const start = item.start || '';
  const end = item.current ? 'Present' : (item.end || '');
  if (!start && !end) return '';
  return [start, end].filter(Boolean).join(' – ');
}

// ---------- Live HTML preview ----------
function renderPreview() {
  const d = collectState();
  if (window.KoboStorage) KoboStorage.save('resume', d);

  const contactBits = [d.email, d.phone, d.location, d.linkedin, d.portfolio].filter(Boolean).join(' · ');

  const expHtml = d.experience.map(job => `
    <div class="cv-exp-item">
      <div class="cv-exp-title-row"><span>${escapeHtml(job.title)}</span><span>${escapeHtml(dateRange(job))}</span></div>
      <div class="cv-exp-sub">${escapeHtml([job.company, job.location].filter(Boolean).join(' · '))}</div>
      ${job.bullets.length ? `<ul>${job.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
    </div>`).join('');

  const eduHtml = d.education.map(ed => `
    <div class="cv-exp-item">
      <div class="cv-exp-title-row"><span>${escapeHtml([ed.degree, ed.field].filter(Boolean).join(', ') || ed.school)}</span><span>${escapeHtml(dateRange(ed))}</span></div>
      ${ed.school && (ed.degree || ed.field) ? `<div class="cv-exp-sub">${escapeHtml(ed.school)}</div>` : ''}
    </div>`).join('');

  const certHtml = d.certifications.map(c => `<div>${escapeHtml([c.name, c.issuer, c.year ? `(${c.year})` : ''].filter(Boolean).join(' — '))}</div>`).join('');

  const container = document.getElementById('cvPreview');

  if (d.template === 'modern') {
    container.className = 'cv-preview modern';
    container.innerHTML = `
      <div class="cv-side">
        <h2 class="cv-name">${escapeHtml(d.fullName || 'Your Name')}</h2>
        <div class="cv-title">${escapeHtml(d.jobTitle)}</div>
        ${contactBits ? `<div class="cv-section-h">Contact</div><div style="font-size:0.65rem;">${escapeHtml(d.email)}<br>${escapeHtml(d.phone)}<br>${escapeHtml(d.location)}</div>` : ''}
        ${d.skills.length ? `<div class="cv-section-h">Skills</div><div style="font-size:0.65rem;">${escapeHtml(d.skills.join(', '))}</div>` : ''}
        ${d.languages.length ? `<div class="cv-section-h">Languages</div><div style="font-size:0.65rem;">${escapeHtml(d.languages.join(', '))}</div>` : ''}
        ${certHtml ? `<div class="cv-section-h">Certifications</div><div style="font-size:0.62rem;">${certHtml}</div>` : ''}
      </div>
      <div class="cv-main">
        ${d.summary ? `<div class="cv-section-h">Summary</div><p>${escapeHtml(d.summary)}</p>` : ''}
        ${expHtml ? `<div class="cv-section-h">Experience</div>${expHtml}` : ''}
        ${eduHtml ? `<div class="cv-section-h">Education</div>${eduHtml}` : ''}
      </div>
    `;
  } else {
    container.className = 'cv-preview';
    container.innerHTML = `
      <h2 class="cv-name">${escapeHtml(d.fullName || 'Your Name')}</h2>
      <div class="cv-title">${escapeHtml(d.jobTitle)}</div>
      <div class="cv-contact">${escapeHtml(contactBits)}</div>
      ${d.summary ? `<div class="cv-section-h">Summary</div><p>${escapeHtml(d.summary)}</p>` : ''}
      ${expHtml ? `<div class="cv-section-h">Experience</div>${expHtml}` : ''}
      ${eduHtml ? `<div class="cv-section-h">Education</div>${eduHtml}` : ''}
      ${d.skills.length ? `<div class="cv-section-h">Skills</div><p>${escapeHtml(d.skills.join(' · '))}</p>` : ''}
      ${certHtml ? `<div class="cv-section-h">Certifications</div>${certHtml}` : ''}
      ${d.languages.length ? `<div class="cv-section-h">Languages</div><p>${escapeHtml(d.languages.join(' · '))}</p>` : ''}
    `;
  }

  return d;
}

// ---------- Template picker ----------
document.querySelectorAll('.template-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.template-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTemplate = btn.dataset.template;
    renderPreview();
  });
});

// ---------- Add entry buttons ----------
document.getElementById('addExpBtn').addEventListener('click', () => { addExpEntry(); renderPreview(); });
document.getElementById('addEduBtn').addEventListener('click', () => { addEduEntry(); renderPreview(); });

// ---------- Top-level fields autosave/preview ----------
['fullName','jobTitle','email','phone','location','linkedin','portfolio','summary','skills','certifications','languages'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('input', renderPreview);
  el.addEventListener('change', renderPreview);
});

// ---------- Clear form ----------
document.getElementById('clearFormBtn').addEventListener('click', () => {
  if (!confirm('Clear this CV? This only affects this device.')) return;
  KoboStorage.clear('resume');
  document.getElementById('expContainer').innerHTML = '';
  document.getElementById('eduContainer').innerHTML = '';
  ['fullName','jobTitle','email','phone','location','linkedin','portfolio','summary','skills','certifications','languages'].forEach(id => document.getElementById(id).value = '');
  addExpEntry();
  addEduEntry();
  renderPreview();
});

// ---------- Load saved state or seed one empty entry each ----------
(function init() {
  const saved = window.KoboStorage ? KoboStorage.load('resume') : null;
  if (saved) {
    document.getElementById('fullName').value = saved.fullName || '';
    document.getElementById('jobTitle').value = saved.jobTitle || '';
    document.getElementById('email').value = saved.email || '';
    document.getElementById('phone').value = saved.phone || '';
    document.getElementById('location').value = saved.location || '';
    document.getElementById('linkedin').value = saved.linkedin || '';
    document.getElementById('portfolio').value = saved.portfolio || '';
    document.getElementById('summary').value = saved.summary || '';
    document.getElementById('skills').value = (saved.skills || []).join(', ');
    document.getElementById('certifications').value = (saved.certifications || []).map(c => [c.name, c.issuer, c.year].filter(Boolean).join(', ')).join('\n');
    document.getElementById('languages').value = (saved.languages || []).join(', ');
    currentTemplate = saved.template || 'classic';
    document.querySelectorAll('.template-btn').forEach(b => b.classList.toggle('active', b.dataset.template === currentTemplate));
    (saved.experience || []).forEach(addExpEntry);
    (saved.education || []).forEach(addEduEntry);
  }
  if (!document.querySelector('#expContainer .entry-card')) addExpEntry();
  if (!document.querySelector('#eduContainer .entry-card')) addEduEntry();
  renderPreview();
})();

// ---------- PDF building ----------
async function buildCvPdf(watermark) {
  const d = renderPreview();
  return KoboExport.buildResumePdf({ template: d.template, watermark, data: d });
}

document.getElementById('downloadFreeBtn').addEventListener('click', async () => {
  try {
    const doc = await buildCvPdf(true);
    const name = (document.getElementById('fullName').value || 'resume').replace(/\s+/g, '-');
    KoboExport.download(`${name}-cv.pdf`, doc);
  } catch (err) {
    alert('Could not generate PDF: ' + err.message);
  }
});

document.getElementById('downloadCleanBtn').addEventListener('click', async () => {
  const btn = document.getElementById('downloadCleanBtn');
  btn.disabled = true;
  try {
    if (isProOrBusiness) {
      const doc = await buildCvPdf(false);
      const name = (document.getElementById('fullName').value || 'resume').replace(/\s+/g, '-');
      KoboExport.download(`${name}-cv.pdf`, doc);
      return;
    }
    const session = window.KoboAuth ? await window.KoboAuth.getSession() : null;
    if (!session) { alert('Please sign in first to check your credit balance.'); return; }
    const { data: ok } = await window.KoboAuth.supabase.rpc('consume_cv_builder_credit', { p_user_id: session.user.id });
    if (!ok) { alert('No clean-download credits left. Buy more below.'); await refreshCreditStatus(); return; }
    const doc = await buildCvPdf(false);
    const name = (document.getElementById('fullName').value || 'resume').replace(/\s+/g, '-');
    KoboExport.download(`${name}-cv.pdf`, doc);
    await refreshCreditStatus();
  } catch (err) {
    alert('Could not generate PDF: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------- Credit purchase ----------
document.querySelectorAll('#qtySelect button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#qtySelect button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedQty = Number(btn.dataset.qty);
  });
});

document.getElementById('buyCreditsBtn').addEventListener('click', () => {
  window.KoboSubscribe.startSafely('init-cv-payment', { credit_count: selectedQty });
});

// ---------- Pro/Business + credit balance check (soft — never blocks building) ----------
async function refreshCreditStatus() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });
  const session = await window.KoboAuth.getSession();
  const statusEl = document.getElementById('creditStatus');
  const buyBtn = document.getElementById('buyCreditsBtn');
  const cleanBtn = document.getElementById('downloadCleanBtn');
  const qtySelect = document.getElementById('qtySelect');

  if (!session) {
    isProOrBusiness = false;
    statusEl.textContent = 'Remove the watermark';
    buyBtn.style.display = '';
    qtySelect.style.display = '';
    cleanBtn.style.display = 'none';
    return;
  }

  const profile = await window.KoboAuth.getProfile();
  const planActive = profile && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date();
  isProOrBusiness = !!(profile && planActive && (profile.plan === 'pro' || profile.plan === 'business'));

  if (isProOrBusiness) {
    statusEl.textContent = `Clean downloads included on your ${profile.plan === 'business' ? 'Business' : 'Pro'} plan`;
    buyBtn.style.display = 'none';
    qtySelect.style.display = 'none';
    cleanBtn.style.display = '';
    return;
  }

  const { data } = await window.KoboAuth.supabase
    .from('cv_builder_credits')
    .select('credits_balance')
    .eq('user_id', session.user.id)
    .maybeSingle();
  creditBalance = data ? Number(data.credits_balance || 0) : 0;

  statusEl.textContent = creditBalance > 0 ? `You have ${creditBalance} clean-download credit${creditBalance === 1 ? '' : 's'}` : 'Remove the watermark';
  buyBtn.style.display = '';
  qtySelect.style.display = '';
  cleanBtn.style.display = creditBalance > 0 ? '' : 'none';
}

refreshCreditStatus();
if (window.KoboSubscribe) window.KoboSubscribe.resumePendingIfAny();
