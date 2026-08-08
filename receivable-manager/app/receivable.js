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
      <strong style="font-size:0.9rem;">Aging summary</strong>
      <div class="aging-grid" id="agingGrid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; margin-top:12px;"></div>
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

  async function loadAll() {
    const [c, r, p, n, a] = await Promise.all([
      supabase.from('clients').select('id, name, phone, email, credit_limit, address').eq('business_id', business.id).order('name', { ascending: true }),
      supabase.from('receivables').select('id, client_id, description, amount, amount_paid, due_date, payment_status, source, created_at').eq('business_id', business.id).order('due_date', { ascending: true }),
      supabase.from('promise_to_pay').select('id, client_id, promised_date, promised_amount, note, status, created_at').eq('business_id', business.id).order('promised_date', { ascending: true }),
      supabase.from('collection_notes').select('id, client_id, note, created_at').eq('business_id', business.id).order('created_at', { ascending: false }),
      supabase.from('credit_audit_log').select('id, client_id, action, details, created_at, clients(name)').eq('business_id', business.id).order('created_at', { ascending: false }).limit(30)
    ]);
    clients = c.data || [];
    receivables = r.data || [];
    promises = p.data || [];
    notes = n.data || [];
    activity = a.data || [];
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
              <div class="pr-meta">${row.items.length} open item${row.items.length > 1 ? 's' : ''}</div>
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

    const itemRows = row.items.map(rv => `
      <tr>
        <td>${escapeHtml(rv.description || 'Balance')}</td>
        <td>${fmtDate(rv.due_date)}</td>
        <td>${naira(rv.balance)}</td>
        <td><button data-pay="${rv.id}" class="btn small">Log payment</button></td>
      </tr>
    `).join('');

    const pList = clientPromises(cid);
    const nList = clientNotes(cid);

    detail.innerHTML = `
      <table style="width:100%; font-size:0.85rem; margin-bottom:12px;">
        <thead><tr><th style="text-align:left;">Item</th><th style="text-align:left;">Due</th><th style="text-align:left;">Balance</th><th></th></tr></thead>
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

        const newAmountPaid = Number(item.amount_paid || 0) + amountNum;
        const newStatus = newAmountPaid >= Number(item.amount) ? 'paid' : 'partial';

        const { error } = await supabase.from('receivables')
          .update({ amount_paid: newAmountPaid, payment_status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) { toast('Could not log payment: ' + error.message); return; }

        await logActivity('payment_logged', { amount: amountNum }, cid);
        toast('Payment logged.');
        await loadAll();
        renderAging();
        renderLedger();
        computeDSO();
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

  await loadAll();
  computeDSO();
  renderAging();
  renderLedger();
  renderEntryForm();
  renderPromiseList();
  renderActivity();
  loadAndRenderReminderSettings();
})();
