let hasAccess = false;

function val(id) { return document.getElementById(id).value.trim(); }
function fmtDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '[date]';
}

document.getElementById('hasMinorChildren').addEventListener('change', (e) => {
  document.getElementById('guardianFields').classList.toggle('show', e.target.checked);
  renderWill();
});

function buildWillText() {
  const name = val('testatorName') || '[Your full name]';
  const address = val('testatorAddress') || '[Your address]';
  const maritalStatus = document.getElementById('maritalStatus').value;
  const date = fmtDate(val('willDate'));
  const executorName = val('executorName') || '[Executor\'s name]';
  const executorAddress = val('executorAddress') || '[Executor\'s address]';
  const altExecutorName = val('altExecutorName');
  const hasMinors = document.getElementById('hasMinorChildren').checked;
  const guardianName = val('guardianName') || '[Guardian\'s name]';
  const guardianRelationship = val('guardianRelationship') || '[relationship]';
  const residuary = val('residuary') || '[residuary beneficiary]';
  const funeralWishes = val('funeralWishes');
  const witness1 = val('witness1') || '[witness name, address, occupation]';
  const witness2 = val('witness2') || '[witness name, address, occupation]';

  const beneficiaries = [1, 2, 3]
    .map(i => ({ name: val(`ben${i}Name`), gift: val(`ben${i}Gift`) }))
    .filter(b => b.name || b.gift);

  const preamble = `THIS IS THE LAST WILL AND TESTAMENT of me, ${name}, of ${address}, ${maritalStatus}, made this ${date}.\n\nI HEREBY REVOKE all former Wills and Codicils made by me at any time, and declare this to be my Last Will and Testament.`;

  const executorClause = `1. APPOINTMENT OF EXECUTOR\n\nI APPOINT ${executorName} of ${executorAddress} to be the Executor of this my Will.${altExecutorName ? ` If ${executorName} is unable or unwilling to act, I appoint ${altExecutorName} as alternate Executor.` : ''}`;

  const guardianClause = hasMinors
    ? `\n\n2. APPOINTMENT OF GUARDIAN\n\nI APPOINT ${guardianName} (${guardianRelationship}) to be the Guardian of any of my children who are under the age of 18 years at the time of my death.`
    : '';

  const benNumber = hasMinors ? 3 : 2;
  const beneficiaryLines = beneficiaries.length
    ? beneficiaries.map((b, i) => `  (${String.fromCharCode(97 + i)}) To ${b.name || '[beneficiary]'}: ${b.gift || '[gift/share]'}.`).join('\n')
    : '  [No specific bequests entered]';
  const beneficiaryClause = `\n\n${benNumber}. SPECIFIC BEQUESTS\n\nI GIVE the following specific gifts:\n${beneficiaryLines}`;

  const residuaryClause = `\n\n${benNumber + 1}. RESIDUARY ESTATE\n\nI GIVE all the rest, residue, and remainder of my estate, of whatever kind and wherever situated, not otherwise specifically disposed of by this Will, to ${residuary}.`;

  const funeralClause = funeralWishes
    ? `\n\n${benNumber + 2}. FUNERAL WISHES\n\n${funeralWishes}`
    : '';

  const closing = `\n\nIN WITNESS WHEREOF I have set my hand to this my Last Will and Testament this ${date}.\n\nSIGNED by the abovenamed Testator, ${name}, as and for his/her Last Will and Testament, in the presence of us, both present at the same time, who at his/her request, in his/her presence, and in the presence of each other, have hereunto subscribed our names as witnesses:\n\n_________________________\n${name} (Testator)\n\nWITNESS 1:\n_________________________\n${witness1}\n\nWITNESS 2:\n_________________________\n${witness2}`;

  return `${preamble}\n\n${executorClause}${guardianClause}${beneficiaryClause}${residuaryClause}${funeralClause}${closing}`;
}

function renderWill() {
  const content = document.getElementById('willContent');
  content.innerHTML = `
    <div class="will-title">Last Will and Testament</div>
    <div style="white-space:pre-line;">${buildWillText()}</div>
  `;
}

document.querySelectorAll('.form-panel input, .form-panel select, .form-panel textarea').forEach(el => {
  el.addEventListener('input', renderWill);
  el.addEventListener('change', renderWill);
});

document.getElementById('willDate').value = new Date().toISOString().split('T')[0];
renderWill();

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

function buildWillPdf() {
  return KoboExport.buildLetterPdf({
    letterhead: 'Last Will and Testament',
    dateLine: fmtDate(val('willDate')),
    bodyText: buildWillText()
  });
}

document.getElementById('downloadPdfBtn').addEventListener('click', () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  try {
    const doc = buildWillPdf();
    KoboExport.download('last-will-and-testament.pdf', doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = buildWillPdf();
    await KoboExport.shareWhatsApp('last-will-and-testament.pdf', 'My Will draft, made with KoboDocs.', doc);
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
    await KoboSubscribe.start('init-tool-pass-payment', { tool_key: 'will_generator', callback_path: '/will-generator/' });
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
    await KoboSubscribe.start('init-tool-pass-payment', { tool_key: 'estate_bundle', callback_path: '/will-generator/' });
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
    document.getElementById('willContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
    return;
  }

  try {
    const res = await fetch('https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1/check-tool-pass-access', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_key: 'will_generator' })
    });
    const data = await res.json();
    hasAccess = !!data.allowed;
  } catch {
    hasAccess = false;
  }

  if (hasAccess) {
    document.getElementById('willContent').classList.remove('locked');
    document.getElementById('lockOverlay').classList.remove('show');
  } else {
    document.getElementById('willContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
  }
}

checkAccess();
KoboSubscribe.resumePendingIfAny().then(() => setTimeout(checkAccess, 500));
