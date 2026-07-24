let hasAccess = false;

function val(id) { return document.getElementById(id).value.trim(); }
function fmtDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '[date]';
}

function buildDeedText() {
  const assignorName = val('assignorName') || '[Seller\'s name]';
  const assignorAddress = val('assignorAddress') || '[Seller\'s address]';
  const assigneeName = val('assigneeName') || '[Buyer\'s name]';
  const assigneeAddress = val('assigneeAddress') || '[Buyer\'s address]';
  const propertyAddress = val('propertyAddress') || '[property location/description]';
  const propertySize = val('propertySize') || '[property size]';
  const surveyPlanNo = val('surveyPlanNo');
  const purchasePrice = val('purchasePrice') || '[purchase price]';
  const date = fmtDate(val('deedDate'));
  const witness1 = val('witness1') || '[witness name, address, occupation]';
  const witness2 = val('witness2') || '[witness name, address, occupation]';

  const intro = `THIS DEED OF ASSIGNMENT is made this ${date}\n\nBETWEEN\n\n${assignorName} of ${assignorAddress} (hereinafter called "the Assignor", which expression shall where the context so admits include his/her heirs, successors-in-title and assigns) of the one part;\n\nAND\n\n${assigneeName} of ${assigneeAddress} (hereinafter called "the Assignee", which expression shall where the context so admits include his/her heirs, successors-in-title and assigns) of the other part.`;

  const whereas = `WHEREAS:\n\n1. The Assignor is the beneficial owner of ALL THAT piece or parcel of land situate at ${propertyAddress}, measuring approximately ${propertySize}${surveyPlanNo ? `, and more particularly delineated in Survey Plan No. ${surveyPlanNo}` : ''}.\n\n2. The Assignor has agreed to sell and the Assignee has agreed to purchase the said land for the sum of ₦${purchasePrice}, which sum has been paid in full by the Assignee to the Assignor, the receipt of which the Assignor hereby acknowledges.`;

  const witnesseth = `NOW THIS DEED WITNESSES as follows:\n\n1. In consideration of the sum of ₦${purchasePrice} paid by the Assignee to the Assignor, the Assignor as beneficial owner HEREBY ASSIGNS unto the Assignee ALL THAT piece or parcel of land situate at ${propertyAddress}, TOGETHER WITH all rights, easements and appurtenances thereto belonging, TO HOLD the same unto the Assignee absolutely.\n\n2. The Assignor covenants that he/she has good right, full power and absolute authority to assign the said property.\n\n3. The Assignor covenants that the said property is free from all encumbrances, charges, liens and adverse claims whatsoever.\n\n4. The Assignee shall henceforth hold, possess and enjoy the said property without interruption from the Assignor or any person claiming through him/her.`;

  const closing = `IN WITNESS WHEREOF the parties have set their hands the day and year first above written.\n\nSIGNED, SEALED AND DELIVERED by the ASSIGNOR:\n_________________________\n${assignorName}\n\nIN THE PRESENCE OF: ${witness1}\n\nSIGNED, SEALED AND DELIVERED by the ASSIGNEE:\n_________________________\n${assigneeName}\n\nIN THE PRESENCE OF: ${witness2}`;

  return `${intro}\n\n${whereas}\n\n${witnesseth}\n\n${closing}`;
}

function renderDeed() {
  const content = document.getElementById('deedContent');
  content.innerHTML = `
    <div class="deed-title">Deed of Assignment</div>
    <div class="deed-clause" style="white-space:pre-line;">${buildDeedText()}</div>
  `;
}

document.querySelectorAll('.form-panel input').forEach(el => {
  el.addEventListener('input', renderDeed);
  el.addEventListener('change', renderDeed);
});

document.getElementById('deedDate').value = new Date().toISOString().split('T')[0];
renderDeed();

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

function buildDeedPdf() {
  return KoboExport.buildLetterPdf({
    letterhead: 'Deed of Assignment',
    dateLine: fmtDate(val('deedDate')),
    bodyText: buildDeedText()
  });
}

document.getElementById('downloadPdfBtn').addEventListener('click', () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  try {
    const doc = buildDeedPdf();
    KoboExport.download('deed-of-assignment.pdf', doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = buildDeedPdf();
    await KoboExport.shareWhatsApp('deed-of-assignment.pdf', 'Deed of Assignment draft, made with KoboDocs.', doc);
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
    await KoboSubscribe.start('init-tool-pass-payment', { tool_key: 'land_sale_agreement', callback_path: '/land-sale-agreement/' });
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
    document.getElementById('deedContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
    return;
  }

  try {
    const res = await fetch('https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1/check-tool-pass-access', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_key: 'land_sale_agreement' })
    });
    const data = await res.json();
    hasAccess = !!data.allowed;
  } catch {
    hasAccess = false;
  }

  if (hasAccess) {
    document.getElementById('deedContent').classList.remove('locked');
    document.getElementById('lockOverlay').classList.remove('show');
  } else {
    document.getElementById('deedContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
  }
}

checkAccess();
KoboSubscribe.resumePendingIfAny().then(() => setTimeout(checkAccess, 500));
