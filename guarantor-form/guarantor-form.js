// ---------- Guarantor's Form Generator: first document free, then a one-time Pro pass ----------
let currentType = 'rent';
let hasPass = false;
let freeUsed = false;

const FREE_USED_KEY = 'kobo_guarantor_free_used';

function val(id) { return document.getElementById(id).value.trim(); }
function fmtDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '[date]';
}

function titleFor(type) {
  return {
    rent: "Guarantor's Form — Tenancy",
    employment: "Guarantor's Form — Employment",
    school: "Guarantor's Form — School / Hostel Admission",
    loan: "Guarantor's Form — Personal Loan",
    custom: "Guarantor's Form"
  }[type];
}

function declarationFor(type) {
  const guarantor = val('guarantorName') || '[Guarantor\'s full name]';
  const occupation = val('guarantorOccupation') || '[occupation]';
  const address = val('guarantorAddress') || '[address]';
  const phone = val('guarantorPhone') || '[phone number]';
  const applicant = val('applicantName') || '[Applicant\'s full name]';
  const relationship = val('relationship') || '[relationship]';
  const years = val('yearsKnown') || '[number]';

  const opening = `I, ${guarantor}, ${occupation}, of ${address}, phone number ${phone}, do hereby agree to stand as guarantor for ${applicant}, my ${relationship}, whom I have known for ${years} years.`;

  let specific = '';
  if (type === 'rent') {
    const property = val('propertyAddress') || '[property address]';
    const landlord = val('landlordName') || '[landlord/agent name]';
    specific = `This guarantee relates to the tenancy of ${property}, granted by ${landlord}. I undertake to be responsible for ${applicant}'s obligations under the tenancy agreement, including payment of rent and any damage to the property, should ${applicant} default or vacate the property in breach of the agreement.`;
  } else if (type === 'employment') {
    const employer = val('employerName') || '[employer name]';
    const position = val('positionApplied') || '[position]';
    const guarantorEmployer = val('guarantorEmployer') || '[guarantor\'s place of work]';
    specific = `This guarantee relates to the employment of ${applicant} with ${employer} as ${position}. I am currently employed at ${guarantorEmployer}, and I vouch for the character and conduct of ${applicant}, and undertake to be contacted regarding their conduct during their employment.`;
  } else if (type === 'school') {
    const institution = val('institutionName') || '[institution name]';
    const courseClass = val('courseClass') || '[course / class]';
    specific = `This guarantee relates to the admission of ${applicant} at ${institution} (${courseClass}). I confirm my willingness to be contacted regarding their conduct and welfare during their period of study or residence, and to be responsible for matters requiring a guardian's attention.`;
  } else if (type === 'loan') {
    const amount = val('loanAmount');
    const amountText = amount ? `₦${Number(amount).toLocaleString()}` : '[loan amount]';
    const lender = val('lenderName') || '[lender name]';
    const period = val('repaymentPeriod') || '[repayment period]';
    specific = `This guarantee relates to a loan of ${amountText} granted to ${applicant} by ${lender}, repayable over ${period}. I hereby guarantee repayment of this loan and undertake to be liable for the outstanding balance should ${applicant} default.`;
  } else {
    const purpose = val('customPurpose') || '[purpose]';
    const context = val('customContext');
    specific = `This guarantee is given in respect of: ${purpose}.${context ? ' ' + context : ''} I undertake to be responsible for ${applicant} in relation to this matter, to the extent required.`;
  }

  const closing = `I confirm that the information provided above is true and correct to the best of my knowledge.`;

  return `${opening} ${specific} ${closing}`;
}

function renderPreview() {
  const content = document.getElementById('gContent');
  const showWitness = hasPass && (val('witnessName') || val('witnessAddress'));

  content.innerHTML = `
    <div class="g-title">${titleFor(currentType)}</div>
    <div class="g-sub">Date: ${fmtDate(val('gDate'))}</div>
    <div class="g-clause">${declarationFor(currentType)}</div>
    <div class="g-sign-row">
      <div class="g-sign-block">Guarantor's Signature<br>${val('guarantorName') || '[Guarantor]'}</div>
      <div class="g-sign-block">Applicant's Signature<br>${val('applicantName') || '[Applicant]'}</div>
    </div>
    ${showWitness ? `
    <div class="g-sign-row">
      <div class="g-sign-block">Witness Signature<br>${val('witnessName')}</div>
      <div class="g-sign-block">Witness Address<br>${val('witnessAddress')}</div>
    </div>` : ''}
  `;
}

// ---------- Type tabs ----------
document.getElementById('typeTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  currentType = btn.dataset.type;
  document.querySelectorAll('#typeTabs button').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.g-fields').forEach(f => f.classList.toggle('active', f.dataset.fields === currentType));
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
    dateLine: `Date: ${fmtDate(val('gDate'))}`,
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
  doc.text(`Date: ${fmtDate(val('gDate'))}`, pw / 2, y, { align: 'center' });
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
    doc.line(m + 130, yPos + 2, m + (width || 300), yPos + 2);
    doc.setFont('times', 'normal');
    doc.text(value || '', m + 135, yPos);
    return yPos + 24;
  }

  y += 10;
  y = fieldRow("Guarantor's Full Name:", val('guarantorName'), y);
  y = fieldRow("Occupation:", val('guarantorOccupation'), y);
  y = fieldRow("Address:", val('guarantorAddress'), y);
  y = fieldRow("Phone Number:", val('guarantorPhone'), y);
  y += 8;
  y = fieldRow("Applicant's Full Name:", val('applicantName'), y);
  y = fieldRow("Relationship:", val('relationship'), y);
  y = fieldRow("Years Known:", val('yearsKnown'), y);
  y += 20;

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
  doc.text("Guarantor's Signature", m, y);
  doc.text("Applicant's Signature", m + colWidth + 30, y);

  if (val('witnessName') || val('witnessAddress')) {
    y += 40;
    doc.line(m, y, m + colWidth, y);
    doc.line(m + colWidth + 30, y, m + colWidth * 2 + 30, y);
    y += 12;
    doc.text(`Witness: ${val('witnessName') || ''}`, m, y);
    doc.text(`Witness Address: ${val('witnessAddress') || ''}`, m + colWidth + 30, y);
  }

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
    showMsg('You\'ve used your free document — unlock the Pro template on the right to continue.', 'error');
    document.getElementById('lockOverlay').classList.add('show');
    return;
  }
  try {
    const doc = buildActivePdf();
    KoboExport.download(`guarantor-form-${currentType}.pdf`, doc);
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
    showMsg('You\'ve used your free document — unlock the Pro template on the right to continue.', 'error');
    document.getElementById('lockOverlay').classList.add('show');
    return;
  }
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = buildActivePdf();
    await KoboExport.shareWhatsApp(`guarantor-form-${currentType}.pdf`, "Guarantor's Form, made with KoboDocs.", doc);
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
    await KoboSubscribe.start('init-tool-pass-payment', { tool_key: 'guarantor_form', callback_path: '/guarantor-form/' });
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
        body: JSON.stringify({ tool_key: 'guarantor_form' })
      });
      const data = await res.json();
      hasPass = !!data.allowed;
    } catch {
      hasPass = false;
    }
  }

  document.getElementById('witnessGroup').style.display = hasPass ? '' : 'none';
  document.getElementById('freeNote').style.display = (hasPass || !freeUsed) ? '' : 'none';
  if (hasPass) {
    document.getElementById('freeNote').textContent = 'Pro unlocked — unlimited documents with the form-style template.';
    document.getElementById('freeNote').style.display = '';
  }

  if (hasPass || !freeUsed) {
    document.getElementById('gContent').classList.remove('locked');
    document.getElementById('lockOverlay').classList.remove('show');
  } else {
    document.getElementById('gContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
  }

  renderPreview();
}

checkAccess();
KoboSubscribe.resumePendingIfAny().then(() => setTimeout(checkAccess, 500));
