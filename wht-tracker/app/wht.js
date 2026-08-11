// ---------- WHT Tracker app ----------
const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FN_BASE = 'https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1';

const TRANSACTION_TYPES = [
  { value: 'professional_fees', label: 'Professional Fees', defaultRate: 5 },
  { value: 'rent', label: 'Rent', defaultRate: 10 },
  { value: 'dividend', label: 'Dividend', defaultRate: 10 },
  { value: 'interest', label: 'Interest', defaultRate: 10 },
  { value: 'royalty', label: 'Royalty', defaultRate: 10 },
  { value: 'commission', label: 'Commission', defaultRate: 5 },
  { value: 'construction', label: 'Construction', defaultRate: 5 },
  { value: 'contract_supply', label: 'Contract / Supply', defaultRate: 5 },
  { value: 'technical_management_fees', label: 'Technical / Management Fees', defaultRate: 10 },
  { value: 'directors_fees', label: "Directors' Fees", defaultRate: 10 },
  { value: 'other', label: 'Other', defaultRate: 5 },
];
const TYPE_LABEL = Object.fromEntries(TRANSACTION_TYPES.map(t => [t.value, t.label]));

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2600);
}

async function callFn(name, session, payload) {
  const res = await fetch(`${FN_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function renderPicker(ctx) {
  const area = document.getElementById('mainArea');
  area.innerHTML = `
    <div class="bs-panel">
      <div class="preview-label">What a certificate looks like</div>
      <div class="hero-doc mini">
        <div class="hero-doc-head">
          <div class="co">${ctx.business.name}</div>
          <div class="no">WHT DEDUCTION<br>RECORD</div>
        </div>
        <div class="hero-doc-row"><span>Gross amount</span><span>₦500,000</span></div>
        <div class="hero-doc-row"><span>WHT rate</span><span>5%</span></div>
        <div class="hero-doc-row"><span>WHT deducted</span><span>−₦25,000</span></div>
        <div class="hero-doc-total"><span>Net received</span><span>₦475,000</span></div>
      </div>
      <p style="margin-bottom:16px; text-align:center;">No active WHT Tracker plan or credits for <strong>${ctx.business.name}</strong>. Pay per certificate, or subscribe for a monthly allowance.</p>
      <div class="plans-grid">
        <div class="plan-card">
          <h3>Pay As You Go</h3>
          <div class="plan-price">₦300<span style="font-size:0.7rem;">/certificate</span></div>
          <p style="font-size:0.8rem; opacity:0.7; margin-bottom:10px;">Buy a batch of credits, no expiry</p>
          <div class="payg-row">
            <input type="number" id="paygCount" value="5" min="1">
            <button class="btn primary" id="buyPaygBtn">Buy credits</button>
          </div>
        </div>
        <div class="plan-card">
          <h3>Starter</h3>
          <div class="plan-price">₦3,500<span style="font-size:0.7rem;">/mo</span></div>
          <p style="font-size:0.8rem; opacity:0.7; margin-bottom:14px;">Up to 25 records/mo</p>
          <button class="btn primary" data-plan="starter">Choose Starter</button>
        </div>
        <div class="plan-card">
          <h3>Growth</h3>
          <div class="plan-price">₦9,000<span style="font-size:0.7rem;">/mo</span></div>
          <p style="font-size:0.8rem; opacity:0.7; margin-bottom:14px;">Up to 100 records/mo</p>
          <button class="btn primary" data-plan="growth">Choose Growth</button>
        </div>
      </div>
    </div>
    ${ctx.records && ctx.records.length ? recordsPanel(ctx, { readOnly: true }) : ''}
  `;

  document.getElementById('buyPaygBtn').addEventListener('click', () => {
    const count = Math.max(1, Number(document.getElementById('paygCount').value) || 1);
    window.KoboSubscribe.start('init-wht-payment', { business_id: ctx.business.id, mode: 'payg', credit_count: count });
  });
  area.querySelectorAll('[data-plan]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.KoboSubscribe.start('init-wht-payment', { business_id: ctx.business.id, mode: 'subscription', plan: btn.dataset.plan });
    });
  });
}

async function loadRecords(ctx) {
  const { data } = await ctx.supabase
    .from('wht_records')
    .select('*')
    .eq('business_id', ctx.business.id)
    .order('deduction_date', { ascending: false });
  return data || [];
}

function recordRow(rec) {
  const dueDate = new Date(rec.remittance_due_date);
  const daysLeft = Math.ceil((dueDate - new Date()) / 86400000);
  const dueSoon = rec.status !== 'used_in_filing' && daysLeft <= 5;
  return `
    <div class="pr-row" data-rec="${rec.id}">
      <div>
        <div class="pr-name">${rec.payer_name} <span class="pr-meta">· ${TYPE_LABEL[rec.transaction_type] || rec.transaction_type}</span></div>
        <div class="pr-meta">
          Deducted ${new Date(rec.deduction_date).toLocaleDateString('en-GB')} ·
          <span class="${dueSoon ? 'due-soon' : ''}">Remit by ${dueDate.toLocaleDateString('en-GB')}${dueSoon ? ` (${daysLeft <= 0 ? 'overdue' : daysLeft + 'd left'})` : ''}</span>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <span class="pr-amount">${naira(rec.wht_amount)}</span>
        <span class="status-badge status-${rec.status}">${rec.status.replace(/_/g, ' ')}</span>
        ${rec.status === 'pending_credit_note' ? `<button class="btn small mark-received" data-id="${rec.id}">Mark credit note received</button>` : ''}
        ${rec.certificate_pdf_path ? `<button class="btn small dl-cert" data-id="${rec.id}">Download certificate</button>` : ''}
      </div>
    </div>
  `;
}

function recordsPanel(ctx, opts = {}) {
  const records = ctx.records || [];
  const totalDue = records.filter(r => r.status !== 'used_in_filing').reduce((s, r) => s + Number(r.wht_amount), 0);
  return `
    <div class="bs-panel">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
        <strong>Your WHT records</strong>
        <span class="pr-meta">${records.length} record(s) · ${naira(totalDue)} not yet used in filing</span>
      </div>
      <div id="recListWrap">${records.length ? records.map(recordRow).join('') : '<div class="empty-note">No WHT records yet. Add your first deduction below.</div>'}</div>
    </div>
  `;
}

function addFormPanel(ctx) {
  return `
    <div class="bs-panel">
      <h3 style="font-size:1rem; margin-bottom:12px;">Log a WHT deduction</h3>
      <form id="addWhtForm" class="pr-form">
        <div class="form-grid">
          <div><label>Payer (who deducted it)</label><input name="payer_name" required></div>
          <div><label>Payer TIN (optional)</label><input name="payer_tin"></div>
          <div>
            <label>Transaction type</label>
            <select name="transaction_type" id="txnType">
              ${TRANSACTION_TYPES.map(t => `<option value="${t.value}" data-rate="${t.defaultRate}">${t.label}</option>`).join('')}
            </select>
          </div>
          <div><label>WHT rate (%)</label><input name="wht_rate" id="whtRate" type="number" step="0.1" value="5" required></div>
          <div><label>Gross amount (₦)</label><input name="gross_amount" type="number" step="0.01" required></div>
          <div><label>Deduction date</label><input name="deduction_date" type="date" required></div>
        </div>
        <button class="btn primary" type="submit">Save & generate certificate</button>
      </form>
    </div>
  `;
}

async function renderApp(ctx) {
  ctx.records = await loadRecords(ctx);
  const area = document.getElementById('mainArea');

  const statusLine = ctx.hasCredits
    ? `Pay-as-you-go · ${ctx.subscription.credits_balance} credit(s) left`
    : `${ctx.subscription.plan} plan · ${ctx.subscription.records_used_this_period}/${ctx.subscription.record_allowance} records this period · renews ${new Date(ctx.subscription.expires_at).toLocaleDateString('en-GB')}`;

  area.innerHTML = `
    <div class="bs-panel">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <strong>${ctx.business.name}</strong>
        <span class="pr-meta">${statusLine}</span>
      </div>
    </div>
    ${recordsPanel(ctx)}
    ${addFormPanel(ctx)}
  `;

  document.getElementById('txnType').addEventListener('change', (e) => {
    const rate = e.target.selectedOptions[0].dataset.rate;
    document.getElementById('whtRate').value = rate;
  });

  wireRecordActions(ctx);

  document.getElementById('addWhtForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!ctx.canRecord) {
      toast('No credits or plan allowance left — top up above.');
      return;
    }
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const result = await callFn('generate-wht-certificate', ctx.session, {
        business_id: ctx.business.id,
        transaction_type: fd.get('transaction_type'),
        payer_name: fd.get('payer_name'),
        payer_tin: fd.get('payer_tin') || null,
        gross_amount: Number(fd.get('gross_amount')),
        wht_rate: Number(fd.get('wht_rate')),
        deduction_date: fd.get('deduction_date'),
      });
      toast('Record saved — certificate ready');
      if (result.pdf_signed_url) window.open(result.pdf_signed_url, '_blank');
      const fresh = await window.WhtGuard.requireAccess();
      Object.assign(ctx, fresh);
      renderApp(ctx);
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = 'Save & generate certificate';
    }
  });
}

function wireRecordActions(ctx) {
  document.querySelectorAll('.mark-received').forEach(btn => {
    btn.addEventListener('click', async () => {
      await ctx.supabase
        .from('wht_records')
        .update({ status: 'credit_note_received', credit_note_received_date: new Date().toISOString().slice(0, 10) })
        .eq('id', btn.dataset.id);
      toast('Marked as received');
      renderApp(ctx);
    });
  });
  document.querySelectorAll('.dl-cert').forEach(btn => {
    btn.addEventListener('click', async () => {
      const rec = ctx.records.find(r => r.id === btn.dataset.id);
      if (!rec || !rec.certificate_pdf_path) return;
      const { data, error } = await ctx.supabase.storage.from('wht-certificates').createSignedUrl(rec.certificate_pdf_path, 3600);
      if (error || !data) { toast('Could not open certificate'); return; }
      window.open(data.signedUrl, '_blank');
    });
  });
}

(async function init() {
  const ctx = await window.WhtGuard.requireAccess();
  if (!ctx) return;

  if (window.KoboSubscribe && window.KoboSubscribe.resumePendingIfAny) {
    await window.KoboSubscribe.resumePendingIfAny();
  }

  if (!ctx.canRecord) {
    ctx.records = await loadRecords(ctx);
    renderPicker(ctx);
  } else {
    renderApp(ctx);
  }
})();
