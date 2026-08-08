// ---------- Receivable Manager ----------
const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (isoDate) => isoDate
  ? new Date(isoDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';
const fmtDateTime = (iso) => iso
  ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

function daysOverdue(dueDate) {
  if (!dueDate) return null;
  const ms = new Date().setHours(0, 0, 0, 0) - new Date(dueDate).setHours(0, 0, 0, 0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function daysBetween(fromIso, toIso) {
  const ms = new Date(toIso).setHours(0, 0, 0, 0) - new Date(fromIso).setHours(0, 0, 0, 0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

function agingBucket(days) {
  if (days === null || days <= 0) return 'current';
  if (days <= 30) return 'b1';
  if (days <= 60) return 'b2';
  if (days <= 90) return 'b3';
  return 'b4';
}

const BUCKET_LABEL = { current: 'Current', b1: '1–30d overdue', b2: '31–60d overdue', b3: '61–90d overdue', b4: '90+ days overdue' };

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2600);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Paywall / plan picker ----------
function renderPlanPicker(ctx) {
  const area = document.getElementById('mainArea');
  area.innerHTML = `
    <div class="bs-panel">
      <p style="margin-bottom:16px; text-align:center;">No active Receivable Manager plan for <strong>${escapeHtml(ctx.business.name)}</strong> yet. Track outstanding balances, chase overdue payments, and see your DSO at a glance — no invoicing software required.</p>
      <div class="plans-grid" style="max-width:420px; margin:0 auto;">
        <div class="plan-card">
          <h3>Monthly</h3>
          <div class="plan-price">₦20,000<span style="font-size:0.7rem;">/mo</span></div>
          <button class="btn primary" data-cycle="monthly">Subscribe monthly</button>
        </div>
        <div class="plan-card">
          <h3>Yearly</h3>
          <div class="plan-price">₦200,000<span style="font-size:0.7rem;">/yr</span></div>
          <p style="font-size:0.78rem; opacity:0.7; margin-bottom:14px;">2 months free</p>
          <button class="btn primary" data-cycle="yearly">Subscribe yearly</button>
        </div>
      </div>
    </div>
  `;
  area.querySelectorAll('[data-cycle]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.KoboSubscribe.start('init-receivable-payment', {
        business_id: ctx.business.id,
        billing_cycle: btn.dataset.cycle
      });
    });
  });
}

(async function init() {
  const ctx = await window.ReceivableGuard.requireAccess();
  if (!ctx) return;

  if (!ctx.subActive) {
    renderPlanPicker(ctx);
    return;
  }

  const { business, supabase, session } = ctx;

  async function logActivity(action, details = {}, clientId = null) {
    await supabase.from('credit_audit_log').insert({
      business_id: business.id,
      client_id: clientId,
      actor_user_id: session.user.id,
      action,
      details
    });
  }

  const area = document.getElementById('mainArea');
  area.innerHTML = `
    <div class="bs-panel" id="dsoPanel"></div>
    <div class="bs-panel">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <strong style="font-size:0.9rem;">Today's priorities</strong>
          <p style="font-size:0.78rem; opacity:0.65; margin-top:2px;">Who to chase today, ranked by amount owed, how overdue, and broken promises.</p>
        </div>
        <button id="priorityRefreshBtn" class="btn small">Refresh</button>
      </div>
      <div id="priorityMeta" style="font-size:0.72rem; opacity:0.55; margin-top:6px;"></div>
      <div id="priorityWrap" style="margin-top:14px;"></div>
    </div>
    <div class="bs-panel">
      <div>
        <strong style="font-size:0.9rem;">Reconcile bank statement</strong>
        <p style="font-size:0.78rem; opacity:0.65; margin-top:2px;">Upload a CSV export from your business bank account. We match incoming payments to outstanding balances so you don't have to log them one by one.</p>
      </div>
      <div style="display:flex; align-items:center; gap:10px; margin-top:12px; flex-wrap:wrap;">
        <input type="file" id="reconFileInput" accept=".csv" />
        <button id="reconConfirmAllBtn" class="btn small" style="display:none;">Confirm all strong matches</button>
      </div>
      <div id="reconSummary" style="font-size:0.78rem; opacity:0.65; margin-top:8px;"></div>
      <div id="reconWrap" style="margin-top:14px;"></div>
    </div>
    <div class="bs-panel">
      <strong style="font-size:0.9rem;">Aging summary</strong>
      <div class="aging-grid" id="agingGrid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; margin-top:12px;"></div>
    </div>
    <div class="bs-panel">
      <strong style="font-size:0.9rem;">Analytics</strong>
      <div id="analyticsEmpty" class="empty-note" style="display:none;">Add a few outstanding balances to see your analytics.</div>
      <div id="analyticsGrid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:20px; margin-top:14px;">
        <div style="position:relative; height:220px;">
          <div style="font-size:0.78rem; opacity:0.65; margin-bottom:6px;">Aging distribution</div>
          <canvas id="chartAging"></canvas>
        </div>
        <div style="position:relative; height:220px;">
          <div style="font-size:0.78rem; opacity:0.65; margin-bottom:6px;">Top 5 outstanding balances</div>
          <canvas id="chartTopDebtors"></canvas>
        </div>
        <div style="position:relative; height:220px;">
          <div style="font-size:0.78rem; opacity:0.65; margin-bottom:6px;">Collected vs. new balances (6 months)</div>
          <canvas id="chartMonthly"></canvas>
        </div>
        <div style="position:relative; height:220px;">
          <div style="font-size:0.78rem; opacity:0.65; margin-bottom:6px;">DSO trend (6 months)</div>
          <canvas id="chartDSOTrend"></canvas>
        </div>
      </div>
    </div>
    <div class="bs-panel">
      <strong style="font-size:0.9rem;">Add an outstanding balance</strong>
      <div id="entryForm" style="margin-top:12px;"></div>
    </div>
    <div class="bs-panel">
      <strong style="font-size:0.9rem;">Outstanding by client</strong>
      <div id="ledgerWrap" style="margin-top:10px;"></div>
    </div>
    <div class="bs-panel">
      <strong style="font-size:0.9rem;">Upcoming promises to pay</strong>
      <div id="promiseWrap" style="margin-top:10px;"></div>
    </div>
    <div class="bs-panel">
      <strong style="font-size:0.9rem;">Recent activity</strong>
      <div id="activityWrap" style="margin-top:10px;"></div>
    </div>
    <div class="bs-panel">
      <strong style="font-size:0.9rem;">Automated reminders</strong>
      <p style="font-size:0.8rem; opacity:0.65; margin-top:4px;">Sends an email automatically to any client with an email on file once their balance crosses a day threshold below. Checked once daily.</p>
      <div id="reminderSettings" style="margin-top:12px;"></div>
    </div>
  `;

  let clients = [];
  let receivables = [];
  let promises = [];
  let notes = [];
  let activity = [];
  let byClient = {};
  let paymentEvents = [];
  let paymentBehaviour = {}; // client_id -> { avgDelay, count }
  const charts = {};

  // ---------- Payment prediction (deterministic, from paid history) ----------
  function computePaymentBehaviour() {
    const delaysByClient = {};
    paymentEvents.forEach(pe => {
      const rv = receivables.find(r => r.id === pe.receivable_id);
      if (!rv || !rv.due_date) return;
      const delay = daysBetween(rv.due_date, pe.paid_at);
      (delaysByClient[rv.client_id] ||= []).push(delay);
    });
    const result = {};
    Object.keys(delaysByClient).forEach(cid => {
      const arr = delaysByClient[cid];
      result[cid] = { avgDelay: arr.reduce((s, d) => s + d, 0) / arr.length, count: arr.length };
    });
    paymentBehaviour = result;
  }

  function predictedPaymentDate(rv) {
    if (!rv.due_date) return null;
    const stats = paymentBehaviour[rv.client_id];
    if (!stats) return null;
    return { date: addDays(rv.due_date, stats.avgDelay), count: stats.count, avgDelay: stats.avgDelay };
  }

  async function logPaymentForReceivable(receivableId, amountNum, clientId, paidAtIso) {
    const item = receivables.find(i => i.id === receivableId);
    if (!item) return { error: 'Receivable not found' };

    const newAmountPaid = Number(item.amount_paid || 0) + amountNum;
    const newStatus = newAmountPaid >= Number(item.amount) ? 'paid' : 'partial';

    const { error } = await supabase.from('receivables')
      .update({ amount_paid: newAmountPaid, payment_status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', receivableId);
    if (error) return { error: error.message };

    const paymentRow = { receivable_id: receivableId, business_id: business.id, amount: amountNum, created_by: session.user.id };
    if (paidAtIso) paymentRow.paid_at = paidAtIso;
    await supabase.from('receivable_payments').insert(paymentRow);

    await logActivity('payment_logged', { amount: amountNum }, clientId);
    return { error: null };
  }

  async function loadAll() {
    const [c, r, p, n, a, pe] = await Promise.all([
      supabase.from('clients').select('id, name, phone, email, credit_limit, address').eq('business_id', business.id).order('name', { ascending: true }),
      supabase.from('receivables').select('id, client_id, description, amount, amount_paid, due_date, payment_status, source, created_at').eq('business_id', business.id).order('due_date', { ascending: true }),
      supabase.from('promise_to_pay').select('id, client_id, promised_date, promised_amount, note, status, created_at').eq('business_id', business.id).order('promised_date', { ascending: true }),
      supabase.from('collection_notes').select('id, client_id, note, created_at').eq('business_id', business.id).order('created_at', { ascending: false }),
      supabase.from('credit_audit_log').select('id, client_id, action, details, created_at, clients(name)').eq('business_id', business.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('receivable_payments').select('id, receivable_id, amount, paid_at').eq('business_id', business.id).order('paid_at', { ascending: true })
    ]);
    clients = c.data || [];
    receivables = r.data || [];
    promises = p.data || [];
    notes = n.data || [];
    activity = a.data || [];
    paymentEvents = pe.data || [];
  }

  function clientById(id) { return clients.find(c => c.id === id) || { name: 'Unknown client' }; }

  function computeDSO() {
    const outstanding = receivables.filter(rv => rv.payment_status !== 'paid');
    const totalOutstanding = outstanding.reduce((s, rv) => s + (Number(rv.amount) - Number(rv.amount_paid || 0)), 0);

    const since = new Date();
    since.setDate(since.getDate() - 90);
    const recent = receivables.filter(rv => new Date(rv.created_at) >= since);
    const recentTotal = recent.reduce((s, rv) => s + Number(rv.amount), 0);

    const dso = recentTotal > 0 ? Math.round((totalOutstanding / recentTotal) * 90) : null;

    document.getElementById('dsoPanel').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <strong style="font-size:0.9rem;">Days Sales Outstanding</strong>
          <p style="font-size:0.78rem; opacity:0.65; margin-top:2px;">Based on the last 90 days of activity.</p>
        </div>
        <div class="pr-amount" style="font-size:1.4rem;">${dso === null ? '—' : dso + ' days'}</div>
      </div>
    `;
  }

  function renderAging() {
    const outstanding = receivables
      .filter(rv => rv.payment_status !== 'paid')
      .map(rv => ({ ...rv, overdueDays: daysOverdue(rv.due_date), balance: Number(rv.amount) - Number(rv.amount_paid || 0) }));

    const buckets = { current: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
    outstanding.forEach(rv => { buckets[agingBucket(rv.overdueDays)] += rv.balance; });

    const grid = document.getElementById('agingGrid');
    grid.innerHTML = Object.keys(BUCKET_LABEL).map(key => `
      <div style="border:1px solid var(--line); border-radius:8px; padding:10px; text-align:center;">
        <div style="font-size:0.72rem; opacity:0.65;">${BUCKET_LABEL[key]}</div>
        <div class="pr-amount" style="margin-top:4px;">${naira(buckets[key])}</div>
      </div>
    `).join('');

    byClient = {};
    outstanding.forEach(rv => {
      if (!rv.client_id) return;
      if (!byClient[rv.client_id]) byClient[rv.client_id] = { client: clientById(rv.client_id), items: [], balance: 0, worstBucket: 'current' };
      byClient[rv.client_id].items.push(rv);
      byClient[rv.client_id].balance += rv.balance;
      const order = ['current', 'b1', 'b2', 'b3', 'b4'];
      const bucket = agingBucket(rv.overdueDays);
      if (order.indexOf(bucket) > order.indexOf(byClient[rv.client_id].worstBucket)) {
        byClient[rv.client_id].worstBucket = bucket;
      }
    });
  }

  // ---------- Today's priorities (AI-assisted, deterministically scored) ----------
  function isToday(iso) {
    if (!iso) return false;
    const d = new Date(iso), now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }

  function renderPriorityList(priorities, meta) {
    const wrap = document.getElementById('priorityWrap');
    const metaEl = document.getElementById('priorityMeta');

    metaEl.textContent = meta?.generatedAt
      ? `Last generated ${fmtDateTime(meta.generatedAt)}${meta.provider ? ` · ${meta.provider}` : ''}`
      : '';

    if (!priorities || !priorities.length) {
      wrap.innerHTML = '<div class="empty-note">Nothing overdue right now — every account is settled or current.</div>';
      return;
    }

    wrap.innerHTML = priorities.map(p => {
      const client = clientById(p.client_id);
      return `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:10px 0; border-bottom:1px dashed var(--line);">
          <div style="flex:1; min-width:0;">
            <div class="pr-name">${p.rank}. ${escapeHtml(p.client_name)}
              <span style="font-size:0.68rem; opacity:0.65; font-weight:400; margin-left:6px;">${p.bucket}${p.broken_promise ? ' · broke a promise' : ''}</span>
            </div>
            <div style="font-size:0.82rem; opacity:0.75; margin-top:3px;">${escapeHtml(p.suggested_action)}</div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div class="pr-amount">${naira(p.balance)}</div>
            ${client.phone ? `<button data-priority-remind="${p.client_id}" class="btn small" style="margin-top:6px;">WhatsApp</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    wrap.querySelectorAll('[data-priority-remind]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.priorityRemind;
        const client = clientById(cid);
        const row = byClient[cid];
        const balance = naira(row ? row.balance : 0);
        const message = `Hello ${client.name}, this is a reminder that your outstanding balance with ${business.name} is ${balance}. Please let us know when we can expect payment. Thank you.`;
        window.open(`https://wa.me/${client.phone.replace(/[^\d+]/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
        logActivity('reminder_sent', { channel: 'whatsapp', balance: row ? row.balance : 0, source: 'priorities' }, cid);
      });
    });
  }

  async function generatePriorities() {
    const btn = document.getElementById('priorityRefreshBtn');
    const wrap = document.getElementById('priorityWrap');
    btn.disabled = true;
    btn.textContent = 'Generating…';
    wrap.innerHTML = '<div class="empty-note">Scoring accounts and drafting today\u2019s priorities…</div>';

    try {
      const { data, error } = await supabase.functions.invoke('collection-priorities', {
        body: { business_id: business.id }
      });
      if (error || data?.error) {
        toast('Could not generate priorities: ' + (data?.error || error.message));
        renderPriorityList([], null);
        return;
      }
      renderPriorityList(data.priorities, { generatedAt: data.generated_at, provider: data.provider });
    } catch (err) {
      toast('Could not generate priorities: ' + err.message);
      renderPriorityList([], null);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Refresh';
    }
  }

  async function loadAndRenderPriorities() {
    const { data: lastRun } = await supabase
      .from('collection_priority_runs')
      .select('priorities, provider, created_at')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastRun && isToday(lastRun.created_at)) {
      renderPriorityList(lastRun.priorities, { generatedAt: lastRun.created_at, provider: lastRun.provider });
    } else {
      await generatePriorities();
    }
  }

  document.getElementById('priorityRefreshBtn').addEventListener('click', generatePriorities);

  // ---------- Bank/payment reconciliation (deterministic matching, no AI) ----------
  let reconRows = [];              // parsed + matched transactions from the uploaded CSV
  let reconciledKeys = new Set();  // already-processed transactions, loaded from db

  function txKey(dateStr, amount, description) {
    return `${dateStr}|${Number(amount).toFixed(2)}|${(description || '').trim().toLowerCase()}`;
  }

  async function loadReconciledKeys() {
    const { data } = await supabase
      .from('reconciled_transactions')
      .select('tx_date, amount, description')
      .eq('business_id', business.id);
    reconciledKeys = new Set((data || []).map(r => txKey(r.tx_date, r.amount, r.description)));
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function detectColumns(headerRow) {
    const norm = headerRow.map(h => h.trim().toLowerCase());
    const find = (candidates) => norm.findIndex(h => candidates.some(c => h.includes(c)));
    return {
      date: find(['date']),
      description: find(['narration', 'description', 'details', 'remark', 'particular']),
      credit: find(['credit', 'cr amount']),
      amount: find(['amount'])
    };
  }

  function parseAmount(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    const cleaned = String(raw).replace(/[₦, ]/g, '').replace(/\((.*)\)/, '-$1');
    const n = Number(cleaned);
    return isNaN(n) ? null : n;
  }

  function parseDate(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = '20' + y;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  function matchTransaction(description, amount) {
    const desc = (description || '').toLowerCase();
    let best = null;
    Object.keys(byClient).forEach(cid => {
      const clientRow = byClient[cid];
      const tokens = clientRow.client.name.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      const hits = tokens.filter(t => desc.includes(t)).length;
      const nameScore = tokens.length ? hits / tokens.length : 0;

      clientRow.items.forEach(item => {
        const diff = Math.abs(item.balance - amount);
        const amountScore = diff < 1 ? 1 : diff <= item.balance * 0.02 ? 0.85 : 0;
        if (amountScore === 0 && nameScore === 0) return;
        const score = nameScore * 0.6 + amountScore * 0.4;
        if (!best || score > best.score) {
          best = { clientId: cid, receivableId: item.id, score };
        }
      });
    });
    return best;
  }

  function confidenceLabel(score) {
    if (score >= 0.75) return 'Strong match';
    if (score >= 0.4) return 'Possible match';
    return 'No confident match';
  }

  function renderRecon() {
    const wrap = document.getElementById('reconWrap');
    const summary = document.getElementById('reconSummary');
    const confirmAllBtn = document.getElementById('reconConfirmAllBtn');

    if (!reconRows.length) { wrap.innerHTML = ''; summary.textContent = ''; confirmAllBtn.style.display = 'none'; return; }

    const actionable = reconRows.filter(r => !r.done);
    const strongCount = actionable.filter(r => r.match && r.match.score >= 0.75).length;
    const alreadyCount = reconRows.length - actionable.length;
    summary.textContent = `${reconRows.length} transaction${reconRows.length > 1 ? 's' : ''} found` +
      (alreadyCount ? ` · ${alreadyCount} already reconciled` : '') +
      (actionable.length ? ` · ${actionable.length} need review` : ' · all handled');
    confirmAllBtn.style.display = strongCount > 0 ? 'inline-block' : 'none';
    confirmAllBtn.textContent = `Confirm all strong matches (${strongCount})`;

    wrap.innerHTML = actionable.map((r) => {
      const idx = reconRows.indexOf(r);
      const confLabel = r.match ? confidenceLabel(r.match.score) : 'No confident match';
      const options = [];
      Object.keys(byClient).forEach(cid => {
        byClient[cid].items.forEach(item => {
          const selected = r.match && r.match.receivableId === item.id ? 'selected' : '';
          options.push(`<option value="${cid}::${item.id}" ${selected}>${escapeHtml(byClient[cid].client.name)} — ${escapeHtml(item.description || 'balance')} (${naira(item.balance)})</option>`);
        });
      });
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 0; border-bottom:1px dashed var(--line); flex-wrap:wrap;">
          <div style="flex:1; min-width:220px;">
            <div style="font-size:0.82rem;">${escapeHtml(r.description || '(no narration)')}</div>
            <div style="font-size:0.72rem; opacity:0.6; margin-top:2px;">${r.date || 'unknown date'} · ${naira(r.amount)} · ${confLabel}</div>
          </div>
          <select data-recon-select="${idx}" style="min-width:200px; max-width:280px;">
            <option value="">— ignore this transaction —</option>
            ${options.join('')}
          </select>
          <button data-recon-confirm="${idx}" class="btn small">Confirm</button>
        </div>
      `;
    }).join('');

    wrap.querySelectorAll('[data-recon-confirm]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.reconConfirm);
        const select = wrap.querySelector(`[data-recon-select="${idx}"]`);
        await confirmReconRow(idx, select.value);
      });
    });
  }

  async function confirmReconRow(idx, selectedValue) {
    const r = reconRows[idx];
    if (!r || r.done) return;

    if (!selectedValue) {
      await supabase.from('reconciled_transactions').insert({
        business_id: business.id, tx_date: r.date, description: r.description, amount: r.amount,
        status: 'ignored', created_by: session.user.id
      });
      r.done = true;
      renderRecon();
      return;
    }

    const [clientId, receivableId] = selectedValue.split('::');
    const paidAtIso = r.date ? new Date(r.date).toISOString() : null;
    const { error } = await logPaymentForReceivable(receivableId, r.amount, clientId, paidAtIso);
    if (error) { toast('Could not log payment: ' + error); return; }

    await supabase.from('reconciled_transactions').insert({
      business_id: business.id, tx_date: r.date, description: r.description, amount: r.amount,
      status: 'matched', matched_receivable_id: receivableId, matched_client_id: clientId, created_by: session.user.id
    });

    r.done = true;
    await loadAll();
    computePaymentBehaviour();
    renderAging();
    renderLedger();
    computeDSO();
    renderAnalytics();
    renderRecon();
    toast('Payment matched and logged.');
  }

  async function handleReconFile(file) {
    const text = await file.text();
    const rows = parseCSV(text).filter(r => r.some(cell => cell.trim() !== ''));
    if (rows.length < 2) { toast('No transactions found in that file.'); return; }

    const cols = detectColumns(rows[0]);
    if (cols.date === -1 || cols.description === -1) {
      toast('Could not find date/description columns. Expected headers like Date, Narration/Description, Amount.');
      return;
    }

    await loadReconciledKeys();

    reconRows = [];
    for (let i = 1; i < rows.length; i++) {
      const raw = rows[i];
      const date = parseDate(raw[cols.date]);
      const description = (raw[cols.description] || '').trim();
      let amount = null;
      if (cols.credit !== -1) amount = parseAmount(raw[cols.credit]);
      else if (cols.amount !== -1) {
        const a = parseAmount(raw[cols.amount]);
        amount = a !== null && a > 0 ? a : null; // only treat positive values as an incoming credit
      }
      if (!date || amount === null || amount <= 0) continue;

      const key = txKey(date, amount, description);
      const alreadyDone = reconciledKeys.has(key);
      reconRows.push({
        date, description, amount, done: alreadyDone,
        match: alreadyDone ? null : matchTransaction(description, amount)
      });
    }

    if (!reconRows.length) { toast('No incoming (credit) transactions found in that file.'); return; }
    renderRecon();
  }

  document.getElementById('reconFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleReconFile(file);
  });

  document.getElementById('reconConfirmAllBtn').addEventListener('click', async () => {
    const strongOnes = reconRows.filter(r => !r.done && r.match && r.match.score >= 0.75);
    for (const r of strongOnes) {
      const idx = reconRows.indexOf(r);
      await confirmReconRow(idx, `${r.match.clientId}::${r.match.receivableId}`);
    }
  });

  function renderLedger() {
    const wrap = document.getElementById('ledgerWrap');
    const clientIds = Object.keys(byClient).sort((a, b) => byClient[b].balance - byClient[a].balance);

    if (!clientIds.length) {
      wrap.innerHTML = '<div class="empty-note">Nothing outstanding — every account is settled.</div>';
      return;
    }

    wrap.innerHTML = clientIds.map(cid => {
      const row = byClient[cid];
      const client = row.client;
      const overLimit = client.credit_limit && row.balance > Number(client.credit_limit);
      return `
        <div class="pr-row" data-toggle="${cid}" style="cursor:pointer; display:block;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div class="pr-name">${escapeHtml(client.name)}
                <span class="bucket-tag ${row.worstBucket}" style="font-size:0.68rem; margin-left:6px; opacity:0.75;">${BUCKET_LABEL[row.worstBucket]}</span>
                ${overLimit ? `<span style="color:#b3402e; font-size:0.68rem; margin-left:6px;">Over ${naira(client.credit_limit)} limit</span>` : ''}
              </div>
              <div class="pr-meta">${row.items.length} open item${row.items.length > 1 ? 's' : ''}${(() => {
                const preds = row.items.map(predictedPaymentDate).filter(Boolean);
                if (!preds.length) return '';
                const earliest = preds.reduce((a, b) => (a.date < b.date ? a : b));
                return ` · expected ~${fmtDate(earliest.date)}`;
              })()}</div>
            </div>
            <div class="pr-amount">${naira(row.balance)}</div>
          </div>
          <div id="detail-${cid}" style="display:none; margin-top:12px;"></div>
        </div>
      `;
    }).join('');

    wrap.querySelectorAll('[data-toggle]').forEach(rowEl => {
      rowEl.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input') || e.target.closest('textarea')) return;
        const cid = rowEl.dataset.toggle;
        const detail = document.getElementById(`detail-${cid}`);
        const isOpen = detail.style.display !== 'none';
        wrap.querySelectorAll('[id^="detail-"]').forEach(d => d.style.display = 'none');
        if (!isOpen) {
          renderClientDetail(cid);
          detail.style.display = 'block';
        }
      });
    });
  }

  function clientPromises(cid) { return promises.filter(p => p.client_id === cid); }
  function clientNotes(cid) { return notes.filter(n => n.client_id === cid); }

  function renderClientDetail(cid) {
    const row = byClient[cid];
    const client = row.client;
    const detail = document.getElementById(`detail-${cid}`);

    const itemRows = row.items.map(rv => {
      const predicted = predictedPaymentDate(rv);
      const expectedCell = predicted
        ? `${fmtDate(predicted.date)} <span style="opacity:0.55;">(${predicted.count} past pmt${predicted.count > 1 ? 's' : ''})</span>`
        : '<span style="opacity:0.5;">—</span>';
      return `
      <tr>
        <td>${escapeHtml(rv.description || 'Balance')}</td>
        <td>${fmtDate(rv.due_date)}</td>
        <td>${expectedCell}</td>
        <td>${naira(rv.balance)}</td>
        <td><button data-pay="${rv.id}" class="btn small">Log payment</button></td>
      </tr>
    `;
    }).join('');

    const behaviour = paymentBehaviour[cid];
    const behaviourNote = behaviour
      ? (behaviour.avgDelay > 0.5
          ? `Based on ${behaviour.count} past payment${behaviour.count > 1 ? 's' : ''}, this client typically pays ~${Math.round(behaviour.avgDelay)} day${Math.round(behaviour.avgDelay) === 1 ? '' : 's'} after the due date.`
          : behaviour.avgDelay < -0.5
          ? `Based on ${behaviour.count} past payment${behaviour.count > 1 ? 's' : ''}, this client typically pays ~${Math.round(Math.abs(behaviour.avgDelay))} day${Math.round(Math.abs(behaviour.avgDelay)) === 1 ? '' : 's'} before the due date.`
          : `Based on ${behaviour.count} past payment${behaviour.count > 1 ? 's' : ''}, this client typically pays on the due date.`)
      : 'No payment history yet — predictions will appear once this client has paid at least once with a due date on file.';

    const pList = clientPromises(cid);
    const nList = clientNotes(cid);

    detail.innerHTML = `
      <p style="font-size:0.78rem; opacity:0.65; margin-bottom:10px;">${behaviourNote}</p>
      <table style="width:100%; font-size:0.85rem; margin-bottom:12px;">
        <thead><tr><th style="text-align:left;">Item</th><th style="text-align:left;">Due</th><th style="text-align:left;">Expected</th><th style="text-align:left;">Balance</th><th></th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        <button data-statement="${cid}" class="btn small">Download statement (PDF)</button>
        ${client.phone ? `<button data-remind="${cid}" class="btn small">WhatsApp reminder</button>` : ''}
      </div>

      <strong style="font-size:0.82rem;">Promises to pay</strong>
      <div style="margin:6px 0 10px;">
        ${pList.length ? pList.map(p => `
          <div style="font-size:0.82rem; padding:6px 0; border-bottom:1px dashed var(--line);">
            ${fmtDate(p.promised_date)} — ${naira(p.promised_amount)}
            <span style="opacity:0.7;"> (${p.status})</span>
            ${p.note ? `<div style="opacity:0.7;">${escapeHtml(p.note)}</div>` : ''}
            ${p.status === 'pending' ? `
              <div style="margin-top:4px;">
                <button data-resolve="${p.id}" data-outcome="kept" class="btn small">Mark kept</button>
                <button data-resolve="${p.id}" data-outcome="broken" class="btn small">Mark broken</button>
              </div>` : ''}
          </div>
        `).join('') : '<div class="empty-note" style="padding:8px 0;">No promises logged yet.</div>'}
      </div>
      <div class="pr-form" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
        <div><label>Promised date</label><input type="date" id="pDate-${cid}"></div>
        <div><label>Amount</label><input type="number" id="pAmount-${cid}" placeholder="0" style="width:120px;"></div>
        <div style="flex:1; min-width:160px;"><label>Note (optional)</label><input type="text" id="pNote-${cid}" placeholder="e.g. will pay after month-end"></div>
        <button data-add-promise="${cid}" class="btn primary small">Log promise</button>
      </div>

      <strong style="font-size:0.82rem; display:block; margin-top:16px;">Collection notes</strong>
      <div style="margin:6px 0 10px;">
        ${nList.length ? nList.map(n => `
          <div style="font-size:0.82rem; padding:6px 0; border-bottom:1px dashed var(--line);"><span style="opacity:0.6;">${fmtDateTime(n.created_at)}</span><div>${escapeHtml(n.note)}</div></div>
        `).join('') : '<div class="empty-note" style="padding:8px 0;">No notes yet.</div>'}
      </div>
      <div class="pr-form" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
        <div style="flex:1; min-width:200px;"><label>Add a note</label><textarea id="noteText-${cid}" placeholder="Spoke with client, they confirmed receipt of goods…" style="width:100%;"></textarea></div>
        <button data-add-note="${cid}" class="btn primary small">Save note</button>
      </div>
    `;

    detail.querySelector(`[data-statement="${cid}"]`).addEventListener('click', async () => {
      await downloadStatement(cid);
    });

    const remindBtn = detail.querySelector(`[data-remind="${cid}"]`);
    if (remindBtn) {
      remindBtn.addEventListener('click', async () => {
        const balance = naira(row.balance);
        const message = `Hello ${client.name}, this is a reminder that your outstanding balance with ${business.name} is ${balance}. Please let us know when we can expect payment. Thank you.`;
        window.open(`https://wa.me/${client.phone.replace(/[^\d+]/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
        logActivity('reminder_sent', { channel: 'whatsapp', balance: row.balance }, cid);
      });
    }

    detail.querySelectorAll('[data-pay]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.pay;
        const item = row.items.find(i => i.id === id);
        const amountStr = prompt(`Amount received for "${item.description || 'this balance'}" (balance: ${naira(item.balance)}):`);
        if (!amountStr) return;
        const amountNum = Number(amountStr);
        if (!amountNum || amountNum <= 0) { toast('Enter a valid amount.'); return; }

        const { error } = await logPaymentForReceivable(id, amountNum, cid, null);
        if (error) { toast('Could not log payment: ' + error); return; }

        toast('Payment logged.');
        await loadAll();
        computePaymentBehaviour();
        renderAging();
        renderLedger();
        computeDSO();
        renderAnalytics();
      });
    });

    detail.querySelector(`[data-add-promise="${cid}"]`).addEventListener('click', async () => {
      const dateVal = document.getElementById(`pDate-${cid}`).value;
      const amountVal = document.getElementById(`pAmount-${cid}`).value;
      const noteVal = document.getElementById(`pNote-${cid}`).value.trim();
      if (!dateVal || !amountVal) { toast('Add a date and amount first.'); return; }

      const { data: created, error } = await supabase.from('promise_to_pay').insert({
        business_id: business.id,
        client_id: cid,
        promised_date: dateVal,
        promised_amount: Number(amountVal),
        note: noteVal || null,
        created_by: session.user.id
      }).select().single();

      if (error) { toast('Could not save promise: ' + error.message); return; }
      promises.push(created);
      await logActivity('promise_logged', { promised_date: dateVal, promised_amount: Number(amountVal) }, cid);
      toast('Promise to pay logged.');
      renderClientDetail(cid);
      renderPromiseList();
    });

    detail.querySelector(`[data-add-note="${cid}"]`).addEventListener('click', async () => {
      const text = document.getElementById(`noteText-${cid}`).value.trim();
      if (!text) { toast('Write a note first.'); return; }

      const { data: created, error } = await supabase.from('collection_notes').insert({
        business_id: business.id,
        client_id: cid,
        note: text,
        created_by: session.user.id
      }).select().single();

      if (error) { toast('Could not save note: ' + error.message); return; }
      notes.unshift(created);
      await logActivity('note_added', { note: text }, cid);
      toast('Note saved.');
      renderClientDetail(cid);
    });

    detail.querySelectorAll('[data-resolve]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.resolve;
        const outcome = btn.dataset.outcome;
        const { error } = await supabase.from('promise_to_pay')
          .update({ status: outcome, resolved_at: new Date().toISOString() })
          .eq('id', id);
        if (error) { toast('Could not update promise: ' + error.message); return; }
        const p = promises.find(p => p.id === id);
        if (p) p.status = outcome;
        await logActivity('promise_resolved', { outcome }, cid);
        toast(`Promise marked ${outcome}.`);
        renderClientDetail(cid);
        renderPromiseList();
      });
    });
  }

  async function downloadStatement(cid) {
    const row = byClient[cid];
    const client = row.client;

    const rows = row.items.map(rv => [
      rv.description || 'Balance',
      fmtDate(rv.due_date),
      naira(Number(rv.amount)),
      naira(Number(rv.amount_paid || 0)),
      naira(rv.balance)
    ]);

    const doc = await window.KoboExport.buildTablePdf({
      style: 'branded',
      docLabel: 'Statement',
      businessName: business.name,
      metaLines: [`Statement date: ${fmtDate(new Date().toISOString())}`],
      toLabel: 'Customer',
      toName: client.name,
      toSub: client.address || '',
      columns: ['Item', 'Due date', 'Amount', 'Paid', 'Balance'],
      rightAlignCols: [2, 3, 4],
      rows,
      totals: [{ label: 'Total outstanding', value: naira(row.balance), emphasis: true }],
      note: 'This statement reflects open balances only. Contact us if any balance here looks incorrect.'
    });

    window.KoboExport.download(`Statement-${(client.name || 'customer').replace(/\s+/g, '-')}.pdf`, doc);
    await logActivity('statement_generated', { balance: row.balance }, cid);
  }

  function renderPromiseList() {
    const wrap = document.getElementById('promiseWrap');
    const list = promises.slice().sort((a, b) => new Date(a.promised_date) - new Date(b.promised_date)).filter(p => p.status === 'pending');
    if (!list.length) {
      wrap.innerHTML = '<div class="empty-note">No promises logged yet.</div>';
      return;
    }
    wrap.innerHTML = list.map(p => {
      const client = clientById(p.client_id);
      return `
        <div style="font-size:0.85rem; padding:8px 0; border-bottom:1px dashed var(--line);">
          <strong>${escapeHtml(client.name)}</strong> — ${naira(p.promised_amount)} promised for ${fmtDate(p.promised_date)}
        </div>
      `;
    }).join('');
  }

  function renderActivity() {
    const wrap = document.getElementById('activityWrap');
    if (!activity.length) {
      wrap.innerHTML = '<div class="empty-note">No activity yet.</div>';
      return;
    }
    const ACTION_LABEL = {
      promise_logged: 'Promise to pay logged',
      promise_resolved: 'Promise resolved',
      note_added: 'Collection note added',
      reminder_sent: 'Reminder sent',
      statement_generated: 'Statement generated',
      payment_logged: 'Payment logged',
      receivable_added: 'Outstanding balance added'
    };
    wrap.innerHTML = activity.map(a => `
      <div style="font-size:0.82rem; padding:6px 0; border-bottom:1px dashed var(--line);">
        <span style="opacity:0.6;">${fmtDateTime(a.created_at)}</span> —
        ${ACTION_LABEL[a.action] || a.action}${a.clients ? ` · ${escapeHtml(a.clients.name)}` : ''}
      </div>
    `).join('');
  }

  function renderEntryForm() {
    const wrap = document.getElementById('entryForm');
    wrap.innerHTML = `
      <div class="form-grid">
        <div>
          <label>Client</label>
          <select id="entryClientSelect">
            <option value="">— Select existing client —</option>
            ${clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
            <option value="__new">+ Add new client</option>
          </select>
        </div>
        <div id="newClientFields" style="display:none;">
          <label>New client name</label>
          <input type="text" id="newClientName" placeholder="Client or business name">
          <label>Phone (for WhatsApp reminders)</label>
          <input type="text" id="newClientPhone" placeholder="e.g. 08012345678">
        </div>
      </div>
      <div class="form-grid">
        <div>
          <label>Description</label>
          <input type="text" id="entryDescription" placeholder="e.g. Supply of office chairs, June">
        </div>
        <div>
          <label>Amount owed</label>
          <input type="number" id="entryAmount" placeholder="0">
        </div>
      </div>
      <div class="form-grid">
        <div>
          <label>Due date</label>
          <input type="date" id="entryDueDate">
        </div>
      </div>
      <button id="entrySubmit" class="btn primary">Add outstanding balance</button>
    `;

    const select = document.getElementById('entryClientSelect');
    select.addEventListener('change', () => {
      document.getElementById('newClientFields').style.display = select.value === '__new' ? 'block' : 'none';
    });

    document.getElementById('entrySubmit').addEventListener('click', async () => {
      let clientId = select.value;
      const description = document.getElementById('entryDescription').value.trim();
      const amount = Number(document.getElementById('entryAmount').value);
      const dueDate = document.getElementById('entryDueDate').value || null;

      if (!amount || amount <= 0) { toast('Enter a valid amount.'); return; }

      if (!clientId) { toast('Select or add a client first.'); return; }

      if (clientId === '__new') {
        const name = document.getElementById('newClientName').value.trim();
        const phone = document.getElementById('newClientPhone').value.trim();
        if (!name) { toast('Enter the new client\'s name.'); return; }

        const { data: newClient, error: clientErr } = await supabase.from('clients').insert({
          business_id: business.id,
          user_id: session.user.id,
          name,
          phone: phone || null
        }).select().single();

        if (clientErr) { toast('Could not add client: ' + clientErr.message); return; }
        clients.push(newClient);
        clientId = newClient.id;
      }

      const { error } = await supabase.from('receivables').insert({
        business_id: business.id,
        client_id: clientId,
        description: description || null,
        amount,
        amount_paid: 0,
        due_date: dueDate,
        payment_status: 'unpaid',
        source: 'manual',
        created_by: session.user.id
      });

      if (error) { toast('Could not add balance: ' + error.message); return; }

      await logActivity('receivable_added', { amount }, clientId);
      toast('Outstanding balance added.');
      await loadAll();
      renderAging();
      renderLedger();
      renderEntryForm();
      computeDSO();
      renderAnalytics();
    });
  }

  async function loadAndRenderReminderSettings() {
    const { data: rules } = await supabase
      .from('reminder_rules')
      .select('thresholds, email_reminders_enabled')
      .eq('business_id', business.id)
      .maybeSingle();

    const thresholds = (rules?.thresholds || [7, 30, 60]).join(', ');
    const enabled = rules ? rules.email_reminders_enabled : true;

    const wrap = document.getElementById('reminderSettings');
    wrap.innerHTML = `
      <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; margin-bottom:10px;">
        <input type="checkbox" id="remindersEnabled" ${enabled ? 'checked' : ''}>
        Send automated email reminders
      </label>
      <label style="font-size:0.78rem; opacity:0.7; display:block; margin-bottom:3px;">Remind at these days overdue (comma-separated)</label>
      <input type="text" id="remindersThresholds" value="${escapeHtml(thresholds)}" style="width:220px; padding:8px 10px; border:1px solid var(--line); border-radius:6px; font-family:inherit; font-size:0.9rem; margin-bottom:10px;">
      <div><button id="saveReminderRules" class="btn primary small">Save</button></div>
    `;

    document.getElementById('saveReminderRules').addEventListener('click', async () => {
      const enabledVal = document.getElementById('remindersEnabled').checked;
      const thresholdsVal = document.getElementById('remindersThresholds').value
        .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);

      const { error } = await supabase.from('reminder_rules').upsert({
        business_id: business.id,
        thresholds: thresholdsVal.length ? thresholdsVal : [7, 30, 60],
        email_reminders_enabled: enabledVal,
        updated_at: new Date().toISOString()
      }, { onConflict: 'business_id' });

      if (error) { toast('Could not save reminder settings: ' + error.message); return; }
      toast('Reminder settings saved.');
    });
  }

  // ---------- Analytics ----------
  const CHART_COLORS = {
    inkGreenDeep: '#0D2620', gold: '#C79A3C', red: '#A8342A',
    lineGrey: 'rgba(35,39,34,0.12)', textGrey: '#5c625b'
  };

  function lastNMonths(n) {
    const months = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleDateString('en-GB', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() });
    }
    return months;
  }
  function monthEnd(year, month) { return new Date(year, month + 1, 0, 23, 59, 59); }
  function monthStart(year, month) { return new Date(year, month, 1, 0, 0, 0); }

  function drawChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(canvas.getContext('2d'), config);
  }

  function renderAnalytics() {
    const hasData = receivables.length > 0;
    document.getElementById('analyticsEmpty').style.display = hasData ? 'none' : 'block';
    document.getElementById('analyticsGrid').style.display = hasData ? 'grid' : 'none';
    if (!hasData) return;

    // --- Aging distribution ---
    const outstanding = receivables
      .filter(rv => rv.payment_status !== 'paid')
      .map(rv => ({ ...rv, overdueDays: daysOverdue(rv.due_date), balance: Number(rv.amount) - Number(rv.amount_paid || 0) }));
    const buckets = { current: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
    outstanding.forEach(rv => { buckets[agingBucket(rv.overdueDays)] += rv.balance; });

    drawChart('chartAging', {
      type: 'bar',
      data: {
        labels: Object.values(BUCKET_LABEL),
        datasets: [{ data: Object.keys(BUCKET_LABEL).map(k => buckets[k]), backgroundColor: CHART_COLORS.inkGreenDeep, borderRadius: 4 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => naira(ctx.raw) } } },
        scales: { y: { ticks: { callback: (v) => '\u20a6' + Number(v).toLocaleString('en-NG') } } }
      }
    });

    // --- Top 5 debtors ---
    const topDebtors = Object.values(byClient).sort((a, b) => b.balance - a.balance).slice(0, 5);
    drawChart('chartTopDebtors', {
      type: 'bar',
      data: {
        labels: topDebtors.map(d => d.client.name),
        datasets: [{ data: topDebtors.map(d => d.balance), backgroundColor: CHART_COLORS.gold, borderRadius: 4 }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => naira(ctx.raw) } } },
        scales: { x: { ticks: { callback: (v) => '\u20a6' + Number(v).toLocaleString('en-NG') } } }
      }
    });

    // --- Collected vs new balances, last 6 months ---
    const months = lastNMonths(6);
    const collectedByMonth = months.map(({ year, month }) => {
      const start = monthStart(year, month), end = monthEnd(year, month);
      return paymentEvents
        .filter(p => { const d = new Date(p.paid_at); return d >= start && d <= end; })
        .reduce((s, p) => s + Number(p.amount), 0);
    });
    const newByMonth = months.map(({ year, month }) => {
      const start = monthStart(year, month), end = monthEnd(year, month);
      return receivables
        .filter(rv => { const d = new Date(rv.created_at); return d >= start && d <= end; })
        .reduce((s, rv) => s + Number(rv.amount), 0);
    });

    drawChart('chartMonthly', {
      type: 'bar',
      data: {
        labels: months.map(m => m.label),
        datasets: [
          { label: 'New balances', data: newByMonth, backgroundColor: '#d8d4c8' },
          { label: 'Collected', data: collectedByMonth, backgroundColor: CHART_COLORS.inkGreenDeep }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${naira(ctx.raw)}` } } },
        scales: { y: { ticks: { callback: (v) => '\u20a6' + Number(v).toLocaleString('en-NG') } } }
      }
    });

    // --- DSO trend, last 6 months ---
    // Same formula as computeDSO(), evaluated as-of each month-end instead
    // of "now": outstanding as of that date, divided by the trailing
    // 90-day volume of new balances ending at that date.
    const dsoByMonth = months.map(({ year, month }) => {
      const asOf = monthEnd(year, month);
      const createdByThen = receivables.filter(rv => new Date(rv.created_at) <= asOf);
      const totalCreated = createdByThen.reduce((s, rv) => s + Number(rv.amount), 0);
      const paidByThen = paymentEvents.filter(p => new Date(p.paid_at) <= asOf).reduce((s, p) => s + Number(p.amount), 0);
      const outstandingAsOf = totalCreated - paidByThen;

      const since = new Date(asOf); since.setDate(since.getDate() - 90);
      const recentTotal = createdByThen
        .filter(rv => new Date(rv.created_at) >= since)
        .reduce((s, rv) => s + Number(rv.amount), 0);

      return recentTotal > 0 ? Math.round((outstandingAsOf / recentTotal) * 90) : null;
    });

    drawChart('chartDSOTrend', {
      type: 'line',
      data: {
        labels: months.map(m => m.label),
        datasets: [{ data: dsoByMonth, borderColor: CHART_COLORS.gold, backgroundColor: CHART_COLORS.gold, tension: 0.3, spanGaps: true }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.raw ?? '—'} days` } } },
        scales: { y: { ticks: { callback: (v) => v + 'd' } } }
      }
    });
  }

  await loadAll();
  computePaymentBehaviour();
  computeDSO();
  renderAging();
  renderLedger();
  renderEntryForm();
  renderPromiseList();
  renderActivity();
  renderAnalytics();
  loadAndRenderReminderSettings();
  loadAndRenderPriorities();
})();
