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

function buildClauses() {
  const freelancerName = val('freelancerName') || '[Freelancer name]';
  const clientName = val('clientName') || '[Client name]';
  const projectTitle = val('projectTitle') || '[project scope]';
  const deliverables = val('deliverables') || '[deliverables]';
  const startDate = fmtDate(val('startDate'));
  const endDate = fmtDate(val('endDate'));
  const fee = val('fee') || '[fee]';
  const revisions = val('revisions') || '2';
  const paymentTerms = val('paymentTerms') || 'Payment due in full on completion';
  const noticeDays = val('noticeDays') || '7';
  const includeConfidentiality = document.getElementById('includeConfidentiality').checked;

  const clauses = [
    `Scope of Work: ${freelancerName} ("the Freelancer") agrees to provide the following services to ${clientName} ("the Client"): ${projectTitle}. Deliverables include: ${deliverables}.`,
    `Timeline: Work shall commence on ${startDate} and be completed by ${endDate}.`,
    `Payment: The total fee for these services is ₦${fee}. Payment terms: ${paymentTerms}.`,
    `Revisions: This agreement includes ${revisions} round(s) of revisions. Additional revisions beyond this will be billed separately at a rate to be agreed between both parties.`,
    'Ownership: Upon receipt of full payment, all rights, title and ownership in the deliverables shall transfer to the Client. Prior to full payment, all work remains the property of the Freelancer.',
    `Termination: Either party may terminate this agreement by giving ${noticeDays} days' written notice. Work completed up to the termination date shall be paid for on a pro-rata basis.`
  ];

  if (includeConfidentiality) {
    clauses.push('Confidentiality: Both parties agree to keep confidential any proprietary or sensitive information shared during the course of this engagement, both during and after its completion.');
  }

  return { freelancerName, clientName, clauses };
}

function renderContract() {
  const { freelancerName, clientName, clauses } = buildClauses();
  const date = fmtDate(val('contractDate'));
  const doc = document.getElementById('contractDoc');

  doc.innerHTML = `
    <div class="contract-title">Freelance Services Agreement</div>
    <div class="contract-parties">Between ${freelancerName} and ${clientName} — ${date}</div>
    ${clauses.map((c, i) => `<div class="contract-clause"><span class="num">${i + 1}.</span>${c}</div>`).join('')}
    <div class="contract-sign-row">
      <div class="contract-sign-block">Freelancer's signature</div>
      <div class="contract-sign-block">Client's signature</div>
    </div>
    <div class="contract-watermark${isPro ? ' hidden' : ''}" id="contractWatermark">Made with KoboDocs — kobodocs.com.ng</div>
  `;
}

document.querySelectorAll('.form-panel input, .form-panel textarea').forEach(el => {
  el.addEventListener('input', renderContract);
});
document.getElementById('includeConfidentiality').addEventListener('change', renderContract);

document.getElementById('contractDate').value = new Date().toISOString().split('T')[0];
renderContract();

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

function buildContractPdf() {
  const { freelancerName, clientName, clauses } = buildClauses();
  const numbered = clauses.map((c, i) => `${i + 1}. ${c}`).join('\n\n');
  const watermark = isPro ? '' : '\n\n---\nMade with KoboDocs — kobodocs.com.ng';
  return KoboExport.buildLetterPdf({
    letterhead: 'Freelance Services Agreement',
    dateLine: `Between ${freelancerName} and ${clientName} — ${fmtDate(val('contractDate'))}`,
    bodyText: numbered + watermark
  });
}

document.getElementById('downloadPdfBtn').addEventListener('click', () => {
  try {
    const doc = buildContractPdf();
    KoboExport.download('freelancer-contract.pdf', doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = buildContractPdf();
    await KoboExport.shareWhatsApp('freelancer-contract.pdf', 'Freelance contract, made with KoboDocs.', doc);
  } catch (err) {
    if (err.name !== 'AbortError') showMsg('Could not prepare the PDF: ' + err.message, 'error');
  } finally {
    btn.textContent = original;
  }
});

// ---------- Pro gating: watermark + saved clients ----------
(async function checkPro() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const profile = await window.KoboAuth.getProfile();
  const active = profile && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date();
  isPro = !!(profile && active && (profile.plan === 'pro' || profile.plan === 'business'));

  if (!isPro) { renderContract(); return; }

  document.getElementById('proLockBanner').style.display = 'none';
  document.getElementById('savedClientRow').style.display = 'block';
  renderContract();

  const supabase = window.KoboAuth.supabase;
  const { data: clients } = await supabase.from('clients').select('id, name').order('name');

  const select = document.getElementById('savedClientSelect');
  if (!clients || !clients.length) {
    select.innerHTML = '<option value="">No saved clients yet</option>';
    return;
  }
  select.innerHTML = '<option value="">Select a client…</option>' +
    clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  select.addEventListener('change', () => {
    const client = clients.find(c => c.id === select.value);
    if (!client) return;
    document.getElementById('clientName').value = client.name || '';
    renderContract();
  });
})();
