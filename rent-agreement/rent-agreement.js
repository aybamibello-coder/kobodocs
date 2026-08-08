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
  const landlordName = val('landlordName') || '[Landlord\'s name]';
  const landlordAddress = val('landlordAddress') || '[Landlord\'s address]';
  const tenantName = val('tenantName') || '[Tenant\'s name]';
  const tenantAddress = val('tenantAddress') || '[Tenant\'s address]';
  const propertyAddress = val('propertyAddress') || '[rental property address]';
  const startDate = fmtDate(val('startDate'));
  const term = val('term') || '[term]';
  const rentAmount = val('rentAmount') || '[rent amount]';
  const noticeMonths = val('noticeMonths') || '3';

  const clauses = [
    `Parties: This Tenancy Agreement is made between ${landlordName} of ${landlordAddress} ("the Landlord") and ${tenantName}, of ${tenantAddress} ("the Tenant").`,
    `Property & Term: The Landlord agrees to let and the Tenant agrees to take the premises situate at ${propertyAddress}, for a term of ${term} commencing ${startDate}.`,
    `Rent: The rent for the said premises is ₦${rentAmount} per annum, payable in advance.`
  ];

  if (isPro) {
    const agentFeePercent = val('agentFeePercent') || '10';
    const cautionFee = val('cautionFee');
    const serviceCharge = val('serviceCharge');
    const serviceChargeBreakdown = val('serviceChargeBreakdown');

    clauses.push(`Agent Fee: An agency fee of ${agentFeePercent}% of the annual rent is payable to the managing agent.`);
    if (cautionFee) {
      clauses.push(`Caution Deposit: A refundable caution deposit of ₦${cautionFee} is payable, to be refunded at the end of the tenancy subject to the condition of the premises.`);
    }
    if (serviceCharge) {
      clauses.push(`Service Charge: An annual service charge of ₦${serviceCharge} is payable${serviceChargeBreakdown ? `, covering: ${serviceChargeBreakdown}` : ''}.`);
    }
  }

  clauses.push(
    'Use of Premises: The Tenant shall use the premises solely for residential purposes and shall not sublet, assign, or part with possession of the premises without the Landlord\'s prior written consent.',
    'Maintenance: The Tenant shall keep the interior of the premises in good and tenantable repair; the Landlord shall be responsible for structural repairs.',
    `Renewal / Termination: Either party wishing to terminate or not renew this tenancy shall give ${noticeMonths} month(s)' written notice prior to the expiration of the term.`,
    'Default: Any breach of these terms, including default in rent payment, may result in termination of this tenancy in accordance with applicable tenancy law.'
  );

  return { landlordName, tenantName, clauses };
}

function renderTenancy() {
  const { landlordName, tenantName, clauses } = buildClauses();
  const startDate = fmtDate(val('startDate'));
  const doc = document.getElementById('tenancyDoc');

  doc.innerHTML = `
    <div class="tenancy-title">Tenancy Agreement</div>
    <div class="tenancy-parties">Between ${landlordName} and ${tenantName} — ${startDate}</div>
    ${clauses.map((c, i) => `<div class="tenancy-clause"><span class="num">${i + 1}.</span>${c}</div>`).join('')}
    <div class="tenancy-sign-row">
      <div class="tenancy-sign-block">Landlord's signature</div>
      <div class="tenancy-sign-block">Tenant's signature</div>
    </div>
    <div class="tenancy-watermark${isPro ? ' hidden' : ''}" id="tenancyWatermark">Made with KoboDocs — kobodocs.com.ng</div>
  `;
}

document.querySelectorAll('.form-panel input').forEach(el => el.addEventListener('input', renderTenancy));
document.getElementById('startDate').value = new Date().toISOString().split('T')[0];
renderTenancy();

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

function buildTenancyPdf() {
  const { landlordName, tenantName, clauses } = buildClauses();
  const numbered = clauses.map((c, i) => `${i + 1}. ${c}`).join('\n\n');
  const watermark = isPro ? '' : '\n\n---\nMade with KoboDocs — kobodocs.com.ng';
  return KoboExport.buildLetterPdf({
    letterhead: 'Tenancy Agreement',
    dateLine: `Between ${landlordName} and ${tenantName} — ${fmtDate(val('startDate'))}`,
    bodyText: numbered + watermark
  });
}

document.getElementById('downloadPdfBtn').addEventListener('click', async () => {
  try {
    const doc = await buildTenancyPdf();
    KoboExport.download('tenancy-agreement.pdf', doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = await buildTenancyPdf();
    await KoboExport.shareWhatsApp('tenancy-agreement.pdf', 'Tenancy agreement, made with KoboDocs.', doc);
  } catch (err) {
    if (err.name !== 'AbortError') showMsg('Could not prepare the PDF: ' + err.message, 'error');
  } finally {
    btn.textContent = original;
  }
});

// ---------- Pro gating: extra clauses + saved tenants ----------
(async function checkPro() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const profile = await window.KoboAuth.getProfile();
  const active = profile && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date();
  isPro = !!(profile && active && (profile.plan === 'pro' || profile.plan === 'business'));

  if (!isPro) { renderTenancy(); return; }

  document.getElementById('proLockBanner').style.display = 'none';
  document.getElementById('proFieldset').classList.add('unlocked');
  document.getElementById('savedTenantRow').style.display = 'block';
  renderTenancy();

  const supabase = window.KoboAuth.supabase;
  const { data: clients } = await supabase.from('clients').select('id, name, address').order('name');

  const select = document.getElementById('savedTenantSelect');
  if (!clients || !clients.length) {
    select.innerHTML = '<option value="">No saved tenants yet</option>';
    return;
  }
  select.innerHTML = '<option value="">Select a tenant…</option>' +
    clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  select.addEventListener('change', () => {
    const client = clients.find(c => c.id === select.value);
    if (!client) return;
    document.getElementById('tenantName').value = client.name || '';
    if (client.address) document.getElementById('tenantAddress').value = client.address;
    renderTenancy();
  });
})();
