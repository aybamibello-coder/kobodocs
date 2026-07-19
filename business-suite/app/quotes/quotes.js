// ---------- Quotes list: status tracking + convert-to-invoice ----------
const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (isoDate) => isoDate
  ? new Date(isoDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2600);
}

(async function init() {
  const ctx = await window.BizSuiteGuard.requireAccess();
  if (!ctx) return;
  const { business, supabase, session } = ctx;

  const wrap = document.getElementById('quoteListWrap');

  async function loadQuotes() {
    const { data: quotes } = await supabase
      .from('documents')
      .select('id, amount, vat_amount, quote_status, due_date, data, client_id, created_at, clients(name)')
      .eq('business_id', business.id)
      .eq('doc_type', 'quotation')
      .order('created_at', { ascending: false });

    if (!quotes || !quotes.length) {
      wrap.innerHTML = '<div class="empty-note">No quotes yet — create your first one.</div>';
      return;
    }

    wrap.innerHTML = quotes.map(q => {
      const quoteNumber = (q.data && q.data.quoteNumber) || 'Quote';
      const converted = q.data && q.data.convertedToInvoiceId;
      return `
        <div class="q-row" data-id="${q.id}">
          <div>
            <div class="q-client">${(q.clients && q.clients.name) || '—'}</div>
            <div class="q-meta">${quoteNumber} · ${q.due_date ? 'Valid until ' + fmtDate(q.due_date) : fmtDate(q.created_at)}</div>
          </div>
          <div class="q-actions">
            <div class="q-amount">${naira(q.amount)}</div>
            <select class="status-select ${q.quote_status}" data-status-for="${q.id}">
              ${['sent', 'viewed', 'accepted', 'expired'].map(s =>
                `<option value="${s}" ${q.quote_status === s ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
            <button class="convert-btn" data-convert="${q.id}" ${converted ? 'disabled' : ''}>
              ${converted ? 'Converted' : 'Convert to invoice'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    wrap.querySelectorAll('[data-status-for]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.statusFor;
        const newStatus = sel.value;
        sel.className = `status-select ${newStatus}`;
        const { error } = await supabase.from('documents').update({ quote_status: newStatus }).eq('id', id);
        if (error) toast('Could not update status: ' + error.message);
        else toast('Status updated.');
      });
    });

    wrap.querySelectorAll('[data-convert]:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.convert;
        const quote = quotes.find(q => q.id === id);
        btn.disabled = true;
        btn.textContent = 'Converting…';

        const { count } = await supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', business.id)
          .eq('doc_type', 'invoice');
        const invNumber = `INV-${String((count || 0) + 1).padStart(4, '0')}`;

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);

        const { data: newInvoice, error } = await supabase.from('documents').insert({
          business_id: business.id,
          user_id: session.user.id,
          doc_type: 'invoice',
          client_id: quote.client_id,
          due_date: dueDate.toISOString().split('T')[0],
          amount: quote.amount,
          vat_amount: quote.vat_amount,
          payment_status: 'unpaid',
          amount_paid: 0,
          data: {
            invNumber,
            invDate: new Date().toISOString().split('T')[0],
            clientName: quote.clients ? quote.clients.name : '',
            items: quote.data.items,
            subtotal: quote.data.subtotal,
            vatOn: quote.data.vatOn,
            whtOn: false,
            whtPercent: 0,
            note: 'Converted from ' + ((quote.data && quote.data.quoteNumber) || 'quote')
          }
        }).select().single();

        if (error) {
          toast('Could not convert: ' + error.message);
          btn.disabled = false;
          btn.textContent = 'Convert to invoice';
          return;
        }

        await supabase.from('documents').update({
          quote_status: 'accepted',
          data: { ...quote.data, convertedToInvoiceId: newInvoice.id }
        }).eq('id', quote.id);

        toast(`Converted to ${invNumber}.`);
        loadQuotes();
      });
    });
  }

  loadQuotes();
})();
