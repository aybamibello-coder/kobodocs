let currentType = 'schengen';
let hasAccess = false;

function val(id) { return document.getElementById(id).value.trim(); }
function fmtDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '[date]';
}

function buildBody(type) {
  const name = val('fullName') || '[Your full name]';
  const passportNo = val('passportNo') || '[Passport number]';
  const destination = val('destination') || '[destination]';
  const purpose = val('purpose') || 'Tourism';
  const from = fmtDate(val('travelFrom'));
  const to = fmtDate(val('travelTo'));
  const accommodation = val('accommodation') || '[accommodation details]';
  const employer = val('employer') || '[employer/business name]';
  const position = val('position') || '[position]';
  const sponsor = val('sponsor') || 'Self-sponsored';
  const homeTies = val('homeTies') || '[reasons you will return home]';
  const invitation = val('invitation');

  const intro = {
    schengen: `I am writing to support my application for a Schengen visa to visit ${destination} for the purpose of ${purpose.toLowerCase()}, from ${from} to ${to}.`,
    uk: `I am writing in support of my application for a UK visit visa to travel to ${destination} for the purpose of ${purpose.toLowerCase()}, from ${from} to ${to}.`,
    us: `I am writing to support my application for a US nonimmigrant visa to visit ${destination} for the purpose of ${purpose.toLowerCase()}, from ${from} to ${to}.`
  }[type];

  const financial = {
    schengen: `My trip is ${sponsor.toLowerCase().startsWith('self') ? 'fully self-funded' : `sponsored by ${sponsor}`}. I am employed at ${employer} as ${position}, and I have arranged accommodation at ${accommodation}.`,
    uk: `Regarding funding, ${sponsor.toLowerCase().startsWith('self') ? 'I am funding this trip myself from my own savings and income' : `this trip is sponsored by ${sponsor}`}. I currently work at ${employer} as ${position}. My accommodation for the trip is ${accommodation}.`,
    us: `${sponsor.toLowerCase().startsWith('self') ? 'I will be funding this trip from my own resources' : `This trip is sponsored by ${sponsor}`}. I am currently employed at ${employer} in the position of ${position}, and I have booked accommodation at ${accommodation}.`
  }[type];

  const ties = {
    schengen: `I intend to return to Nigeria at the end of my trip. My ties to home include: ${homeTies}`,
    uk: `I have every intention of returning to Nigeria once my visit concludes. My ties to Nigeria include: ${homeTies}`,
    us: `I have strong ties to Nigeria that will ensure my return at the conclusion of this trip, including: ${homeTies}`
  }[type];

  const invitationLine = invitation ? `\n\n${invitation}` : '';

  return `To the Visa Officer,\n\n${intro}\n\n${financial}\n\n${ties}${invitationLine}\n\nI have enclosed my passport, flight itinerary, and supporting documents with this application. I would be grateful for your favourable consideration of my visa application.\n\nYours faithfully,\n${name}\nPassport No: ${passportNo}`;
}

function renderLetter() {
  const content = document.getElementById('letterContent');
  const name = val('fullName') || 'Your Full Name';

  const letterhead = document.createElement('div');
  letterhead.className = 'letterhead';
  letterhead.textContent = name;

  const dateLine = document.createElement('div');
  dateLine.className = 'letter-date';
  dateLine.textContent = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  const body = document.createElement('p');
  body.textContent = buildBody(currentType);

  content.innerHTML = '';
  content.appendChild(letterhead);
  content.appendChild(dateLine);
  content.appendChild(body);
}

document.getElementById('typeTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  currentType = btn.dataset.type;
  document.querySelectorAll('#typeTabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderLetter();
});

document.querySelectorAll('.form-panel input, .form-panel textarea, .form-panel select').forEach(el => {
  el.addEventListener('input', renderLetter);
  el.addEventListener('change', renderLetter);
});

renderLetter();

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

function buildVisaLetterPdf() {
  const name = val('fullName') || 'Your Full Name';
  return KoboExport.buildLetterPdf({
    letterhead: name,
    dateLine: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    bodyText: buildBody(currentType)
  });
}

document.getElementById('downloadPdfBtn').addEventListener('click', () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  try {
    const doc = buildVisaLetterPdf();
    KoboExport.download(`visa-cover-letter-${currentType}.pdf`, doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = buildVisaLetterPdf();
    await KoboExport.shareWhatsApp(`visa-cover-letter-${currentType}.pdf`, `Visa cover letter (${currentType}), made with KoboDocs.`, doc);
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
    await KoboSubscribe.start('init-tool-pass-payment', { tool_key: 'visa_cover_letter', callback_path: '/visa-cover-letter/' });
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
    document.getElementById('letterDoc').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
    return;
  }

  try {
    const res = await fetch('https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1/check-visa-letter-access', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    const data = await res.json();
    hasAccess = !!data.allowed;
  } catch {
    hasAccess = false;
  }

  if (hasAccess) {
    document.getElementById('letterDoc').classList.remove('locked');
    document.getElementById('lockOverlay').classList.remove('show');
  } else {
    document.getElementById('letterDoc').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
  }
}

checkAccess();
KoboSubscribe.resumePendingIfAny().then(() => setTimeout(checkAccess, 500));
