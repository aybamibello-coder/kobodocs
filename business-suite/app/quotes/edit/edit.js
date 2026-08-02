// ---------- Business Suite quote editing ----------
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

let sectionId = 0;
function addSectionRow(title = '', body = '') {
  sectionId++;
  const row = document.createElement('div');
  row.className = 'section-row';
  row.dataset.id = sectionId;
  row.innerHTML = `
    <button type="button" class="section-remove" aria-label="Remove section">&times;</button>
    <input type="text" class="section-title" placeholder="Section title (e.g. Overview)" value="${title}">
    <textarea class="section-body" placeholder="Section content…">${body}</textarea>
  `;
  document.getElementById('proposalSections').appendChild(row);
  row.querySelector('.section-remove').addEventListener('click', () => row.remove());
}

function getSections() {
  return [...document.querySelectorAll('.section-row')]
    .map(row => ({ title: row.querySelector('.section-title').value.trim(), body: row.querySelector('.section-body').value.trim() }))
    .filter(s => s.title || s.body);
}

document.getElementById('addSectionBtn').addEventListener('click', () => addSectionRow());

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

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

function lockEditor(message) {
  document.getElementById('editorSection').style.display = 'none';
  const notice = document.getElementById('lockedNotice');
  notice.style.display = 'block';
  notice.textContent = message;
}

(async function init() {
  const ctx = await window.BizSuiteGuard.requireAccess();
  if (!ctx) return;
  const { business, supabase, session } = ctx;

  const quoteId = new URLSearchParams(window.location.search).get('id');
  if (!quoteId) { lockEditor('No quote specified.'); return; }

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

  window.renderCacFooter(business, 'pCacFooter', '.form-panel');

  const isGrowth = business.suite_tier === 'growth';
  if (isGrowth) document.querySelectorAll('.growth-only').forEach(el => { el.style.display = ''; });

  const { data: quote } = await supabase
    .from('documents')
    .select('id, amount, vat_amount, quote_status, due_date, data, client_id, business_id, clients(id, name)')
    .eq('id', quoteId)
    .eq('business_id', business.id)
    .eq('doc_type', 'quotation')
    .maybeSingle();

  if (!quote) { lockEditor('This quote could not be found.'); return; }

  if (['accepted', 'declined'].includes(quote.quote_status)) {
    lockEditor(`This quote has already been ${quote.quote_status} by the client and can no longer be edited. Create a new quote if terms have changed.`);
    return;
  }

  const previousStatus = quote.quote_status;
  currentClient = quote.clients ? { id: quote.clients.id, name: quote.clients.name } : null;

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('business_id', business.id)
    .order('name');

  const select = document.getElementById('clientSelect');
  select.innerHTML = (clients || []).map(c =>
    `<option value="${c.id}" ${currentClient && currentClient.id === c.id ? 'selected' : ''}>${c.name}</option>`
  ).join('');
  select.addEventListener('change', () => {
    const client = (clients || []).find(c => c.id === select.value);
    currentClient = client ? { id: client.id, name: client.name } : null;
    renderPreview();
  });

  document.getElementById('quoteNumber').value = (quote.data && quote.data.quoteNumber) || 'Quote';
  document.getElementById('quoteDate').value = (quote.data && quote.data.quoteDate) || '';
  document.getElementById('validUntil').value = quote.due_date || '';
  document.getElementById('vatToggle').checked = !!(quote.data && quote.data.vatOn);
  document.getElementById('quoteNote').value = (quote.data && quote.data.note) || '';

  document.getElementById('itemRows').innerHTML = '';
  ((quote.data && quote.data.items) || []).forEach(it => addItemRow(it.desc, it.qty, it.price));
  if (!document.getElementById('itemRows').children.length) addItemRow();

  if (isGrowth) {
    document.getElementById('proposalSections').innerHTML = '';
    ((quote.data && quote.data.proposalSections) || []).forEach(s => addSectionRow(s.title, s.body));

    const { data: versions } = await supabase
      .from('quote_versions')
      .select('version_number, created_at')
      .eq('quote_id', quoteId)
      .order('version_number', { ascending: false });

    if (versions && versions.length) {
      const historyEl = document.getElementById('versionHistory');
      historyEl.style.display = 'block';
      historyEl.innerHTML = '<strong>Version history</strong><ul>' +
        versions.map(v => `<li>v${v.version_number} — ${new Date(v.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</li>`).join('') +
        '</ul>';
    }
  }

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

    const proposalSections = isGrowth ? getSections() : [];

    const quoteData = {
      quoteNumber: data.quoteNumber,
      quoteDate: data.quoteDateRaw,
      clientName: currentClient.name,
      items: data.items,
      subtotal: data.subtotal,
      vatOn: data.vatOn,
      note: data.note,
      proposalSections
    };

    // Editing a quote the client has already seen brings it back to
    // "sent" so they notice it changed; a fresh, unopened quote just
    // stays "sent".
    const nextStatus = previousStatus === 'viewed' || previousStatus === 'expired' ? 'sent' : previousStatus;

    const { error } = await supabase.from('documents').update({
      client_id: currentClient.id,
      due_date: data.validUntilRaw || null,
      amount: data.total,
      vat_amount: data.vat,
      quote_status: nextStatus,
      data: quoteData
    }).eq('id', quoteId);

    btn.disabled = false;
    btn.textContent = 'Save changes';

    if (error) {
      showMsg('Could not save changes: ' + error.message, 'error');
      return;
    }

    if (isGrowth) {
      const { data: lastVersion } = await supabase
        .from('quote_versions')
        .select('version_number')
        .eq('quote_id', quoteId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextVersion = (lastVersion ? lastVersion.version_number : 0) + 1;

      await supabase.from('quote_versions').insert({
        business_id: business.id,
        quote_id: quoteId,
        version_number: nextVersion,
        snapshot: quoteData,
        created_by: session.user.id
      });

      await supabase.from('quote_audit_log').insert({
        business_id: business.id,
        client_id: currentClient.id,
        quote_id: quoteId,
        actor_type: 'staff',
        actor_user_id: session.user.id,
        action: 'quote_edited',
        details: { version: nextVersion, total: data.total }
      });
    }

    showMsg('Quote updated. Redirecting to your quotes list…', 'success');
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
})();
