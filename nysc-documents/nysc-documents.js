let currentType = 'relocation';
let isPro = false;

document.getElementById('upgradeProBtn').addEventListener('click', async () => {
  const btn = document.getElementById('upgradeProBtn');
  const original = btn.textContent;
  btn.textContent = 'Redirecting…';
  try {
    await KoboSubscribe.start('init-payment', { billing_cycle: 'monthly' });
  } catch {
    btn.textContent = original;
  }
});

function val(id) { return document.getElementById(id).value.trim(); }
function fmtDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '[date]';
}

function titleFor(type) {
  return {
    relocation: 'Application for Relocation/Redeployment',
    exemption: 'Application for Exemption from National Service',
    discharge: 'Inquiry Regarding Certificate of National Service',
    ppa: 'Letter of Introduction for Corps Member'
  }[type];
}

function buildBody(type) {
  const corpsName = val('corpsName') || '[Corps member\'s name]';
  const stateCode = val('stateCode') || '[State code]';
  const callUpNo = val('callUpNo') || '[Call-up number]';
  const batch = val('batch') || '[Batch/Stream]';
  const deployState = val('deployState') || '[state of deployment]';

  if (type === 'relocation') {
    const requestedState = val('requestedState') || '[requested state]';
    const reason = val('relocationReason') || '[reason for relocation]';
    return `The Director General,\nNational Youth Service Corps,\nAbuja.\n\nThrough: The State Coordinator, NYSC ${deployState}\n\nDear Sir/Ma,\n\nAPPLICATION FOR RELOCATION/REDEPLOYMENT\n\nI, ${corpsName}, with State Code ${stateCode} and Call-up Number ${callUpNo} (${batch}), currently serving in ${deployState}, wish to apply for relocation to ${requestedState}.\n\nReason for request: ${reason}\n\nI have attached the necessary supporting documents to substantiate this request and would be grateful for your favourable consideration.\n\nYours faithfully,\n${corpsName}`;
  }

  if (type === 'exemption') {
    const ground = val('exemptionGround') || '[grounds for exemption]';
    return `The Director General,\nNational Youth Service Corps,\nAbuja.\n\nDear Sir/Ma,\n\nAPPLICATION FOR EXEMPTION FROM NATIONAL SERVICE\n\nI, ${corpsName}, with Call-up Number ${callUpNo} (${batch}), wish to apply for exemption from the National Youth Service Corps programme on the following grounds:\n\n${ground}\n\nI have enclosed the relevant supporting documents in support of this application and would be grateful for your favourable consideration.\n\nYours faithfully,\n${corpsName}`;
  }

  if (type === 'discharge') {
    const completionDate = fmtDate(val('completionDate'));
    const purpose = val('dischargeReason') || '[purpose of this inquiry]';
    return `The Local Government Inspector,\nNYSC ${deployState},\n\nDear Sir/Ma,\n\nINQUIRY REGARDING CERTIFICATE OF NATIONAL SERVICE\n\nI, ${corpsName}, with State Code ${stateCode} and Call-up Number ${callUpNo} (${batch}), completed my one year of national service on ${completionDate}.\n\nI am writing to ${purpose}.\n\nI would appreciate your guidance on the next steps and any outstanding requirements on my part.\n\nYours faithfully,\n${corpsName}`;
  }

  if (type === 'ppa') {
    const ppaName = val('ppaName') || '[PPA name]';
    const ppaAddress = val('ppaAddress') || '[PPA address]';
    const signatory = val('ppaSignatory') || '[Signatory name and title]';
    return `The Local Government Inspector,\nNYSC ${deployState},\n\nDear Sir/Ma,\n\nLETTER OF INTRODUCTION FOR CORPS MEMBER\n\nThis is to introduce ${corpsName}, with State Code ${stateCode} and Call-up Number ${callUpNo} (${batch}), who has been posted to ${ppaName}, situated at ${ppaAddress}, as Place of Primary Assignment.\n\nWe confirm that ${corpsName} has reported for duty and will be attached to our organisation for the duration of the service year.\n\nWe would be grateful for your cooperation in this regard.\n\nYours faithfully,\n${signatory}\nFor: ${ppaName}`;
  }

  return '';
}

function renderLetter() {
  const doc = document.getElementById('letterDoc');
  const watermark = isPro ? '' : '\n\n---\nMade with KoboDocs — kobodocs.com.ng';
  doc.innerHTML = `
    <div class="letterhead">${titleFor(currentType)}</div>
    <div class="letter-date">${fmtDate(val('letterDate')) || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
    <p>${buildBody(currentType)}${watermark}</p>
  `;
}

document.getElementById('typeTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  currentType = btn.dataset.type;
  document.querySelectorAll('#typeTabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.nysc-fields').forEach(f => f.classList.remove('active'));
  const fields = document.querySelector(`.nysc-fields[data-fields="${currentType}"]`);
  if (fields) fields.classList.add('active');
  renderLetter();
});

document.querySelectorAll('.form-panel input, .form-panel textarea').forEach(el => {
  el.addEventListener('input', renderLetter);
});

document.getElementById('letterDate').value = new Date().toISOString().split('T')[0];
renderLetter();

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

function buildNyscPdf() {
  const watermark = isPro ? '' : '\n\n---\nMade with KoboDocs — kobodocs.com.ng';
  return KoboExport.buildLetterPdf({
    letterhead: titleFor(currentType),
    dateLine: fmtDate(val('letterDate')),
    bodyText: buildBody(currentType) + watermark
  });
}

document.getElementById('downloadPdfBtn').addEventListener('click', async () => {
  try {
    const doc = await buildNyscPdf();
    KoboExport.download(`nysc-${currentType}-letter.pdf`, doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = await buildNyscPdf();
    await KoboExport.shareWhatsApp(`nysc-${currentType}-letter.pdf`, `${titleFor(currentType)}, made with KoboDocs.`, doc);
  } catch (err) {
    if (err.name !== 'AbortError') showMsg('Could not prepare the PDF: ' + err.message, 'error');
  } finally {
    btn.textContent = original;
  }
});

// ---------- Pro gating: watermark only ----------
(async function checkPro() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const profile = await window.KoboAuth.getProfile();
  const active = profile && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date();
  isPro = !!(profile && active && (profile.plan === 'pro' || profile.plan === 'business'));

  if (isPro) document.getElementById('proLockBanner').style.display = 'none';
  renderLetter();
})();
