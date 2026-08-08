// ---------- Credit & Collections Manager (Business Suite Growth) ----------
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

(async function init() {
  const ctx = await window.BizSuiteGuard.requireGrowthAccess();
  if (!ctx) return;
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

  // ---------- Load everything up front ----------
  // Reads from `receivables`, not `documents`, directly — a trigger keeps
  // receivables in sync with every invoice document, and this is the same
  // table Receivable Manager (the standalone product) reads from, so the
  // two products share one aging/ledger engine.
  const [{ data: invoices }, { data: promises }, { data: notes }, { data: activity }] = await Promise.all([
    supabase
      .from('receivables')
      .select('id, amount, amount_paid, payment_status, due_date, description, client_id, created_at, clients(id, name, phone, email, credit_limit, address)')
      .eq('business_id', business.id)
      .order('due_date', { ascending: true }),
    supabase
      .from('promise_to_pay')
      .select('id, client_id, document_id, promised_date, promised_amount, note, status, created_at')
      .eq('business_id', business.id)
      .order('promised_date', { ascending: true }),
    supabase
      .from('collection_notes')
      .select('id, client_id, note, created_at')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('credit_audit_log')
      .select('id, client_id, action, details, created_at, clients(name)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(30)
  ]);

  const allInvoices = invoices || [];
  const outstanding = allInvoices
    .filter(d => d.payment_status !== 'paid')
    .map(d => ({ ...d, overdueDays: daysOverdue(d.due_date), balance: Number(d.amount) - Number(d.amount_paid || 0) }));

  // ---------- Aging summary ----------
  const buckets = { current: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
  outstanding.forEach(d => { buckets[agingBucket(d.overdueDays)] += d.balance; });
  const total = Object.values(buckets).reduce((s, v) => s + v, 0);

  document.getElementById('agTotal').textContent = naira(total);
  document.getElementById('agCurrent').textContent = naira(buckets.current);
  document.getElementById('ag30').textContent = naira(buckets.b1);
  document.getElementById('ag60').textContent = naira(buckets.b2);
  document.getElementById('ag90').textContent = naira(buckets.b3);
  document.getElementById('ag90plus').textContent = naira(buckets.b4);

  // ---------- Group by client ----------
  const byClient = {};
  outstanding.forEach(d => {
    if (!d.client_id) return;
    if (!byClient[d.client_id]) byClient[d.client_id] = { client: d.clients, invoices: [], balance: 0, worstBucket: 'current' };
    byClient[d.client_id].invoices.push(d);
    byClient[d.client_id].balance += d.balance;
    const order = ['current', 'b1', 'b2', 'b3', 'b4'];
    const bucket = agingBucket(d.overdueDays);
    if (order.indexOf(bucket) > order.indexOf(byClient[d.client_id].worstBucket)) {
      byClient[d.client_id].worstBucket = bucket;
    }
  });

  const clientIds = Object.keys(byClient).sort((a, b) => byClient[b].balance - byClient[a].balance);

  const ledgerWrap = document.getElementById('ledgerWrap');
  if (!clientIds.length) {
    ledgerWrap.innerHTML = '<div class="empty-note">Nothing outstanding — every account is settled.</div>';
  } else {
    ledgerWrap.innerHTML = clientIds.map(cid => {
      const row = byClient[cid];
      const client = row.client || { name: 'Unknown client' };
      const overLimit = client.credit_limit && row.balance > Number(client.credit_limit);
      return `
        <div class="ledger-row" data-client="${cid}">
          <div class="ledger-head" data-toggle="${cid}">
            <div>
              <div class="ledger-client">${client.name}
                <span class="bucket-tag ${row.worstBucket}">${BUCKET_LABEL[row.worstBucket]}</span>
                ${overLimit ? `<span class="credit-flag">Over ${naira(client.credit_limit)} limit</span>` : ''}
              </div>
              <div class="ledger-meta">${row.invoices.length} open invoice${row.invoices.length > 1 ? 's' : ''}</div>
            </div>
            <div class="ledger-amount">${naira(row.balance)}</div>
          </div>
          <div class="ledger-detail" id="detail-${cid}"></div>
        </div>
      `;
    }).join('');

    ledgerWrap.querySelectorAll('[data-toggle]').forEach(head => {
      head.addEventListener('click', () => {
        const cid = head.dataset.toggle;
        const detail = document.getElementById(`detail-${cid}`);
        const isOpen = detail.classList.contains('open');
        ledgerWrap.querySelectorAll('.ledger-detail.open').forEach(d => d.classList.remove('open'));
        if (!isOpen) {
          renderClientDetail(cid);
          detail.classList.add('open');
        }
      });
    });
  }

  function clientPromises(cid) { return (promises || []).filter(p => p.client_id === cid); }
  function clientNotes(cid) { return (notes || []).filter(n => n.client_id === cid); }

  function renderClientDetail(cid) {
    const row = byClient[cid];
    const client = row.client || {};
    const detail = document.getElementById(`detail-${cid}`);

    const invoiceRows = row.invoices.map(d => `
      <tr>
        <td>${escapeHtml(d.description || 'Invoice')}</td>
        <td>${fmtDate(d.due_date)}</td>
        <td>${naira(d.balance)}</td>
      </tr>
    `).join('');

    const pList = clientPromises(cid);
    const nList = clientNotes(cid);

    detail.innerHTML = `
      <table>
        <thead><tr><th>Invoice</th><th>Due</th><th>Balance</th></tr></thead>
        <tbody>${invoiceRows}</tbody>
      </table>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        <a href="#" data-statement="${cid}" class="btn btn-ghost" style="font-size:0.8rem; padding:6px 12px;">Download statement (PDF)</a>
        ${client.phone ? `<button data-remind="${cid}" style="font-size:0.8rem; border:1px solid var(--line); background:none; border-radius:20px; padding:6px 12px; cursor:pointer;">WhatsApp reminder</button>` : ''}
      </div>

      <strong style="font-size:0.82rem;">Promises to pay</strong>
      <div style="margin:6px 0 10px;">
        ${pList.length ? pList.map(p => `
          <div class="promise-item">
            ${fmtDate(p.promised_date)} — ${naira(p.promised_amount)}
            <span class="promise-status ${p.status}">${p.status}</span>
            ${p.note ? `<div style="opacity:0.7;">${escapeHtml(p.note)}</div>` : ''}
            ${p.status === 'pending' ? `
              <div style="margin-top:4px;">
                <button data-resolve="${p.id}" data-outcome="kept" style="font-size:0.72rem; border:1px solid var(--line); background:none; border-radius:14px; padding:2px 8px; cursor:pointer;">Mark kept</button>
                <button data-resolve="${p.id}" data-outcome="broken" style="font-size:0.72rem; border:1px solid var(--line); background:none; border-radius:14px; padding:2px 8px; cursor:pointer;">Mark broken</button>
              </div>` : ''}
          </div>
        `).join('') : '<div class="empty-note" style="padding:8px 0;">No promises logged yet.</div>'}
      </div>
      <div class="mini-form">
        <div><label>Promised date</label><input type="date" id="pDate-${cid}"></div>
        <div><label>Amount</label><input type="number" id="pAmount-${cid}" placeholder="0" style="width:120px;"></div>
        <div style="flex:1; min-width:160px;"><label>Note (optional)</label><input type="text" id="pNote-${cid}" placeholder="e.g. will pay after month-end"></div>
        <button data-add-promise="${cid}" class="btn btn-primary" style="font-size:0.8rem; padding:6px 14px;">Log promise</button>
      </div>

      <strong style="font-size:0.82rem; display:block; margin-top:16px;">Collection notes</strong>
      <div style="margin:6px 0 10px;">
        ${nList.length ? nList.map(n => `
          <div class="note-item"><span class="activity-time">${fmtDateTime(n.created_at)}</span><div>${escapeHtml(n.note)}</div></div>
        `).join('') : '<div class="empty-note" style="padding:8px 0;">No notes yet.</div>'}
      </div>
      <div class="mini-form">
        <div style="flex:1; min-width:200px;"><label>Add a note</label><textarea id="noteText-${cid}" placeholder="Spoke with client, they confirmed receipt of goods…"></textarea></div>
        <button data-add-note="${cid}" class="btn btn-primary" style="font-size:0.8rem; padding:6px 14px;">Save note</button>
      </div>
    `;

    detail.querySelector(`[data-statement="${cid}"]`).addEventListener('click', async (e) => {
      e.preventDefault();
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
    const client = row.client || {};

    const rows = row.invoices.map(d => [
      d.description || 'Invoice',
      fmtDate(d.due_date),
      naira(Number(d.amount)),
      naira(Number(d.amount_paid || 0)),
      naira(d.balance)
    ]);

    const doc = await window.KoboExport.buildTablePdf({
      style: 'branded',
      docLabel: 'Statement',
      businessName: business.name,
      metaLines: [`Statement date: ${fmtDate(new Date().toISOString())}`],
      toLabel: 'Customer',
      toName: client.name,
      toSub: client.address || '',
      columns: ['Invoice', 'Due date', 'Amount', 'Paid', 'Balance'],
      rightAlignCols: [2, 3, 4],
      rows,
      totals: [{ label: 'Total outstanding', value: naira(row.balance), emphasis: true }],
      note: 'This statement reflects open invoices only. Contact us if any balance here looks incorrect.'
    });

    window.KoboExport.download(`Statement-${(client.name || 'customer').replace(/\s+/g, '-')}.pdf`, doc);
    await logActivity('statement_generated', { balance: row.balance }, cid);
  }

  // ---------- Promises panel (all clients) ----------
  function renderPromiseList() {
    const wrap = document.getElementById('promiseWrap');
    const list = (promises || []).slice().sort((a, b) => new Date(a.promised_date) - new Date(b.promised_date));
    if (!list.length) {
      wrap.innerHTML = '<div class="empty-note">No promises logged yet.</div>';
      return;
    }
    wrap.innerHTML = list.map(p => {
      const client = (byClient[p.client_id] && byClient[p.client_id].client) || { name: 'Client' };
      return `
        <div class="promise-item">
          <strong>${client.name}</strong> — ${naira(p.promised_amount)} promised for ${fmtDate(p.promised_date)}
          <span class="promise-status ${p.status}">${p.status}</span>
        </div>
      `;
    }).join('');
  }
  renderPromiseList();

  // ---------- Activity feed ----------
  const activityWrap = document.getElementById('activityWrap');
  const activityLog = activity || [];
  if (!activityLog.length) {
    activityWrap.innerHTML = '<div class="empty-note">No activity yet.</div>';
  } else {
    const ACTION_LABEL = {
      credit_limit_changed: 'Credit limit changed',
      promise_logged: 'Promise to pay logged',
      promise_resolved: 'Promise resolved',
      note_added: 'Collection note added',
      reminder_sent: 'Reminder sent',
      statement_generated: 'Statement generated'
    };
    activityWrap.innerHTML = activityLog.map(a => `
      <div class="activity-item">
        <span class="activity-time">${fmtDateTime(a.created_at)}</span> —
        ${ACTION_LABEL[a.action] || a.action}${a.clients ? ` · ${a.clients.name}` : ''}
      </div>
    `).join('');
  }
})();

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
