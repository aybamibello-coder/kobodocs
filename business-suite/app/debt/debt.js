// ---------- Debt & credit dashboard ----------
const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (isoDate) => isoDate
  ? new Date(isoDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

function daysOverdue(dueDate) {
  if (!dueDate) return null;
  const ms = new Date().setHours(0,0,0,0) - new Date(dueDate).setHours(0,0,0,0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2600);
}

function reminderMessage(business, invoice, client, tone) {
  const balance = naira(Number(invoice.amount) - Number(invoice.amount_paid || 0));
  const invNumber = (invoice.data && invoice.data.invNumber) || 'your invoice';
  if (tone === 'firm') {
    return `Hello ${client.name}, this is a reminder that ${invNumber} from ${business.name} for ${balance} is now overdue. Please arrange payment as soon as possible to avoid further action. Thank you.`;
  }
  return `Hi ${client.name}, just a friendly reminder that ${invNumber} from ${business.name} for ${balance} is due. Let us know if you have any questions. Thanks!`;
}

(async function init() {
  const ctx = await window.BizSuiteGuard.requireAccess();
  if (!ctx) return;
  const { business, supabase } = ctx;

  const { data: docs } = await supabase
    .from('documents')
    .select('id, amount, amount_paid, payment_status, due_date, data, client_id, clients(id, name, phone, email, credit_limit)')
    .eq('business_id', business.id)
    .eq('doc_type', 'invoice')
    .neq('payment_status', 'paid');

  const wrap = document.getElementById('debtListWrap');
  if (!docs || !docs.length) {
    wrap.innerHTML = '<div class="empty-note">Nothing outstanding — every invoice is paid up.</div>';
    return;
  }

  // Outstanding balance per client, for credit-limit flagging
  const clientTotals = {};
  docs.forEach(d => {
    if (!d.client_id) return;
    const bal = Number(d.amount) - Number(d.amount_paid || 0);
    clientTotals[d.client_id] = (clientTotals[d.client_id] || 0) + bal;
  });

  const rows = docs
    .map(d => ({ ...d, overdueDays: daysOverdue(d.due_date), balance: Number(d.amount) - Number(d.amount_paid || 0) }))
    .sort((a, b) => {
      if (a.due_date === null) return 1;
      if (b.due_date === null) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });

  wrap.innerHTML = rows.map(d => {
    const client = d.clients || { name: 'Unknown client' };
    const invNumber = (d.data && d.data.invNumber) || 'Invoice';
    let overdueTag = '';
    if (d.overdueDays !== null) {
      if (d.overdueDays > 0) overdueTag = `<span class="overdue-tag late">${d.overdueDays}d overdue</span>`;
      else if (d.overdueDays >= -3) overdueTag = `<span class="overdue-tag soon">due soon</span>`;
    }
    const overCreditLimit = client.credit_limit && clientTotals[d.client_id] > Number(client.credit_limit);
    const creditFlag = overCreditLimit ? `<span class="credit-flag">over credit limit</span>` : '';

    return `
      <div class="debt-row" data-doc="${d.id}">
        <div>
          <div class="debt-client">${client.name}${overdueTag}${creditFlag}</div>
          <div class="debt-meta">${invNumber} · Due ${fmtDate(d.due_date)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
          <div class="debt-amount">${naira(d.balance)}</div>
          <div class="debt-actions">
            ${client.phone ? `<button class="reminder-btn" data-action="wa-polite">WhatsApp (polite)</button>` : ''}
            ${client.phone && d.overdueDays > 0 ? `<button class="reminder-btn firm" data-action="wa-firm">WhatsApp (firm)</button>` : ''}
            ${client.email ? `<button class="reminder-btn" data-action="email">Email</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('.debt-row').forEach(row => {
    const doc = rows.find(d => d.id === row.dataset.doc);
    const client = doc.clients;

    row.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const tone = action === 'wa-firm' ? 'firm' : 'polite';
        const message = reminderMessage(business, doc, client, tone);

        if (action.startsWith('wa-')) {
          const phone = client.phone.replace(/[^\d+]/g, '');
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
          await supabase.from('reminder_log').insert({ document_id: doc.id, channel: 'whatsapp', tone });
          toast('WhatsApp reminder opened and logged.');
        } else if (action === 'email') {
          window.location.href = `mailto:${client.email}?subject=${encodeURIComponent('Payment reminder — ' + business.name)}&body=${encodeURIComponent(message)}`;
          await supabase.from('reminder_log').insert({ document_id: doc.id, channel: 'email', tone: 'polite' });
          toast('Email reminder opened and logged.');
        }
      });
    });
  });
})();
