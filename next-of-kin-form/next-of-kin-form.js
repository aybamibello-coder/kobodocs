// ---------- Next of Kin Form Generator: first document free, then a one-time Pro pass ----------
let currentType = 'bank';
let hasPass = false;
let freeUsed = false;

const FREE_USED_KEY = 'kobo_nok_free_used';

function val(id) { return document.getElementById(id).value.trim(); }
function fmtDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '[date]';
}

function titleFor(type) {
  return {
    bank: 'Next of Kin Form — Bank / Account Opening',
    job: 'Next of Kin Form — Employment',
    nysc: 'Next of Kin Form — NYSC',
    hostel: 'Next of Kin Form — School / Hostel'
  }[type];
}

function contextFor(type) {
  const employer = val('institutionName') || '[employer name]';
  const bank = val('institutionName') || '[bank name]';
  const school = val('institutionName') || '[institution name]';
  return {
    bank: `in connection with my account with ${bank}`,
    job: `in connection with my employment with ${employer}`,
    nysc: `in connection with my National Youth Service Corps (NYSC) service`,
    hostel: `in connection with my admission and residence at ${school}`
  }[type];
}

function declarationFor(type) {
  const applicant = val('applicantName') || "[Applicant's full name]";
  const address = val('applicantAddress') || '[address]';
  const phone = val('applicantPhone') || '[phone number]';
  const kinName = val('kinName') || "[Next of kin's full name]";
  const relationship = val('relationship') || '[relationship]';
  const kinPhone = val('kinPhone') || '[phone number]';
  const kinAddress = val('kinAddress') || '[address]';
  const kinOccupation = val('kinOccupation');

  const opening = `I, ${applicant}, of ${address}, phone number ${phone}, hereby declare ${kinName} as my next of kin ${contextFor(type)}.`;
  const relation = `${kinName} is my ${relationship}, reachable on ${kinPhone}, residing at ${kinAddress}${kinOccupation ? `, occupation: ${kinOccupation}` : ''}.`;
  const purpose = `This declaration is for contact and emergency purposes only, so that ${kinName} may be reached on my behalf if I cannot be reached directly. It does not, on its own, confer any right of inheritance over my property or assets.`;
  const closing = `I confirm that the information provided above is true and correct to the best of my knowledge.`;

  return `${opening} ${relation} ${purpose} ${closing}`;
}

function renderPreview() {
  const content = document.getElementById('nContent');
  const showAlternate = hasPass && (val('altKinName') || val('altKinPhone'));

  content.innerHTML = `
    <div class="n-title">${titleFor(currentType)}</div>
    <div class="n-sub">Date: ${fmtDate(val('nDate'))}</div>
    <div class="n-clause">${declarationFor(currentType)}</div>
    <div class="n-sign-row">
      <div class="n-sign-block">Applicant's Signature<br>${val('applicantName') || '[Applicant]'}</div>
      <div class="n-sign-block">Next of Kin's Signature (optional)<br>${val('kinName') || '[Next of Kin]'}</div>
    </div>
    ${showAlternate ? `
    <div class="n-sign-row">
      <div class="n-sign-block">Alternate Next of Kin<br>${val('altKinName')}</div>
      <div class="n-sign-block">Alternate Phone<br>${val('altKinPhone')}</div>
    </div>` : ''}
  `;
}

// ---------- Type tabs ----------
document.getElementById('typeTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  currentType = btn.dataset.type;
  document.querySelectorAll('#typeTabs button').forEach(b => b.classList.toggle('active', b === btn));
  document.getElementById('institutionLabel').textContent = {
    bank: 'Bank name',
    job: 'Employer name',
    nysc: 'NYSC state / PPA (optional)',
    hostel: 'Institution name'
  }[currentType];
  document.getElementById('institutionRow').style.display = currentType === 'nysc' ? 'none' : '';
  renderPreview();
});

document.querySelectorAll('.form-panel input, .form-panel textarea').forEach(el => {
  el.addEventListener('input', renderPreview);
});

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

// ---------- PDF builders ----------
function buildBasicPdf() {
  return KoboExport.buildLetterPdf({
    letterhead: titleFor(currentType),
    dateLine: `Date: ${fmtDate(val('nDate'))}`,
    bodyText: declarationFor(currentType)
  });
}

function buildProFormPdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const m = 56;
  const pw = doc.internal.pageSize.getWidth();
  let y = m;

  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text(titleFor(currentType).toUpperCase(), pw / 2, y, { align: 'center' });
  y += 22;
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(110);
  doc.text(`Date: ${fmtDate(val('nDate'))}`, pw / 2, y, { align: 'center' });
  doc.setTextColor(20);
  y += 30;

  // Passport photo box, top right
  const boxSize = 90;
  doc.setDrawColor(150);
  doc.rect(pw - m - boxSize, m, boxSize, boxSize);
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text('Passport', pw - m - boxSize / 2, m + boxSize / 2 - 4, { align: 'center' });
  doc.text('Photograph', pw - m - boxSize / 2, m + boxSize / 2 + 8, { align: 'center' });
  doc.setTextColor(20);

  function fieldRow(label, value, yPos, width) {
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text(label, m, yPos);
    doc.setDrawColor(180);
    doc.line(m + 150, yPos + 2, m + (width || 320), yPos + 2);
    doc.setFont('times', 'normal');
    doc.text(value || '', m + 155, yPos);
    return yPos + 24;
  }

  y += 10;
  doc.setFont('times', 'bold'); doc.setFontSize(10.5);
  doc.text('APPLICANT', m, y);
  y += 18;
  y = fieldRow("Full Name:", val('applicantName'), y);
  y = fieldRow("Address:", val('applicantAddress'), y);
  y = fieldRow("Phone Number:", val('applicantPhone'), y);
  y += 12;

  doc.setFont('times', 'bold'); doc.setFontSize(10.5);
  doc.text('NEXT OF KIN', m, y);
  y += 18;
  y = fieldRow("Full Name:", val('kinName'), y);
  y = fieldRow("Relationship:", val('relationship'), y);
  y = fieldRow("Phone Number:", val('kinPhone'), y);
  y = fieldRow("Address:", val('kinAddress'), y);
  if (val('kinOccupation')) y = fieldRow("Occupation:", val('kinOccupation'), y);
  y += 10;

  if (val('altKinName') || val('altKinPhone')) {
    doc.setFont('times', 'bold'); doc.setFontSize(10.5);
    doc.text('ALTERNATE NEXT OF KIN', m, y);
    y += 18;
    y = fieldRow("Full Name:", val('altKinName'), y);
    y = fieldRow("Phone Number:", val('altKinPhone'), y);
    y += 10;
  }

  doc.setDrawColor(210);
  doc.line(m, y, pw - m, y);
  y += 24;

  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.text('DECLARATION', m, y);
  y += 18;
  doc.setFont('times', 'normal');
  doc.setFontSize(10.5);
  const lines = doc.splitTextToSize(declarationFor(currentType), pw - m * 2);
  lines.forEach(line => {
    if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = m; }
    doc.text(line, m, y);
    y += 16;
  });

  y += 40;
  const colWidth = (pw - m * 2 - 30) / 2;
  doc.setDrawColor(20);
  doc.line(m, y, m + colWidth, y);
  doc.line(m + colWidth + 30, y, m + colWidth * 2 + 30, y);
  y += 12;
  doc.setFontSize(9);
  doc.text("Applicant's Signature", m, y);
  doc.text("Next of Kin's Signature (optional)", m + colWidth + 30, y);

  return doc;
}

function buildActivePdf() {
  return hasPass ? buildProFormPdf() : buildBasicPdf();
}

function markFreeUsedIfNeeded() {
  if (!hasPass && !freeUsed) {
    localStorage.setItem(FREE_USED_KEY, '1');
    freeUsed = true;
  }
}

document.getElementById('downloadPdfBtn').addEventListener('click', () => {
  if (!hasPass && freeUsed) {
    showMsg("You've used your free document — unlock the Pro template on the right to continue.", 'error');
    document.getElementById('lockOverlay').classList.add('show');
    return;
  }
  try {
    const doc = buildActivePdf();
    KoboExport.download(`next-of-kin-form-${currentType}.pdf`, doc);
    markFreeUsedIfNeeded();
    if (!hasPass) {
      showMsg('Downloaded. That was your free document — the Pro template unlocks unlimited use.', 'success');
      document.getElementById('freeNote').style.display = 'none';
    }
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  if (!hasPass && freeUsed) {
    showMsg("You've used your free document — unlock the Pro template on the right to continue.", 'error');
    document.getElementById('lockOverlay').classList.add('show');
    return;
  }
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = buildActivePdf();
    await KoboExport.shareWhatsApp(`next-of-kin-form-${currentType}.pdf`, 'My Next of Kin Form, made with KoboDocs.', doc);
    markFreeUsedIfNeeded();
    if (!hasPass) document.getElementById('freeNote').style.display = 'none';
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
    await KoboSubscribe.start('init-tool-pass-payment', { tool_key: 'next_of_kin_form', callback_path: '/next-of-kin-form/' });
  } catch {
    btn.textContent = original;
    btn.disabled = false;
  }
});

// ---------- Access check ----------
async function checkAccess() {
  freeUsed = !!localStorage.getItem(FREE_USED_KEY);

  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const session = await window.KoboAuth.getSession();
  if (session) {
    try {
      const res = await fetch('https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1/check-tool-pass-access', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_key: 'next_of_kin_form' })
      });
      const data = await res.json();
      hasPass = !!data.allowed;
    } catch {
      hasPass = false;
    }
  }

  document.getElementById('altKinGroup').style.display = hasPass ? '' : 'none';
  document.getElementById('freeNote').style.display = (hasPass || !freeUsed) ? '' : 'none';
  if (hasPass) {
    document.getElementById('freeNote').textContent = 'Pro unlocked — unlimited documents with the form-style template.';
    document.getElementById('freeNote').style.display = '';
  }

  if (hasPass || !freeUsed) {
    document.getElementById('nContent').classList.remove('locked');
    document.getElementById('lockOverlay').classList.remove('show');
  } else {
    document.getElementById('nContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
  }

  renderPreview();
}

checkAccess();
KoboSubscribe.resumePendingIfAny().then(() => setTimeout(checkAccess, 500));
