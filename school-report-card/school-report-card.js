const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG');
let hasAccess = false;
let logoDataUrl = null;
let billingMode = 'subscription';
let billingCycle = 'monthly';

function gradeFor(score) {
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function addSubjectRow(name = '', score = '') {
  const row = document.createElement('div');
  row.className = 'subject-row';
  row.innerHTML = `
    <input type="text" class="subj-name" placeholder="Subject" value="${name}">
    <input type="number" class="subj-score" min="0" max="100" placeholder="Score" value="${score}">
    <input type="text" class="subj-remark" placeholder="Remark (optional)">
    <button type="button" class="item-remove" aria-label="Remove">&times;</button>
  `;
  document.getElementById('subjectRows').appendChild(row);
  row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', renderReport));
  row.querySelector('.item-remove').addEventListener('click', () => { row.remove(); renderReport(); });
}

function getSubjects() {
  return [...document.querySelectorAll('.subject-row')].map(row => {
    const score = parseFloat(row.querySelector('.subj-score').value) || 0;
    return {
      name: row.querySelector('.subj-name').value || 'Subject',
      score,
      grade: gradeFor(score),
      remark: row.querySelector('.subj-remark').value
    };
  });
}

function val(id) { return document.getElementById(id).value.trim(); }
function fmtDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function computeData() {
  const subjects = getSubjects();
  const total = subjects.reduce((s, x) => s + x.score, 0);
  const average = subjects.length ? (total / subjects.length) : 0;
  const daysPresent = parseFloat(val('daysPresent')) || 0;
  const daysTotal = parseFloat(val('daysTotal')) || 0;

  return {
    schoolName: val('schoolName') || 'Your School Name',
    schoolMotto: val('schoolMotto'),
    term: document.getElementById('term').value,
    session: val('session') || '2025/2026',
    studentName: val('studentName') || 'Student Name',
    studentClass: val('studentClass') || '—',
    admissionNo: val('admissionNo'),
    classSize: val('classSize'),
    subjects,
    total,
    average,
    daysPresent,
    daysTotal,
    classPosition: val('classPosition'),
    teacherComment: val('teacherComment'),
    principalComment: val('principalComment'),
    nextTerm: val('nextTerm')
  };
}

function renderReport() {
  const d = computeData();
  const content = document.getElementById('reportContent');

  content.innerHTML = `
    <div class="report-head">
      <div>
        <div class="school-name">${d.schoolName}</div>
        ${d.schoolMotto ? `<div class="school-sub">${d.schoolMotto}</div>` : ''}
      </div>
      ${logoDataUrl ? `<img src="${logoDataUrl}" alt="School logo">` : ''}
    </div>
    <div class="report-meta">
      <span><strong>Student</strong>${d.studentName}</span>
      <span><strong>Class</strong>${d.studentClass}</span>
      <span><strong>Term</strong>${d.term}</span>
      <span><strong>Session</strong>${d.session}</span>
      ${d.admissionNo ? `<span><strong>Admission No.</strong>${d.admissionNo}</span>` : ''}
    </div>
    <table class="subjects-table">
      <thead><tr><th>Subject</th><th>Score</th><th>Grade</th><th>Remark</th></tr></thead>
      <tbody>
        ${d.subjects.map(s => `<tr><td>${s.name}</td><td>${s.score}</td><td>${s.grade}</td><td>${s.remark || ''}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="report-meta">
      <span><strong>Total score</strong>${d.total}</span>
      <span><strong>Average</strong>${d.average.toFixed(1)}%</span>
      ${d.classPosition ? `<span><strong>Position</strong>${d.classPosition}</span>` : ''}
      <span><strong>Attendance</strong>${d.daysPresent}/${d.daysTotal} days</span>
    </div>
    ${d.teacherComment ? `<div class="comment-block"><strong>Class Teacher's Comment</strong>${d.teacherComment}</div>` : ''}
    ${d.principalComment ? `<div class="comment-block"><strong>Head Teacher's Comment</strong>${d.principalComment}</div>` : ''}
    ${d.nextTerm ? `<div class="comment-block"><strong>Next Term Begins</strong>${fmtDate(d.nextTerm)}</div>` : ''}
  `;

  return d;
}

document.getElementById('addSubjectBtn').addEventListener('click', () => { addSubjectRow(); renderReport(); });
document.querySelectorAll('.form-panel input, .form-panel textarea, .form-panel select').forEach(el => {
  el.addEventListener('input', renderReport);
  el.addEventListener('change', renderReport);
});
document.getElementById('schoolLogo').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) { logoDataUrl = null; renderReport(); return; }
  const reader = new FileReader();
  reader.onload = () => { logoDataUrl = reader.result; renderReport(); };
  reader.readAsDataURL(file);
});

addSubjectRow('Mathematics', '');
addSubjectRow('English Language', '');
addSubjectRow('Basic Science', '');
renderReport();

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

function buildReportPdf(d) {
  const rows = d.subjects.map(s => [s.name, s.score, s.grade, s.remark || '']);
  const noteLines = [
    `Attendance: ${d.daysPresent}/${d.daysTotal} days`,
    d.teacherComment ? `Class Teacher's Comment: ${d.teacherComment}` : '',
    d.principalComment ? `Head Teacher's Comment: ${d.principalComment}` : '',
    d.nextTerm ? `Next term begins: ${fmtDate(d.nextTerm)}` : ''
  ].filter(Boolean).join('\n');

  return KoboExport.buildTablePdf({
    docLabel: 'Report Card',
    businessName: d.schoolName,
    businessSub: d.schoolMotto,
    metaLines: [d.term, d.session],
    toLabel: 'Student',
    toName: d.studentName,
    toSub: [d.studentClass, d.admissionNo].filter(Boolean).join(' · '),
    columns: ['Subject', 'Score', 'Grade', 'Remark'],
    rightAlignCols: [1],
    rows,
    totals: [
      { label: 'Total score', value: String(d.total) },
      { label: 'Average', value: d.average.toFixed(1) + '%' },
      ...(d.classPosition ? [{ label: 'Position', value: d.classPosition, emphasis: true }] : [])
    ],
    note: noteLines,
    signatureLines: ["Class Teacher's signature", "Head Teacher's signature"],
    watermark: false
  });
}

document.getElementById('downloadPdfBtn').addEventListener('click', () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  const d = renderReport();
  try {
    const doc = buildReportPdf(d);
    KoboExport.download(`report-card-${(d.studentName || 'student').replace(/\s+/g, '-')}.pdf`, doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  const d = renderReport();
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = buildReportPdf(d);
    await KoboExport.shareWhatsApp(`report-card-${(d.studentName || 'student').replace(/\s+/g, '-')}.pdf`, `Report card for ${d.studentName}, made with KoboDocs.`, doc);
  } catch (err) {
    if (err.name !== 'AbortError') showMsg('Could not prepare the PDF: ' + err.message, 'error');
  } finally {
    btn.textContent = original;
  }
});

// ---------- Billing mode/cycle tabs ----------
function updatePriceDisplay() {
  const priceEl = document.getElementById('planPrice');
  document.getElementById('cycleTabs').style.display = billingMode === 'subscription' ? 'flex' : 'none';
  if (billingMode === 'per_term') {
    priceEl.innerHTML = '₦4,500 <small style="font-size:0.9rem; opacity:0.6;">per term</small>';
  } else if (billingCycle === 'yearly') {
    priceEl.innerHTML = '₦25,000 <small style="font-size:0.9rem; opacity:0.6;">/year</small>';
  } else {
    priceEl.innerHTML = '₦2,500 <small style="font-size:0.9rem; opacity:0.6;">/month</small>';
  }
}

document.getElementById('billingTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;
  billingMode = btn.dataset.mode;
  document.querySelectorAll('#billingTabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updatePriceDisplay();
});

document.getElementById('cycleTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-cycle]');
  if (!btn) return;
  billingCycle = btn.dataset.cycle;
  document.querySelectorAll('#cycleTabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updatePriceDisplay();
});

updatePriceDisplay();

document.getElementById('buyPassBtn').addEventListener('click', async () => {
  const btn = document.getElementById('buyPassBtn');
  const original = btn.textContent;
  btn.textContent = 'Redirecting…';
  btn.disabled = true;
  try {
    await KoboSubscribe.start('init-school-report-payment', { billing_mode: billingMode, billing_cycle: billingCycle });
  } catch {
    btn.textContent = original;
    btn.disabled = false;
  }
});

// ---------- Access check ----------
async function checkAccess() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const session = await window.KoboAuth.getSession();
  if (!session) {
    document.getElementById('reportContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
    return;
  }

  try {
    const res = await fetch('https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1/check-school-report-access', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    const data = await res.json();
    hasAccess = !!data.allowed;
  } catch {
    hasAccess = false;
  }

  if (hasAccess) {
    document.getElementById('reportContent').classList.remove('locked');
    document.getElementById('lockOverlay').classList.remove('show');
  } else {
    document.getElementById('reportContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
  }
}

checkAccess();
KoboSubscribe.resumePendingIfAny().then(() => setTimeout(checkAccess, 500));
