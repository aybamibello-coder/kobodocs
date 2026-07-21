// ---------- Business Suite quote creation ----------
const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (isoDate) => isoDate
  ? new Date(isoDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

let itemId = 0;
function addItemRow(desc = '', qty = 1, price = '') {
  itemId++;
  const row = document.createElement('div');
  row.className = 'item-row';
  row.dataset.id = itemId;
  row.innerHTML = `
    <input type="text" class="item-desc" placeholder="Item or service" value="${desc}">
    <input type="number" class="item-qty" min="1" value="${qty}">
    <input type="number" class="item-price" min="0" placeholder="Unit price (₦)" value="${price}">
    <button type="button" class="item-remove" aria-label="Remove item">&times;</button>
  `;
  document.getElementById('itemRows').appendChild(row);
  row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', renderPreview));
  row.querySelector('.item-remove').addEventListener('click', () => { row.remove(); renderPreview(); });
}

function getItems() {
  return [...document.querySelectorAll('.item-row')].map(row => ({
    desc: row.querySelector('.item-desc').value || 'Item',
    qty: parseFloat(row.querySelector('.item-qty').value) || 0,
    price: parseFloat(row.querySelector('.item-price').value) || 0
  }));
}

let currentClient = null;

function renderPreview() {
  const quoteNumber = document.getElementById('quoteNumber').value || 'Q-0001';
  const quoteDateRaw = document.getElementById('quoteDate').value;
  const validUntilRaw = document.getElementById('validUntil').value;
  const vatOn = document.getElementById('vatToggle').checked;
  const note = document.getElementById('quoteNote').value;

  document.getElementById('pQuoteNumber').textContent = quoteNumber;
  document.getElementById('pQuoteDate').textContent = fmtDate(quoteDateRaw);
  document.getElementById('pValidUntil').textContent = validUntilRaw ? 'Valid until ' + fmtDate(validUntilRaw) : '';
  document.getElementById('pClientName').textContent = (currentClient && currentClient.name) || 'Select a client';

  const items = getItems();
  document.getElementById('pItemsBody').innerHTML = items.map(it => `
    <tr>
      <td>${it.desc}</td>
      <td class="num">${it.qty}</td>
      <td class="num">${naira(it.qty * it.price)}</td>
    </tr>
  `).join('');

  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
  const vat = vatOn ? subtotal * 0.075 : 0;
  const total = subtotal + vat;

  let totalsHtml = `<div class="row"><span>Subtotal</span><span>${naira(subtotal)}</span></div>`;
  if (vatOn) totalsHtml += `<div class="row"><span>VAT (7.5%)</span><span>${naira(vat)}</span></div>`;
  totalsHtml += `<div class="row grand"><span>Estimated total</span><span>${naira(total)}</span></div>`;
  document.getElementById('pTotals').innerHTML = totalsHtml;

  const noteEl = document.getElementById('pNote');
  if (note) { noteEl.textContent = note; noteEl.style.display = 'block'; }
  else { noteEl.style.display = 'none'; }

  return { quoteNumber, quoteDateRaw, validUntilRaw, items, subtotal, vat, total, vatOn, note };
}

['quoteNumber', 'quoteDate', 'validUntil', 'quoteNote'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderPreview);
});
document.getElementById('vatToggle').addEventListener('change', renderPreview);
document.getElementById('addItemBtn').addEventListener('click', () => { addItemRow(); renderPreview(); });

document.getElementById('quoteDate').value = new Date().toISOString().split('T')[0];
addItemRow();

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

(async function init() {
  const ctx = await window.BizSuiteGuard.requireAccess();
  if (!ctx) return;
  const { business, supabase, session } = ctx;

  document.getElementById('pWatermark').classList.add('hidden');
  document.getElementById('pBizName').textContent = business.name || 'Your business';
  if (business.brand_logo_url) {
    const logo = document.getElementById('pBrandLogo');
    logo.src = business.brand_logo_url;
    logo.classList.remove('hidden');
    document.getElementById('pStamp').classList.add('hidden');
  }
  if (business.brand_color) {
    document.getElementById('docPreview').style.setProperty('--stamp-gold', business.brand_color);
  }

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('business_id', business.id)
    .order('name');

  const select = document.getElementById('clientSelect');
  if (!clients || !clients.length) {
    select.innerHTML = '<option value="">No clients yet — add one first</option>';
  } else {
    select.innerHTML = '<option value="">Select a client…</option>' +
      clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    select.addEventListener('change', () => {
      const client = clients.find(c => c.id === select.value);
      currentClient = client ? { id: client.id, name: client.name } : null;
      renderPreview();
    });
  }

  const { count } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', business.id)
    .eq('doc_type', 'quotation');
  document.getElementById('quoteNumber').value = `Q-${String((count || 0) + 1).padStart(4, '0')}`;

  renderPreview();

  document.getElementById('saveQuoteBtn').addEventListener('click', async () => {
    const data = renderPreview();
    if (!currentClient) { showMsg('Select a client before saving.', 'error'); return; }
    if (!data.items.length || data.items.every(it => !it.desc && !it.price)) {
      showMsg('Add at least one item.', 'error'); return;
    }

    const btn = document.getElementById('saveQuoteBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    const { error } = await supabase.from('documents').insert({
      business_id: business.id,
      user_id: session.user.id,
      doc_type: 'quotation',
      client_id: currentClient.id,
      due_date: data.validUntilRaw || null,
      amount: data.total,
      vat_amount: data.vat,
      quote_status: 'sent',
      data: {
        quoteNumber: data.quoteNumber,
        quoteDate: data.quoteDateRaw,
        clientName: currentClient.name,
        items: data.items,
        subtotal: data.subtotal,
        vatOn: data.vatOn,
        note: data.note
      }
    });

    btn.disabled = false;
    btn.textContent = 'Save & send quote';

    if (error) {
      showMsg('Could not save quote: ' + error.message, 'error');
      return;
    }
    showMsg('Quote saved. Redirecting to your quotes list…', 'success');
    setTimeout(() => { window.location.href = '/business-suite/app/quotes/'; }, 1200);
  });

  function buildQuotePdf(data) {
    const rows = data.items.map(it => [it.desc, it.qty, naira(it.qty * it.price)]);
    const totals = [{ label: 'Subtotal', value: naira(data.subtotal) }];
    if (data.vatOn) totals.push({ label: 'VAT (7.5%)', value: naira(data.vat) });
    totals.push({ label: 'Estimated total', value: naira(data.total), emphasis: true });

    return KoboExport.buildTablePdf({
      docLabel: 'Quotation',
      businessName: business.name,
      metaLines: [data.quoteNumber, data.validUntilRaw ? `Valid until ${fmtDate(data.validUntilRaw)}` : ''].filter(Boolean),
      toLabel: 'For',
      toName: currentClient ? currentClient.name : '',
      columns: ['Description', 'Qty', 'Amount'],
      rightAlignCols: [1, 2],
      rows,
      totals,
      note: data.note,
      watermark: false
    });
  }

  document.getElementById('downloadBtn').addEventListener('click', () => {
    const data = renderPreview();
    try {
      const doc = buildQuotePdf(data);
      KoboExport.download(`${data.quoteNumber || 'quote'}.pdf`, doc);
    } catch (err) {
      showMsg('Could not generate PDF: ' + err.message, 'error');
    }
  });

  document.getElementById('waBtn').addEventListener('click', async () => {
    const data = renderPreview();
    if (!currentClient) { showMsg('Select a client first.', 'error'); return; }
    const btn = document.getElementById('waBtn');
    const originalText = btn.textContent;

    const caption = [
      `*Quote ${data.quoteNumber}*`,
      `From: ${business.name}`,
      `To: ${currentClient.name}`,
      '',
      `Estimated total: *${naira(data.total)}*`,
      data.validUntilRaw ? `Valid until: ${fmtDate(data.validUntilRaw)}` : ''
    ].filter(Boolean).join('\n');

    try {
      const doc = buildQuotePdf(data);
      const result = await KoboExport.shareWhatsApp(`${data.quoteNumber || 'quote'}.pdf`, caption, doc);
      if (result === 'downloaded') {
        showMsg('PDF downloaded — attach it in WhatsApp. Opening WhatsApp with the caption now.', 'success');
      }
    } catch (err) {
      if (err.name !== 'AbortError') showMsg('Could not prepare the PDF: ' + err.message, 'error');
    } finally {
      btn.textContent = originalText;
    }
  });
})();
