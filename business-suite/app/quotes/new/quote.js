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

  window.renderCacFooter(business, 'pCacFooter', '.form-panel');

  const isGrowth = business.suite_tier === 'growth';
  let templates = [];
  if (isGrowth) {
    document.querySelectorAll('.growth-only').forEach(el => { el.style.display = ''; });

    const { data: tpls } = await supabase
      .from('quote_templates')
      .select('id, name, items, proposal_sections, default_note')
      .eq('business_id', business.id)
      .order('name');
    templates = tpls || [];

    const templateSelect = document.getElementById('templateSelect');
    templateSelect.innerHTML = '<option value="">Blank quote</option>' +
      templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

    templateSelect.addEventListener('change', () => {
      const tpl = templates.find(t => t.id === templateSelect.value);
      document.getElementById('itemRows').innerHTML = '';
      document.getElementById('proposalSections').innerHTML = '';
      if (tpl) {
        (tpl.items || []).forEach(it => addItemRow(it.desc, it.qty, it.price));
        (tpl.proposal_sections || []).forEach(s => addSectionRow(s.title, s.body));
        if (tpl.default_note) document.getElementById('quoteNote').value = tpl.default_note;
      } else {
        addItemRow();
      }
      renderPreview();
    });

    document.getElementById('saveTemplateBtn').addEventListener('click', async () => {
      const name = window.prompt('Name this template (e.g. "Website build — standard package"):');
      if (!name) return;
      const { error } = await supabase.from('quote_templates').insert({
        business_id: business.id,
        name,
        items: getItems(),
        proposal_sections: getSections(),
        default_note: document.getElementById('quoteNote').value || null,
        created_by: session.user.id
      });
      if (error) { showMsg('Could not save template: ' + error.message, 'error'); return; }
      showMsg('Template saved.', 'success');
    });
  }

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, tin')
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
      currentClient = client ? { id: client.id, name: client.name, tin: client.tin } : null;
      window.renderCacFooter(business, 'pCacFooter', '.form-panel', currentClient && currentClient.tin);
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

    const { data: saved, error } = await supabase.from('documents').insert({
      business_id: business.id,
      user_id: session.user.id,
      doc_type: 'quotation',
      client_id: currentClient.id,
      due_date: data.validUntilRaw || null,
      amount: data.total,
      vat_amount: data.vat,
      quote_status: 'sent',
      data: quoteData
    }).select().single();

    btn.disabled = false;
    btn.textContent = 'Save & send quote';

    if (error) {
      showMsg('Could not save quote: ' + error.message, 'error');
      return;
    }

    if (isGrowth && saved) {
      await supabase.from('quote_versions').insert({
        business_id: business.id,
        quote_id: saved.id,
        version_number: 1,
        snapshot: quoteData,
        created_by: session.user.id
      });

      const { data: link } = await supabase.from('quote_share_links').insert({
        business_id: business.id,
        quote_id: saved.id
      }).select().single();

      await supabase.from('quote_audit_log').insert({
        business_id: business.id,
        client_id: currentClient.id,
        quote_id: saved.id,
        actor_type: 'staff',
        actor_user_id: session.user.id,
        action: 'quote_created',
        details: { total: data.total }
      });

      if (link) {
        const url = `${window.location.origin}/proposal/?t=${link.token}`;
        const box = document.getElementById('shareLinkBox');
        const anchor = document.getElementById('shareLinkAnchor');
        anchor.href = url;
        anchor.textContent = url;
        box.style.display = 'block';
        document.getElementById('copyShareLinkBtn').addEventListener('click', () => {
          navigator.clipboard.writeText(url);
          showMsg('Link copied. Quote saved — you can keep this tab open or head to your quotes list.', 'success');
        });
      }
    }

    showMsg(isGrowth ? 'Quote saved. Copy the client approval link below, or head to your quotes list.' : 'Quote saved. Redirecting to your quotes list…', 'success');
    if (!isGrowth) {
      setTimeout(() => { window.location.href = '/business-suite/app/quotes/'; }, 1200);
    }
  });

  function buildQuotePdf(data) {
    const rows = data.items.map(it => [it.desc, it.qty, naira(it.qty * it.price)]);
    const totals = [{ label: 'Subtotal', value: naira(data.subtotal) }];
    if (data.vatOn) totals.push({ label: 'VAT (7.5%)', value: naira(data.vat) });
    totals.push({ label: 'Estimated total', value: naira(data.total), emphasis: true });

    return KoboExport.buildTablePdf({
      style: 'branded',
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

  document.getElementById('downloadBtn').addEventListener('click', async () => {
    const data = renderPreview();
    try {
      const doc = await buildQuotePdf(data);
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
      const doc = await buildQuotePdf(data);
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
