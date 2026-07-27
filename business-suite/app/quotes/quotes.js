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

  const isGrowth = business.suite_tier === 'growth';
  const wrap = document.getElementById('quoteListWrap');

  async function logQuoteActivity(action, quoteId, clientId, details = {}) {
    if (!isGrowth) return;
    await supabase.from('quote_audit_log').insert({
      business_id: business.id,
      client_id: clientId,
      quote_id: quoteId,
      actor_type: 'staff',
      actor_user_id: session.user.id,
      action,
      details
    });
  }

  function renderAnalytics(quotes) {
    if (!isGrowth) return;
    document.getElementById('analyticsPanel').style.display = 'block';
    const total = quotes.length;
    const viewedOrLater = quotes.filter(q => ['viewed', 'accepted', 'declined'].includes(q.quote_status)).length;
    const decided = quotes.filter(q => ['accepted', 'declined'].includes(q.quote_status)).length;
    const accepted = quotes.filter(q => q.quote_status === 'accepted');

    document.getElementById('anSent').textContent = total;
    document.getElementById('anViewRate').textContent = total ? Math.round((viewedOrLater / total) * 100) + '%' : '—';
    document.getElementById('anAcceptRate').textContent = decided ? Math.round((accepted.length / decided) * 100) + '%' : '—';
    document.getElementById('anAcceptedValue').textContent = naira(accepted.reduce((s, q) => s + Number(q.amount), 0));
  }

  let shareLinks = {};
  async function loadShareLinks(quoteIds) {
    if (!isGrowth || !quoteIds.length) return;
    const { data } = await supabase.from('quote_share_links').select('quote_id, token').in('quote_id', quoteIds);
    (data || []).forEach(l => { shareLinks[l.quote_id] = l.token; });
  }

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

    renderAnalytics(quotes);
    await loadShareLinks(quotes.map(q => q.id));

    wrap.innerHTML = quotes.map(q => {
      const quoteNumber = (q.data && q.data.quoteNumber) || 'Quote';
      const converted = q.data && q.data.convertedToInvoiceId;
      const token = shareLinks[q.id];
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
            ${isGrowth && token ? `<button class="convert-btn" data-copy-link="${token}">Copy client link</button>` : ''}
            <button class="convert-btn" data-convert="${q.id}" ${converted ? 'disabled' : ''}>
              ${converted ? 'Converted' : 'Convert to invoice'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    wrap.querySelectorAll('[data-copy-link]').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = `${window.location.origin}/proposal/?t=${btn.dataset.copyLink}`;
        navigator.clipboard.writeText(url);
        toast('Client approval link copied.');
      });
    });

    wrap.querySelectorAll('[data-status-for]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.statusFor;
        const quote = quotes.find(q => q.id === id);
        const newStatus = sel.value;
        sel.className = `status-select ${newStatus}`;
        const { error } = await supabase.from('documents').update({ quote_status: newStatus }).eq('id', id);
        if (error) { toast('Could not update status: ' + error.message); return; }
        toast('Status updated.');
        await logQuoteActivity('status_changed_manually', id, quote.client_id, { to: newStatus });
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

        await logQuoteActivity('converted_to_invoice', quote.id, quote.client_id, { invoice_id: newInvoice.id, invNumber });

        toast(`Converted to ${invNumber}.`);
        loadQuotes();
      });
    });
  }

  loadQuotes();
})();
