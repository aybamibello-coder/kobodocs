KoboSubscribe.resumePendingIfAny();

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

let currentType = 'offer';
let isPro = false;

function fmtDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '[date]';
}

function val(id) { return document.getElementById(id).value.trim(); }

function buildBody(type) {
  const empName = val('empName') || '[Employee name]';
  const position = val('position') || '[Position]';
  const bizName = val('bizName') || '[Your business]';
  const effectiveDate = fmtDate(val('effectiveDate'));
  const signatory = val('signatory') || '[Signatory]';

  switch (type) {
    case 'offer':
      return `Dear ${empName},\n\nWe are pleased to offer you the position of ${position} at ${bizName}, effective ${effectiveDate}.\n\nYour monthly salary will be ₦${val('offerSalary') || '[amount]'}. Please confirm your acceptance of this offer in writing.\n\nWe look forward to welcoming you to the team.\n\nYours sincerely,\n${signatory}`;
    case 'appointment':
      return `Dear ${empName},\n\nFollowing your acceptance of our offer, we are pleased to confirm your appointment as ${position} at ${bizName}, effective ${effectiveDate}.\n\nYour monthly salary is ₦${val('apptSalary') || '[amount]'}. You will serve a probation period of ${val('apptProbation') || '[probation period]'}, after which your employment will be reviewed for confirmation.\n\nWe look forward to a productive working relationship.\n\nYours sincerely,\n${signatory}`;
    case 'confirmation':
      return `Dear ${empName},\n\nWe are pleased to inform you that your appointment as ${position} at ${bizName} has been confirmed, effective ${effectiveDate}, following the successful completion of your probation period.\n\nAll terms of your employment remain as previously communicated.\n\nCongratulations, and we look forward to your continued contribution.\n\nYours sincerely,\n${signatory}`;
    case 'promotion': {
      const newSalary = val('newSalary');
      return `Dear ${empName},\n\nWe are pleased to inform you of your promotion to ${val('newPosition') || '[new position]'} at ${bizName}, effective ${effectiveDate}.${newSalary ? `\n\nYour revised monthly salary will be ₦${newSalary}.` : ''}\n\nThis promotion reflects your contribution and commitment to the team. Congratulations.\n\nYours sincerely,\n${signatory}`;
    }
    case 'query':
      return `Dear ${empName},\n\nThis letter serves as a formal query regarding the following:\n\n${val('queryReason') || '[details of the incident]'}\n\nPlease provide a written explanation by ${fmtDate(val('responseDeadline'))}. Failure to respond may result in further disciplinary action.\n\nYours sincerely,\n${signatory}`;
    case 'termination':
      return `Dear ${empName},\n\nWe regret to inform you that your employment with ${bizName} as ${position} will be terminated effective ${effectiveDate}.\n\nReason: ${val('termReason') || '[reason]'}\n\nPlease arrange to hand over all company property and complete any outstanding tasks before your last working day. You will receive your final entitlements in accordance with your contract and applicable labour law.\n\nWe thank you for your service and wish you well in your future endeavours.\n\nYours sincerely,\n${signatory}`;
    default:
      return '';
  }
}

function renderLetter() {
  const bizName = val('bizName') || 'Your Business Name';
  const doc = document.getElementById('letterDoc');
  doc.innerHTML = `
    <div class="letterhead">${bizName}</div>
    <div class="letter-date">${fmtDate(val('letterDate')) || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
    <p>${buildBody(currentType)}</p>
  `;
}

document.getElementById('typeTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  currentType = btn.dataset.type;
  document.querySelectorAll('#typeTabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.letter-fields').forEach(f => f.classList.remove('active'));
  const fields = document.querySelector(`.letter-fields[data-fields="${currentType}"]`);
  if (fields) fields.classList.add('active');
  renderLetter();
});

document.querySelectorAll('.form-panel input, .form-panel textarea').forEach(el => {
  el.addEventListener('input', renderLetter);
});

document.getElementById('letterDate').value = new Date().toISOString().split('T')[0];
renderLetter();

function buildHrLetterPdf() {
  const bizName = val('bizName') || 'Your Business Name';
  const dateLine = fmtDate(val('letterDate')) || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  return KoboExport.buildLetterPdf({
    letterhead: bizName,
    dateLine,
    bodyText: buildBody(currentType)
  });
}

document.getElementById('downloadPdfBtn').addEventListener('click', () => {
  try {
    const doc = buildHrLetterPdf();
    KoboExport.download(`${currentType}-letter.pdf`, doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = buildHrLetterPdf();
    const caption = `${currentType.charAt(0).toUpperCase() + currentType.slice(1)} letter for ${val('empName') || 'employee'}, made with KoboDocs.`;
    const result = await KoboExport.shareWhatsApp(`${currentType}-letter.pdf`, caption, doc);
    if (result === 'downloaded') {
      showMsg('PDF downloaded — attach it in WhatsApp. Opening WhatsApp with the caption now.', 'success');
    }
  } catch (err) {
    if (err.name !== 'AbortError') showMsg('Could not prepare the PDF: ' + err.message, 'error');
  } finally {
    btn.textContent = original;
  }
});

// ---------- Pro gating: saved employee list ----------
(async function checkPro() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const profile = await window.KoboAuth.getProfile();
  const active = profile && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date();
  isPro = !!(profile && active && (profile.plan === 'pro' || profile.plan === 'business'));

  if (!isPro) return;

  document.getElementById('proLockBanner').style.display = 'none';
  document.getElementById('savedEmployeeRow').style.display = 'block';

  const supabase = window.KoboAuth.supabase;
  const { data: employees } = await supabase.from('employees').select('id, name, position').order('name');

  const select = document.getElementById('savedEmployeeSelect');
  if (!employees || !employees.length) {
    select.innerHTML = '<option value="">No saved employees yet</option>';
    return;
  }
  select.innerHTML = '<option value="">Select an employee…</option>' +
    employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');

  select.addEventListener('change', () => {
    const emp = employees.find(e => e.id === select.value);
    if (!emp) return;
    document.getElementById('empName').value = emp.name || '';
    document.getElementById('position').value = emp.position || '';
    renderLetter();
  });
})();
