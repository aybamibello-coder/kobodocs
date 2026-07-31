let currentType = 'application_letter';
let isPro = false;

function val(id) { return document.getElementById(id).value.trim(); }
function fmtDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '[date]';
}
function addDays(iso, days) {
  const base = iso ? new Date(iso + 'T00:00:00') : new Date();
  base.setDate(base.getDate() + days);
  return base;
}
function shortDate(d) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const DEPT_LABELS = {
  engineering: 'Engineering / Technical',
  sciences: 'Pure & Applied Sciences',
  environmental: 'Environmental Sciences / Design',
  business: 'Management / Business / Social Sciences',
  agriculture: 'Agriculture',
  health: 'Health Sciences',
  education: 'Education',
  other: 'Other / General'
};

const DEPT_CHAPTER3 = {
  engineering: 'Chapter Three: Tools, Equipment and Materials Used — description of machinery, software, and technical processes encountered during training.',
  sciences: 'Chapter Three: Experiments, Procedures and Techniques Carried Out — laboratory or analytical methods used and results observed.',
  environmental: 'Chapter Three: Design, Survey or Site Processes Undertaken — drawings, site visits, and design procedures participated in.',
  business: 'Chapter Three: Departmental Duties and Administrative Processes Observed — office procedures, reporting lines, and business processes learned.',
  agriculture: 'Chapter Three: Farm/Field Practices and Techniques Carried Out — cultivation, husbandry, or agronomic procedures observed and practiced.',
  health: 'Chapter Three: Clinical/Laboratory Procedures Observed — patient care, diagnostic, or laboratory procedures participated in under supervision.',
  education: 'Chapter Three: Teaching Practice and Classroom Activities — lesson planning, classroom management, and instructional methods observed.',
  other: 'Chapter Three: Description of Work Done — the specific tasks, processes, and responsibilities carried out during training.'
};

function titleFor(type) {
  return {
    application_letter: 'SIWES Application Letter',
    acceptance_letter: 'SIWES Acceptance Letter (Sample Format)',
    logbook: 'SIWES Logbook Sample',
    weekly_report: 'SIWES Weekly Report',
    full_report: 'SIWES Report Outline'
  }[type];
}

function commonFields() {
  return {
    name: val('studentName') || '[Your full name]',
    matric: val('matricNo') || '[Matric/Reg. number]',
    institution: val('institution') || '[Institution]',
    department: val('department') || '[Department/Course]',
    company: val('companyName') || '[Company name]',
    companyAddress: val('companyAddress') || '[Company address]',
    supervisor: val('supervisorName') || '[Industry supervisor]',
    startDate: fmtDate(val('startDate')),
    weeks: isPro ? (val('durationWeeks') || '24') : '[duration]'
  };
}

function buildApplicationLetter() {
  const f = commonFields();
  return `${f.name}\n${f.institution}\n\nThe Human Resources Manager\n${f.company}\n${f.companyAddress}\n\nDear Sir/Madam,\n\nAPPLICATION FOR INDUSTRIAL TRAINING (SIWES) PLACEMENT\n\nI am ${f.name}, a student of ${f.department} at ${f.institution}, with matriculation number ${f.matric}. As part of the requirements for my program, I am required to undergo a ${f.weeks}-week Students Industrial Work Experience Scheme (SIWES).\n\nI am writing to request the opportunity to undertake my industrial training at ${f.company}, as I believe the experience gained here would meaningfully complement my studies in ${f.department}.\n\nI have attached my CV, my institution's introduction letter, and other supporting documents for your review. I would be grateful for the opportunity to discuss this further and look forward to your favourable response.\n\nYours faithfully,\n${f.name}`;
}

function buildAcceptanceLetter() {
  const f = commonFields();
  return `${f.company}\n${f.companyAddress}\n\n${f.startDate}\n\n${f.name}\n\nDear ${f.name},\n\nRE: OFFER OF INDUSTRIAL TRAINING (SIWES) PLACEMENT\n\nFurther to your application, we are pleased to inform you that ${f.company} is willing to accept you for industrial training under the Students Industrial Work Experience Scheme (SIWES), for a period of ${f.weeks} weeks commencing ${f.startDate}.\n\nYou will be posted to the relevant department under the supervision of ${f.supervisor}, who will guide you through your training and sign off on your logbook and report as required.\n\nKindly confirm your resumption date ahead of the start date above, and come along with your institution's introduction letter and any other required documentation.\n\nWe wish you a rewarding training experience.\n\nYours faithfully,\n${f.company} — Human Resources`;
}

function buildWeeklyReport() {
  const f = commonFields();
  const week = val('weekNumber') || '[week number]';
  const summary = val('weeklySummary') || '[Summary of what you did and learned this week]';
  return `WEEKLY REPORT — WEEK ${week}\n\nName: ${f.name}\nCompany: ${f.company}\nSupervisor: ${f.supervisor}\n\nSummary of activities this week:\n${summary}\n\nSubmitted for supervisor's review and signature.`;
}

function buildFullReportOutline() {
  const f = commonFields();
  const deptType = isPro ? (document.getElementById('deptType').value || 'other') : 'other';
  const chapter3 = isPro ? DEPT_CHAPTER3[deptType] : DEPT_CHAPTER3.other;
  const deptNote = isPro ? ` — tailored for ${DEPT_LABELS[deptType]}` : '';

  return `SIWES TECHNICAL REPORT — SUGGESTED OUTLINE${deptNote}\n\nTitle Page\nCertification (signed by student, industry supervisor, and school supervisor)\nDedication\nAcknowledgment\nTable of Contents\n\nChapter One: Introduction\n  — Background to SIWES and its objectives\n  — Profile of ${f.company}\n  — Aims of the industrial training\n\nChapter Two: Training Undertaken\n  — Description of departments/units attached to, over the ${f.weeks}-week period\n  — Overview of duties and responsibilities carried out\n\n${chapter3}\n\nChapter Four: Challenges Encountered\n  — Difficulties faced during training and how they were resolved\n  — Relevance of coursework to practical experience\n\nChapter Five: Summary, Conclusion and Recommendations\n  — Summary of the training experience\n  — Recommendations to the institution, ITF, and future students\n\nReferences\nAppendices (logbook pages, photographs, certificate of completion)`;
}

function buildLogbookRows() {
  const start = val('startDate');
  const weeksTotal = isPro ? Math.max(1, parseInt(val('durationWeeks'), 10) || 1) : 1;
  const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const week1Activities = [val('logMon'), val('logTue'), val('logWed'), val('logThu'), val('logFri')];
  const placeholders = [
    'Reported for duty; assisted with departmental tasks under supervision',
    'Continued departmental duties; observed ongoing processes',
    'Assisted senior staff with assigned tasks',
    'Participated in unit activities and documented observations',
    'Reviewed the week\'s work with supervisor; prepared for following week'
  ];

  const weeks = [];
  for (let w = 0; w < weeksTotal; w++) {
    const rows = dayLabels.map((day, i) => {
      const dateObj = addDays(start, w * 7 + i);
      const activity = w === 0
        ? (week1Activities[i] || `[Describe ${day.toLowerCase()}'s activity]`)
        : placeholders[i];
      return { date: shortDate(dateObj), day, activity };
    });
    weeks.push({ weekNumber: w + 1, rows });
  }
  return weeks;
}

function renderDoc() {
  const doc = document.getElementById('siwesDoc');
  const f = commonFields();

  if (currentType === 'logbook') {
    const weeks = buildLogbookRows();
    doc.innerHTML = `
      <div class="siwes-title">${titleFor(currentType)}</div>
      <p style="font-size:0.82rem; opacity:0.7; margin-bottom:14px;">${f.name} — ${f.company}${weeks.length > 1 ? ` — ${weeks.length} weeks` : ''}</p>
      ${weeks.map(w => `
        <div class="siwes-week-label">Week ${w.weekNumber}</div>
        <table class="siwes-table">
          <thead><tr><th>Date</th><th>Day</th><th>Activities Carried Out</th></tr></thead>
          <tbody>
            ${w.rows.map(r => `<tr><td>${r.date}</td><td>${r.day}</td><td>${r.activity}</td></tr>`).join('')}
          </tbody>
        </table>
      `).join('')}
      <div class="siwes-watermark${isPro ? ' hidden' : ''}">Made with KoboDocs — kobodocs.com.ng</div>
    `;
    return;
  }

  let body;
  if (currentType === 'application_letter') body = buildApplicationLetter();
  else if (currentType === 'acceptance_letter') body = buildAcceptanceLetter();
  else if (currentType === 'weekly_report') body = buildWeeklyReport();
  else body = buildFullReportOutline();

  doc.innerHTML = `
    <div class="siwes-title">${titleFor(currentType)}</div>
    <div class="siwes-body">${body}</div>
    <div class="siwes-watermark${isPro ? ' hidden' : ''}">Made with KoboDocs — kobodocs.com.ng</div>
  `;
}

document.getElementById('typeTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  currentType = btn.dataset.type;
  document.querySelectorAll('#typeTabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.siwes-fields').forEach(f => f.classList.remove('active'));
  const fields = document.querySelector(`.siwes-fields[data-fields="${currentType}"]`);
  if (fields) fields.classList.add('active');
  renderDoc();
});

document.querySelectorAll('.form-panel input, .form-panel textarea, .form-panel select').forEach(el => {
  el.addEventListener('input', renderDoc);
  el.addEventListener('change', renderDoc);
});

document.getElementById('startDate').value = new Date().toISOString().split('T')[0];
renderDoc();

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

function buildPdf() {
  const f = commonFields();
  const watermark = isPro ? '' : '\n\n---\nMade with KoboDocs — kobodocs.com.ng';

  if (currentType === 'logbook') {
    const weeks = buildLogbookRows();
    const rows = [];
    weeks.forEach(w => {
      rows.push([`Week ${w.weekNumber}`, '', '']);
      w.rows.forEach(r => rows.push([r.date, r.day, r.activity]));
    });
    return KoboExport.buildTablePdf({
      docLabel: 'SIWES Logbook',
      businessName: f.name,
      businessSub: `${f.company} — ${f.department}`,
      metaLines: [f.matric, f.institution],
      columns: ['Date', 'Day', 'Activities Carried Out'],
      rows,
      note: isPro ? '' : 'Made with KoboDocs — kobodocs.com.ng'
    });
  }

  let body;
  if (currentType === 'application_letter') body = buildApplicationLetter();
  else if (currentType === 'acceptance_letter') body = buildAcceptanceLetter();
  else if (currentType === 'weekly_report') body = buildWeeklyReport();
  else body = buildFullReportOutline();

  return KoboExport.buildLetterPdf({
    letterhead: titleFor(currentType),
    dateLine: `${f.name} — ${f.company}`,
    bodyText: body + watermark
  });
}

document.getElementById('downloadPdfBtn').addEventListener('click', () => {
  try {
    const doc = buildPdf();
    KoboExport.download(`siwes-${currentType}.pdf`, doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = buildPdf();
    await KoboExport.shareWhatsApp(`siwes-${currentType}.pdf`, `${titleFor(currentType)}, made with KoboDocs.`, doc);
  } catch (err) {
    if (err.name !== 'AbortError') showMsg('Could not prepare the PDF: ' + err.message, 'error');
  } finally {
    btn.textContent = original;
  }
});

document.getElementById('upgradeProBtn').addEventListener('click', async () => {
  const btn = document.getElementById('upgradeProBtn');
  const original = btn.textContent;
  btn.textContent = 'Redirecting…';
  btn.disabled = true;
  try {
    await KoboSubscribe.start('init-tool-pass-payment', { tool_key: 'siwes_report', callback_path: '/siwes-logbook-report/' });
  } catch {
    btn.textContent = original;
    btn.disabled = false;
  }
});

// ---------- Pro gating: multi-week logbook + tailored report outline ----------
async function checkAccess() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const session = await window.KoboAuth.getSession();
  if (!session) { isPro = false; renderDoc(); return; }

  try {
    const res = await fetch('https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1/check-tool-pass-access', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_key: 'siwes_report' })
    });
    const data = await res.json();
    isPro = !!data.allowed;
  } catch {
    isPro = false;
  }

  if (isPro) {
    document.getElementById('proLockBanner').style.display = 'none';
    document.getElementById('proFieldset').classList.add('unlocked');
  }
  renderDoc();
}

checkAccess();
KoboSubscribe.resumePendingIfAny().then(() => setTimeout(checkAccess, 500));
