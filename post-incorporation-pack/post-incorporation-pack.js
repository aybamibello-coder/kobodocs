// ---------- Post-Incorporation Document Pack ----------
let hasAccess = false;
let currentType = 'resolution';

function val(id) { return document.getElementById(id).value.trim(); }
function fmtDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '[date]';
}

// ---------- Repeatable rows: signatories, members, directors ----------
let sigId = 0;
function addSignatoryRow(name = '', position = '') {
  sigId++;
  const row = document.createElement('div');
  row.className = 'repeat-row';
  row.innerHTML = `
    <button type="button" class="remove-row" aria-label="Remove">&times;</button>
    <div class="field-row">
      <div class="field-group"><label>Name</label><input type="text" class="sig-name" value="${name}" placeholder="Adaeze Okafor"></div>
      <div class="field-group"><label>Position</label><input type="text" class="sig-position" value="${position}" placeholder="Managing Director"></div>
    </div>
  `;
  document.getElementById('signatoriesWrap').appendChild(row);
  row.querySelectorAll('input').forEach(el => el.addEventListener('input', renderPreview));
  row.querySelector('.remove-row').addEventListener('click', () => { row.remove(); renderPreview(); });
}

let memberId = 0;
function addMemberRow() {
  memberId++;
  const row = document.createElement('div');
  row.className = 'repeat-row';
  row.innerHTML = `
    <button type="button" class="remove-row" aria-label="Remove">&times;</button>
    <div class="field-group"><label>Full name</label><input type="text" class="m-name" placeholder="Chinedu Eze"></div>
    <div class="field-group"><label>Address</label><input type="text" class="m-address" placeholder="No. 8 Marina Road, Lagos"></div>
    <div class="field-row">
      <div class="field-group"><label>Number of shares</label><input type="number" class="m-shares" placeholder="1000"></div>
      <div class="field-group"><label>Date became member</label><input type="date" class="m-date"></div>
    </div>
  `;
  document.getElementById('membersWrap').appendChild(row);
  row.querySelectorAll('input').forEach(el => el.addEventListener('input', renderPreview));
  row.querySelector('.remove-row').addEventListener('click', () => { row.remove(); renderPreview(); });
}

let directorId = 0;
function addDirectorRow() {
  directorId++;
  const row = document.createElement('div');
  row.className = 'repeat-row';
  row.innerHTML = `
    <button type="button" class="remove-row" aria-label="Remove">&times;</button>
    <div class="field-group"><label>Full name</label><input type="text" class="d-name" placeholder="Adaeze Okafor"></div>
    <div class="field-group"><label>Address</label><input type="text" class="d-address" placeholder="No. 4 Adeyemi Street, Surulere, Lagos"></div>
    <div class="field-row">
      <div class="field-group"><label>Nationality</label><input type="text" class="d-nationality" placeholder="Nigerian"></div>
      <div class="field-group"><label>Occupation</label><input type="text" class="d-occupation" placeholder="Fashion Designer"></div>
    </div>
    <div class="field-group"><label>Date of appointment</label><input type="date" class="d-appointed"></div>
  `;
  document.getElementById('directorsWrap').appendChild(row);
  row.querySelectorAll('input').forEach(el => el.addEventListener('input', renderPreview));
  row.querySelector('.remove-row').addEventListener('click', () => { row.remove(); renderPreview(); });
}

document.getElementById('addSignatoryBtn').addEventListener('click', () => { addSignatoryRow(); renderPreview(); });
document.getElementById('addMemberBtn').addEventListener('click', () => { addMemberRow(); renderPreview(); });
document.getElementById('addDirectorBtn').addEventListener('click', () => { addDirectorRow(); renderPreview(); });

addSignatoryRow();
addMemberRow();
addDirectorRow();

function getSignatories() {
  return [...document.querySelectorAll('#signatoriesWrap .repeat-row')].map(r => ({
    name: r.querySelector('.sig-name').value.trim(),
    position: r.querySelector('.sig-position').value.trim()
  }));
}
function getMembers() {
  return [...document.querySelectorAll('#membersWrap .repeat-row')].map(r => ({
    name: r.querySelector('.m-name').value.trim(),
    address: r.querySelector('.m-address').value.trim(),
    shares: r.querySelector('.m-shares').value.trim(),
    date: r.querySelector('.m-date').value
  }));
}
function getDirectors() {
  return [...document.querySelectorAll('#directorsWrap .repeat-row')].map(r => ({
    name: r.querySelector('.d-name').value.trim(),
    address: r.querySelector('.d-address').value.trim(),
    nationality: r.querySelector('.d-nationality').value.trim(),
    occupation: r.querySelector('.d-occupation').value.trim(),
    appointed: r.querySelector('.d-appointed').value
  }));
}

// ---------- Tabs ----------
document.getElementById('docTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  currentType = btn.dataset.type;
  document.querySelectorAll('#docTabs button').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.d-fields').forEach(f => f.classList.toggle('active', f.dataset.fields === currentType));
  renderPreview();
});

document.querySelectorAll('.form-panel input, .form-panel select').forEach(el => {
  if (!el.closest('.repeat-row')) el.addEventListener('input', renderPreview);
});

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

// ---------- Live preview (simple summary; full formatting happens in the PDF) ----------
function renderPreview() {
  const company = val('companyName') || '[Company name]';
  const rc = val('rcNumber') || '[RC number]';
  const address = val('registeredAddress') || '[Registered address]';
  const el = document.getElementById('previewInner');

  if (currentType === 'resolution') {
    const sigs = getSignatories().map(s => `<li>${s.name || '[name]'} — ${s.position || '[position]'}</li>`).join('');
    el.innerHTML = `
      <div class="biz">${company}</div>
      <div class="biz-sub">RC: ${rc} · ${address}</div>
      <p style="margin-top:16px; font-weight:600;">BOARD RESOLUTION</p>
      <p style="font-size:0.86rem; opacity:0.75;">Meeting held on ${fmtDate(val('meetingDate'))}</p>
      <p style="margin-top:12px; font-size:0.9rem;">RESOLVED that an account be opened with ${val('bankName') || '[bank name]'}, and that ${val('signingMandate')} be authorized to operate the account.</p>
      <p style="margin-top:10px; font-size:0.86rem;"><strong>Authorized signatories:</strong></p>
      <ul style="font-size:0.86rem;">${sigs || '<li>[no signatories added]</li>'}</ul>
    `;
  } else if (currentType === 'certificate') {
    el.innerHTML = `
      <div class="biz">${company}</div>
      <div class="biz-sub">RC: ${rc}</div>
      <p style="margin-top:16px; font-weight:600; text-align:center;">SHARE CERTIFICATE No. ${val('certNumber') || '—'}</p>
      <p style="margin-top:12px; font-size:0.9rem;">This is to certify that <strong>${val('shareholderName') || '[shareholder]'}</strong> of ${val('shareholderAddress') || '[address]'} is the registered holder of <strong>${val('numShares') || '[number]'}</strong> ${val('shareClass')} shares of ₦${val('amountPaid') || '[amount]'} each, fully paid.</p>
      <p style="margin-top:10px; font-size:0.86rem; opacity:0.7;">Date of issue: ${fmtDate(val('certDate'))}</p>
    `;
  } else if (currentType === 'members') {
    const rows = getMembers().map(m => `<tr><td>${m.name || '—'}</td><td>${m.address || '—'}</td><td>${m.shares || '—'}</td><td>${fmtDate(m.date)}</td></tr>`).join('');
    el.innerHTML = `
      <div class="biz">${company}</div>
      <div class="biz-sub">RC: ${rc}</div>
      <p style="margin-top:16px; font-weight:600;">REGISTER OF MEMBERS</p>
      <table style="width:100%; font-size:0.82rem; margin-top:10px; border-collapse:collapse;">
        <thead><tr><th style="text-align:left;">Name</th><th style="text-align:left;">Address</th><th style="text-align:left;">Shares</th><th style="text-align:left;">Since</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No members added yet</td></tr>'}</tbody>
      </table>
    `;
  } else if (currentType === 'directors') {
    const rows = getDirectors().map(d => `<tr><td>${d.name || '—'}</td><td>${d.nationality || '—'}</td><td>${d.occupation || '—'}</td><td>${fmtDate(d.appointed)}</td></tr>`).join('');
    el.innerHTML = `
      <div class="biz">${company}</div>
      <div class="biz-sub">RC: ${rc}</div>
      <p style="margin-top:16px; font-weight:600;">REGISTER OF DIRECTORS</p>
      <table style="width:100%; font-size:0.82rem; margin-top:10px; border-collapse:collapse;">
        <thead><tr><th style="text-align:left;">Name</th><th style="text-align:left;">Nationality</th><th style="text-align:left;">Occupation</th><th style="text-align:left;">Appointed</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No directors added yet</td></tr>'}</tbody>
      </table>
    `;
  }
}

// ---------- PDF builders ----------
function buildResolutionPdf() {
  const sigs = getSignatories();
  const sigLines = sigs.length ? sigs.map(s => `${s.name || '[name]'} — ${s.position || '[position]'}`).join('\n') : '[No signatories added]';
  const body = `RESOLVED that an account be opened and maintained with ${val('bankName') || '[bank name]'} in the name of ${val('companyName') || '[company name]'} (RC ${val('rcNumber') || '[RC number]'}), and that ${val('signingMandate')} of the following be authorized to operate the said account, including signing cheques, withdrawal instructions, and any other banking instruments on behalf of the company:\n\n${sigLines}\n\nFURTHER RESOLVED that a certified copy of this resolution be furnished to the bank as the company's mandate.`;

  return KoboExport.buildLetterPdf({
    letterhead: `${val('companyName') || 'Company Name'} — Board Resolution`,
    dateLine: `Meeting held on ${fmtDate(val('meetingDate'))} at the registered office: ${val('registeredAddress') || '[address]'}`,
    bodyText: body
  });
}

async function buildCertificatePdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  await window.KoboExport._registerFonts(doc);
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 50;

  doc.setDrawColor(180, 140, 60);
  doc.setLineWidth(2);
  doc.rect(m, m, pw - m * 2, ph - m * 2);
  doc.setLineWidth(0.75);
  doc.rect(m + 8, m + 8, pw - m * 2 - 16, ph - m * 2 - 16);

  let y = m + 60;
  doc.setFont('Fraunces', 'bold');
  doc.setFontSize(20);
  doc.text((val('companyName') || 'COMPANY NAME').toUpperCase(), pw / 2, y, { align: 'center' });
  y += 20;
  doc.setFontSize(10);
  doc.setFont('WorkSans', 'normal');
  doc.text(`RC ${val('rcNumber') || '[RC number]'}`, pw / 2, y, { align: 'center' });
  y += 40;

  doc.setFont('Fraunces', 'bold');
  doc.setFontSize(16);
  doc.text('SHARE CERTIFICATE', pw / 2, y, { align: 'center' });
  y += 16;
  doc.setFont('WorkSans', 'normal');
  doc.setFontSize(10);
  doc.text(`Certificate No. ${val('certNumber') || '—'}`, pw / 2, y, { align: 'center' });
  y += 50;

  doc.setFontSize(11.5);
  const bodyText = `This is to certify that ${val('shareholderName') || '[shareholder name]'} of ${val('shareholderAddress') || '[address]'} is the registered holder of ${val('numShares') || '[number]'} ${val('shareClass')} shares of ₦${val('amountPaid') || '[amount]'} each in the above-named company, fully paid or credited as fully paid.`;
  const lines = doc.splitTextToSize(bodyText, pw - m * 2 - 80);
  doc.text(lines, pw / 2, y, { align: 'center' });
  y += lines.length * 16 + 30;

  doc.setFontSize(10);
  doc.text(`Given under the common seal of the company this ${fmtDate(val('certDate'))}.`, pw / 2, y, { align: 'center' });

  y = ph - m - 90;
  const colW = (pw - m * 2 - 100) / 2;
  doc.setDrawColor(20);
  doc.line(m + 50, y, m + 50 + colW, y);
  doc.line(pw - m - 50 - colW, y, pw - m - 50, y);
  y += 12;
  doc.setFontSize(9);
  doc.text(`Director: ${val('directorSignatory') || ''}`, m + 50, y);
  doc.text(`Secretary: ${val('secretarySignatory') || ''}`, pw - m - 50 - colW, y);

  return doc;
}

function buildMembersPdf() {
  const rows = getMembers().map(m => [m.name || '—', m.address || '—', m.shares || '—', fmtDate(m.date)]);
  return KoboExport.buildTablePdf({
    docLabel: 'Register of Members',
    businessName: val('companyName') || 'Company Name',
    businessSub: `RC ${val('rcNumber') || '—'} · ${val('registeredAddress') || ''}`,
    columns: ['Name', 'Address', 'Shares Held', 'Date Became Member'],
    rightAlignCols: [2],
    rows,
    note: 'This register should be updated whenever membership changes, per the Companies and Allied Matters Act.'
  });
}

function buildDirectorsPdf() {
  const rows = getDirectors().map(d => [d.name || '—', d.nationality || '—', d.occupation || '—', fmtDate(d.appointed)]);
  return KoboExport.buildTablePdf({
    docLabel: 'Register of Directors',
    businessName: val('companyName') || 'Company Name',
    businessSub: `RC ${val('rcNumber') || '—'} · ${val('registeredAddress') || ''}`,
    columns: ['Name', 'Nationality', 'Occupation', 'Date of Appointment'],
    rows,
    note: 'This register should be updated whenever a director is appointed or resigns, per the Companies and Allied Matters Act.'
  });
}

function buildActivePdf() {
  if (currentType === 'resolution') return buildResolutionPdf();
  if (currentType === 'certificate') return buildCertificatePdf();
  if (currentType === 'members') return buildMembersPdf();
  return buildDirectorsPdf();
}

function filenameForActive() {
  const slug = (val('companyName') || 'company').replace(/\s+/g, '-').toLowerCase();
  return `${slug}-${currentType}.pdf`;
}

document.getElementById('downloadPdfBtn').addEventListener('click', async () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  try {
    const doc = await buildActivePdf();
    KoboExport.download(filenameForActive(), doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = await buildActivePdf();
    await KoboExport.shareWhatsApp(filenameForActive(), 'Company document, made with KoboDocs.', doc);
  } catch (err) {
    if (err.name !== 'AbortError') showMsg('Could not prepare the PDF: ' + err.message, 'error');
  } finally {
    btn.textContent = original;
  }
});

document.getElementById('buyPassBtn').addEventListener('click', async () => {
  const btn = document.getElementById('buyPassBtn');
  const original = btn.textContent;
  btn.textContent = 'Redirecting…';
  btn.disabled = true;
  try {
    await KoboSubscribe.start('init-tool-pass-payment', { tool_key: 'post_incorporation_pack', callback_path: '/post-incorporation-pack/' });
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
    document.getElementById('affContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
    return;
  }

  try {
    const res = await fetch('https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1/check-tool-pass-access', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_key: 'post_incorporation_pack' })
    });
    const data = await res.json();
    hasAccess = !!data.allowed;
  } catch {
    hasAccess = false;
  }

  if (hasAccess) {
    document.getElementById('affContent').classList.remove('locked');
    document.getElementById('lockOverlay').classList.remove('show');
  } else {
    document.getElementById('affContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
  }
}

renderPreview();
checkAccess();
KoboSubscribe.resumePendingIfAny().then(() => setTimeout(checkAccess, 500));
