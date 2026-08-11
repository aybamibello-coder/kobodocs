// ---------- Contract Scanner app ----------
const FN_BASE = 'https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1';

const CONTRACT_TYPES = [
  { value: 'general', label: 'General / Other' },
  { value: 'freelancer', label: 'Freelancer / Consulting' },
  { value: 'rent', label: 'Rent / Tenancy' },
  { value: 'land_sale', label: 'Land Sale / Deed of Assignment' },
  { value: 'employment', label: 'Employment' },
  { value: 'power_of_attorney', label: 'Power of Attorney' },
];

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

async function callFn(name, session, payload) {
  const res = await fetch(`${FN_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  if (data.error) throw new Error(data.error);
  return data;
}

function creditBuyPanel(ctx) {
  return `
    <div class="bs-panel">
      <p style="margin-bottom:12px; text-align:center;">
        ${ctx.credits > 0 ? `You have <strong>${ctx.credits}</strong> scan credit(s) left.` : 'No scan credits yet.'}
      </p>
      <div class="payg-row">
        <input type="number" id="creditCount" value="1" min="1">
        <button class="btn primary" id="buyCreditsBtn">Buy credits — ₦1,500 each</button>
      </div>
    </div>
  `;
}

function scanFormPanel() {
  return `
    <div class="bs-panel">
      <h3 style="font-size:1rem; margin-bottom:12px;">Paste your contract</h3>
      <form id="scanForm" class="pr-form">
        <label>Contract type</label>
        <select name="contract_type">
          ${CONTRACT_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
        </select>
        <label>Full contract text</label>
        <textarea name="contract_text" placeholder="Paste the complete contract text here…" required></textarea>
        <button class="btn primary" type="submit">Scan for risks (1 credit)</button>
      </form>
      <div id="scanResult"></div>
    </div>
  `;
}

function riskLabel(level) {
  return { low: 'Low risk', medium: 'Medium risk', high: 'High risk' }[level] || level;
}

function renderResult(result) {
  const flags = result.flags || [];
  return `
    <div style="margin-top:20px; padding-top:16px; border-top:1px dashed var(--line);">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
        <span class="risk-badge risk-${result.risk_level}">${riskLabel(result.risk_level)}</span>
        <span class="pr-meta">${flags.length} flag(s) found</span>
      </div>
      <p style="font-size:0.9rem; margin-bottom:16px;">${result.summary}</p>
      ${flags.map(f => `
        <div class="flag-card sev-${f.severity}">
          <div class="flag-clause">${f.clause} <span class="pr-meta">· ${f.severity} severity</span></div>
          <div class="flag-issue">${f.issue}</div>
        </div>
      `).join('')}
      <div class="disclaimer-note">${result.disclaimer || ''}</div>
    </div>
  `;
}

async function renderApp(ctx) {
  const area = document.getElementById('mainArea');
  area.innerHTML = creditBuyPanel(ctx) + (ctx.canScan ? scanFormPanel() : '');

  document.getElementById('buyCreditsBtn').addEventListener('click', () => {
    const count = Math.max(1, Number(document.getElementById('creditCount').value) || 1);
    window.KoboSubscribe.start('init-contract-scan-payment', { credit_count: count });
  });

  const form = document.getElementById('scanForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button[type="submit"]');
    const resultBox = document.getElementById('scanResult');
    btn.disabled = true;
    btn.textContent = 'Scanning…';
    resultBox.innerHTML = '';
    try {
      const result = await callFn('analyze-contract', ctx.session, {
        contract_text: fd.get('contract_text'),
        contract_type: fd.get('contract_type'),
      });
      resultBox.innerHTML = renderResult(result);
      toast(`Scan complete — ${result.credits_remaining} credit(s) left`);
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Scan for risks (1 credit)';
    }
  });
}

(async function init() {
  const ctx = await window.ContractScanGuard.requireAccess();
  if (!ctx) return;

  if (window.KoboSubscribe && window.KoboSubscribe.resumePendingIfAny) {
    await window.KoboSubscribe.resumePendingIfAny();
  }

  renderApp(ctx);
})();
