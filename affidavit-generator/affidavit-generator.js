let currentType = 'name_change';
let hasAccess = false;

function val(id) { return document.getElementById(id).value.trim(); }
function fmtDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '[date]';
}

function titleFor(type) {
  return {
    name_change: 'Affidavit of Change of Name',
    age_declaration: 'Affidavit of Age Declaration',
    loss_of_document: 'Affidavit of Loss of Document',
    newspaper_text: 'Newspaper Publication Notice'
  }[type];
}

function clausesFor(type) {
  const name = val('deponentName') || '[Your full name]';
  const gender = document.getElementById('gender').value.toLowerCase();
  const occupation = val('occupation') || '[occupation]';
  const address = val('address') || '[address]';

  const preamble = `I, ${name}, ${gender}, ${occupation}, of ${address}, do hereby make oath and state as follows:`;

  let body = [];
  if (type === 'name_change') {
    const formerName = val('formerName') || '[former name]';
    const newName = val('newName') || '[new name]';
    const reason = val('nameChangeReason');
    body = [
      'That I am the deponent herein and by virtue of that fact I am conversant with the facts of this matter.',
      `That I was formerly known and addressed as ${formerName}.`,
      `That I now wish to be known and addressed as ${newName}${reason ? ', ' + reason.replace(/^e\.g\.\s*/i, '').toLowerCase() : ''}.`,
      `That ${formerName} and ${newName} refer to one and the same person.`,
      'That all documents, records and certificates bearing my former name remain valid and refer to me.',
      'That I know and understand the contents of this affidavit to be true and correct.'
    ];
  } else if (type === 'age_declaration') {
    const dob = fmtDate(val('declaredDob'));
    const source = val('ageSource') || 'in the absence of a birth certificate, based on information given to me by my parents';
    body = [
      'That I am the deponent herein.',
      `That I was born on ${dob}.`,
      `That this date of birth is declared ${source}.`,
      'That I am making this declaration to serve as a record of my date of birth where an official record is not available.',
      'That I know and understand the contents of this affidavit to be true and correct.'
    ];
  } else if (type === 'loss_of_document') {
    const docType = val('lostDocType') || '[document]';
    const lostDate = fmtDate(val('lostDate'));
    const lostPlace = val('lostPlace') || '[place]';
    const circumstances = val('lostCircumstances') || '[circumstances]';
    const policeRef = val('policeRef');
    body = [
      `That I am the deponent herein and the rightful owner of my ${docType}.`,
      `That my ${docType} got lost/misplaced on ${lostDate} at ${lostPlace} under the following circumstances: ${circumstances}.`,
      policeRef ? `That this incident was reported to the police, reference number ${policeRef}.` : 'That I have made diligent efforts to locate the said document without success.',
      `That I am making this affidavit to enable me obtain a duplicate or replacement of the said ${docType}.`,
      'That I know and understand the contents of this affidavit to be true and correct.'
    ];
  }

  return { preamble, body };
}

function buildSwornBody(type) {
  const { preamble, body } = clausesFor(type);
  const numbered = body.map((c, i) => `${i + 1}. ${c}`).join('\n\n');
  return `${preamble}\n\n${numbered}\n\nAnd I make this solemn declaration conscientiously believing the same to be true and in accordance with the Oaths Act.`;
}

function buildNewspaperBody() {
  const formerName = val('formerName') || '[former name]';
  const newName = val('newName') || '[new name]';
  const state = val('state') || '[State]';
  const date = fmtDate(val('affDate'));
  return `NOTICE OF CHANGE OF NAME\n\nI, ${formerName}, now wish to be known and addressed as ${newName}. All documents bearing my former name remain valid and refer to me.\n\n${state} — ${date}`;
}

function renderAffidavit() {
  const content = document.getElementById('affContent');
  const isNewspaper = currentType === 'newspaper_text';

  if (isNewspaper) {
    content.innerHTML = `
      <div class="aff-title">${titleFor(currentType)}</div>
      <div class="aff-clause" style="white-space:pre-line; text-align:center;">${buildNewspaperBody()}</div>
    `;
    return;
  }

  const { preamble, body } = clausesFor(currentType);
  const state = val('state') || '[State]';
  const date = fmtDate(val('affDate'));

  content.innerHTML = `
    <div class="aff-title">${titleFor(currentType)}</div>
    <div class="aff-court">SWORN AT THE ${state.toUpperCase()} HIGH COURT REGISTRY</div>
    <div class="aff-clause">${preamble}</div>
    ${body.map((c, i) => `<div class="aff-clause"><span class="num">${i + 1}.</span>${c}</div>`).join('')}
    <div class="aff-sworn">And I make this solemn declaration conscientiously believing the same to be true and in accordance with the Oaths Act.</div>
    <div class="aff-sworn">Sworn to at the ${state} High Court Registry this ${date}.</div>
    <div class="aff-sign-row">
      <div class="aff-sign-block">Deponent's signature</div>
      <div class="aff-sign-block">Before me: Commissioner for Oaths</div>
    </div>
  `;
}

document.getElementById('typeTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  currentType = btn.dataset.type;
  document.querySelectorAll('#typeTabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.aff-fields').forEach(f => f.classList.remove('active'));
  const fields = document.querySelector(`.aff-fields[data-fields="${currentType}"]`);
  if (fields) fields.classList.add('active');
  renderAffidavit();
});

document.querySelectorAll('.form-panel input, .form-panel textarea, .form-panel select').forEach(el => {
  el.addEventListener('input', renderAffidavit);
  el.addEventListener('change', renderAffidavit);
});

document.getElementById('affDate').value = new Date().toISOString().split('T')[0];
renderAffidavit();

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

function buildAffidavitPdf() {
  const name = val('deponentName') || 'Deponent';
  const isNewspaper = currentType === 'newspaper_text';
  return KoboExport.buildLetterPdf({
    letterhead: titleFor(currentType),
    dateLine: isNewspaper ? '' : `Deponent: ${name}`,
    bodyText: isNewspaper ? buildNewspaperBody() : buildSwornBody(currentType)
  });
}

document.getElementById('downloadPdfBtn').addEventListener('click', () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  try {
    const doc = buildAffidavitPdf();
    KoboExport.download(`${currentType}-affidavit.pdf`, doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = buildAffidavitPdf();
    await KoboExport.shareWhatsApp(`${currentType}-affidavit.pdf`, `${titleFor(currentType)}, made with KoboDocs.`, doc);
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
    await KoboSubscribe.start('init-tool-pass-payment', { tool_key: 'affidavit_generator', callback_path: '/affidavit-generator/' });
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
      body: JSON.stringify({ tool_key: 'affidavit_generator' })
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

checkAccess();
KoboSubscribe.resumePendingIfAny().then(() => setTimeout(checkAccess, 500));
