let hasAccess = false;
let currentType = 'general';

function val(id) { return document.getElementById(id).value.trim(); }
function fmtDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '[date]';
}

const TYPE_NOTES = {
  general: 'Grants broad authority to act on your behalf for all lawful matters — the widest-reaching option. Consider a Specific Power of Attorney if you only need to authorize particular acts.',
  specific: 'Limits the attorney\'s authority to exactly what you describe below — the safer option when you only need one or two things handled.',
  abroad: 'Built for the common Japa situation: authorizing someone at home to manage your property, collect rent, pay bills, and handle your affairs while you\'re out of the country.'
};

const TYPE_PLACEHOLDERS = {
  specific: 'e.g. To collect rent on my property at Plot 14, Ajah, Lagos; to pay outgoing bills and taxes on the property; and to represent me in all matters relating to its management.',
  abroad: 'e.g. To manage and let my property at Plot 14, Ajah, Lagos, collect rent on my behalf, pay all outgoing bills, land use charge and taxes relating to the property, operate my bank account for the sole purpose of receiving rent and paying property-related expenses, and generally represent me in all matters relating to the property and my affairs in Nigeria during my absence.'
};

document.getElementById('typeTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  currentType = btn.dataset.type;
  document.querySelectorAll('#typeTabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('typeNote').textContent = TYPE_NOTES[currentType];

  const scopeWrap = document.getElementById('scopeFieldWrap');
  const scopeField = document.getElementById('scopeDescription');
  if (currentType === 'general') {
    scopeWrap.classList.remove('show');
  } else {
    scopeWrap.classList.add('show');
    scopeField.placeholder = TYPE_PLACEHOLDERS[currentType];
  }
  renderPoa();
});
// Show scope field by default since 'general' starts active but scope stays hidden — set initial state
document.getElementById('scopeFieldWrap').classList.remove('show');

function buildPoaText() {
  const donorName = val('donorName') || '[Your name]';
  const donorAddress = val('donorAddress') || '[Your address]';
  const doneeName = val('doneeName') || '[Attorney\'s name]';
  const doneeAddress = val('doneeAddress') || '[Attorney\'s address]';
  const date = fmtDate(val('poaDate'));
  const revocable = document.getElementById('revocable').value;
  const duration = val('duration') || (revocable === 'irrevocable' ? '12 months' : 'until revoked');
  const witness1 = val('witness1') || '[witness name, address, occupation]';
  const witness2 = val('witness2') || '[witness name, address, occupation]';

  let scope;
  if (currentType === 'general') {
    scope = 'all acts, deeds, and things which I could lawfully do if personally present, including but not limited to the management of my property, the conduct of banking and financial transactions, and representation in legal and administrative matters, as fully and effectually as I could do in my own person';
  } else {
    scope = val('scopeDescription') || '[describe the specific acts authorized]';
  }

  const heading = currentType === 'abroad' ? 'POWER OF ATTORNEY (MANAGEMENT OF AFFAIRS DURING ABSENCE ABROAD)' : 'POWER OF ATTORNEY';

  const intro = `KNOW ALL MEN BY THESE PRESENTS that I, ${donorName}, of ${donorAddress} (hereinafter called "the Donor"), DO HEREBY APPOINT ${doneeName}, of ${doneeAddress} (hereinafter called "the Donee"), to be my true and lawful Attorney, for me and in my name, and on my behalf, to do the following:`;

  const powers = `TO DO the following on my behalf: ${scope}.`;

  const revocabilityClause = revocable === 'irrevocable'
    ? `THIS POWER OF ATTORNEY is irrevocable for a fixed period of ${duration} from the date hereof, in accordance with the Powers of Attorney Act.`
    : `THIS POWER OF ATTORNEY is revocable, and shall remain in force ${duration}, unless sooner revoked by me in writing.`;

  const ratification = `AND I HEREBY UNDERTAKE to ratify and confirm whatever my said Attorney shall lawfully do, or cause to be done, by virtue of these presents.`;

  const notarizationNote = 'NOTE: Where this Power of Attorney is to be exercised outside Nigeria, it must be witnessed or certified by a Notary Public.';

  const closing = `IN WITNESS WHEREOF I have set my hand this ${date}.\n\nSIGNED, SEALED AND DELIVERED by the DONOR:\n_________________________\n${donorName}\n\nIN THE PRESENCE OF:\nWitness 1: ${witness1}\n_________________________\n\nWitness 2: ${witness2}\n_________________________`;

  return `${heading}\n\n${intro}\n\n${powers}\n\n${revocabilityClause}\n\n${ratification}\n\n${notarizationNote}\n\n${closing}`;
}

function renderPoa() {
  const content = document.getElementById('poaContent');
  content.innerHTML = `
    <div class="poa-title">Power of Attorney</div>
    <div style="white-space:pre-line;">${buildPoaText()}</div>
  `;
}

document.querySelectorAll('.form-panel input, .form-panel select, .form-panel textarea').forEach(el => {
  el.addEventListener('input', renderPoa);
  el.addEventListener('change', renderPoa);
});

document.getElementById('poaDate').value = new Date().toISOString().split('T')[0];
renderPoa();

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

function buildPoaPdf() {
  return KoboExport.buildLetterPdf({
    letterhead: 'Power of Attorney',
    dateLine: fmtDate(val('poaDate')),
    bodyText: buildPoaText()
  });
}

document.getElementById('downloadPdfBtn').addEventListener('click', async () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  try {
    const doc = await buildPoaPdf();
    KoboExport.download('power-of-attorney.pdf', doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = await buildPoaPdf();
    await KoboExport.shareWhatsApp('power-of-attorney.pdf', 'Power of Attorney draft, made with KoboDocs.', doc);
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
    await KoboSubscribe.start('init-tool-pass-payment', { tool_key: 'power_of_attorney', callback_path: '/power-of-attorney/' });
  } catch {
    btn.textContent = original;
    btn.disabled = false;
  }
});

document.getElementById('bundleLink').addEventListener('click', async (e) => {
  e.preventDefault();
  const link = e.target;
  const original = link.textContent;
  link.textContent = 'Redirecting…';
  try {
    await KoboSubscribe.start('init-tool-pass-payment', { tool_key: 'estate_bundle', callback_path: '/power-of-attorney/' });
  } catch {
    link.textContent = original;
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
    document.getElementById('poaContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
    return;
  }

  try {
    const res = await fetch('https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1/check-tool-pass-access', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_key: 'power_of_attorney' })
    });
    const data = await res.json();
    hasAccess = !!data.allowed;
  } catch {
    hasAccess = false;
  }

  if (hasAccess) {
    document.getElementById('poaContent').classList.remove('locked');
    document.getElementById('lockOverlay').classList.remove('show');
  } else {
    document.getElementById('poaContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
  }
}

checkAccess();
KoboSubscribe.resumePendingIfAny().then(() => setTimeout(checkAccess, 500));
