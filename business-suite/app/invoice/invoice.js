// ---------- Business Suite invoice: business-scoped, VAT/WHT, saved to Supabase ----------
const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (isoDate) => isoDate
  ? new Date(isoDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

let itemId = 0;
let inventoryItems = [];

function inventoryOptionsHtml(selectedId) {
  if (!inventoryItems.length) return '<option value="">Custom item</option>';
  return '<option value="">Custom item</option>' +
    inventoryItems.map(it => `<option value="${it.id}" ${it.id === selectedId ? 'selected' : ''}>${it.name} (${it.quantity_on_hand} ${it.unit} in stock)</option>`).join('');
}

function addItemRow(desc = '', qty = 1, price = '') {
  itemId++;
  const row = document.createElement('div');
  row.className = 'item-row';
  row.dataset.id = itemId;
  row.innerHTML = `
    <select class="item-inventory-select" style="max-width:170px;">${inventoryOptionsHtml(null)}</select>
    <input type="text" class="item-desc" placeholder="Item or service" value="${desc}">
    <input type="number" class="item-qty" min="1" value="${qty}">
    <input type="number" class="item-price" min="0" placeholder="Unit price (₦)" value="${price}">
    <button type="button" class="item-remove" aria-label="Remove item">&times;</button>
  `;
  document.getElementById('itemRows').appendChild(row);
  row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', renderPreview));
  row.querySelector('.item-remove').addEventListener('click', () => { row.remove(); renderPreview(); });

  row.querySelector('.item-inventory-select').addEventListener('change', (e) => {
    const item = inventoryItems.find(it => it.id === e.target.value);
    if (item) {
      row.dataset.inventoryItemId = item.id;
      row.querySelector('.item-desc').value = item.name;
      row.querySelector('.item-price').value = item.sell_price || 0;
    } else {
      delete row.dataset.inventoryItemId;
    }
    renderPreview();
  });
}

function refreshInventorySelects() {
  document.querySelectorAll('.item-inventory-select').forEach(sel => {
    const row = sel.closest('.item-row');
    const currentId = row.dataset.inventoryItemId || null;
    sel.innerHTML = inventoryOptionsHtml(currentId);
  });
}

function getItems() {
  return [...document.querySelectorAll('.item-row')].map(row => ({
    desc: row.querySelector('.item-desc').value || 'Item',
    qty: parseFloat(row.querySelector('.item-qty').value) || 0,
    price: parseFloat(row.querySelector('.item-price').value) || 0,
    inventoryItemId: row.dataset.inventoryItemId || null
  }));
}

let currentClient = null; // { id, name }

function renderPreview() {
  const invNumber = document.getElementById('invNumber').value || 'INV-0001';
  const invDateRaw = document.getElementById('invDate').value;
  const dueDateRaw = document.getElementById('dueDate').value;
  const vatOn = document.getElementById('vatToggle').checked;
  const whtOn = document.getElementById('whtToggle').checked;
  const whtPercent = parseFloat(document.getElementById('whtPercent').value) || 0;
  const note = document.getElementById('invNote').value;

  document.getElementById('pInvNumber').textContent = invNumber;
  document.getElementById('pInvDate').textContent = fmtDate(invDateRaw);
  document.getElementById('pDueDate').textContent = dueDateRaw ? 'Due ' + fmtDate(dueDateRaw) : '';
  document.getElementById('pClientName').textContent = (currentClient && currentClient.name) || 'Select a client';

  const items = getItems();
  const tbody = document.getElementById('pItemsBody');
  tbody.innerHTML = items.map(it => `
    <tr>
      <td>${it.desc}</td>
      <td class="num">${it.qty}</td>
      <td class="num">${naira(it.qty * it.price)}</td>
    </tr>
  `).join('');

  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
  const vat = vatOn ? subtotal * 0.075 : 0;
  const wht = whtOn ? subtotal * (whtPercent / 100) : 0;
  const total = subtotal + vat - wht;

  let totalsHtml = `<div class="row"><span>Subtotal</span><span>${naira(subtotal)}</span></div>`;
  if (vatOn) totalsHtml += `<div class="row"><span>VAT (7.5%)</span><span>${naira(vat)}</span></div>`;
  if (whtOn) totalsHtml += `<div class="row"><span>WHT (${whtPercent}%)</span><span>-${naira(wht)}</span></div>`;
  totalsHtml += `<div class="row grand"><span>Total due</span><span>${naira(total)}</span></div>`;
  document.getElementById('pTotals').innerHTML = totalsHtml;

  const noteEl = document.getElementById('pNote');
  if (note) { noteEl.textContent = note; noteEl.style.display = 'block'; }
  else { noteEl.style.display = 'none'; }

  return { invNumber, invDateRaw, dueDateRaw, items, subtotal, vat, wht, total, vatOn, whtOn, whtPercent, note };
}

['invNumber', 'invDate', 'dueDate', 'invNote'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderPreview);
});
document.getElementById('vatToggle').addEventListener('change', renderPreview);
document.getElementById('whtToggle').addEventListener('change', () => {
  document.getElementById('whtPercentGroup').style.display = document.getElementById('whtToggle').checked ? 'block' : 'none';
  renderPreview();
});
document.getElementById('whtPercent').addEventListener('input', renderPreview);
document.getElementById('addItemBtn').addEventListener('click', () => { addItemRow(); renderPreview(); });

document.getElementById('invDate').value = new Date().toISOString().split('T')[0];
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

  // Business branding — this is a paid product, watermark never shows
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

  // Load clients for the picker
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, tin, phone')
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
      document.getElementById('pBizContact').textContent = business.name || '';
      renderPreview();
    });
  }

  // Load inventory items for the item-row picker
  const { data: items } = await supabase
    .from('inventory_items')
    .select('id, name, sell_price, quantity_on_hand, unit')
    .eq('business_id', business.id)
    .order('name');
  inventoryItems = items || [];
  refreshInventorySelects();

  // Suggest the next invoice number for this business
  const { count } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', business.id)
    .eq('doc_type', 'invoice');
  document.getElementById('invNumber').value = `INV-${String((count || 0) + 1).padStart(4, '0')}`;

  renderPreview();

  document.getElementById('saveInvoiceBtn').addEventListener('click', async () => {
    const data = renderPreview();
    if (!currentClient) { showMsg('Select a client before saving.', 'error'); return; }
    if (!data.items.length || data.items.every(it => !it.desc && !it.price)) {
      showMsg('Add at least one item.', 'error'); return;
    }

    const btn = document.getElementById('saveInvoiceBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    const linkedItems = data.items.filter(it => it.inventoryItemId);

    const { data: newDoc, error } = await supabase.from('documents').insert({
      business_id: business.id,
      user_id: session.user.id,
      doc_type: 'invoice',
      client_id: currentClient.id,
      due_date: data.dueDateRaw || null,
      amount: data.total,
      vat_amount: data.vat,
      wht_amount: data.wht,
      payment_status: 'unpaid',
      amount_paid: 0,
      inventory_linked: linkedItems.length > 0,
      data: {
        invNumber: data.invNumber,
        invDate: data.invDateRaw,
        clientName: currentClient.name,
        items: data.items,
        subtotal: data.subtotal,
        vatOn: data.vatOn,
        whtOn: data.whtOn,
        whtPercent: data.whtPercent,
        note: data.note
      }
    }).select().single();

    btn.disabled = false;
    btn.textContent = 'Save invoice';

    if (error) {
      showMsg('Could not save invoice: ' + error.message, 'error');
      return;
    }

    // Deduct stock for any inventory-linked items and log the movement
    let wentNegative = false;
    for (const item of linkedItems) {
      const invItem = inventoryItems.find(it => it.id === item.inventoryItemId);
      if (!invItem) continue;
      const newQty = Number(invItem.quantity_on_hand) - item.qty;
      if (newQty < 0) wentNegative = true;
      await supabase.from('inventory_items').update({ quantity_on_hand: newQty }).eq('id', invItem.id);
      await supabase.from('stock_movements').insert({
        item_id: invItem.id,
        business_id: business.id,
        movement_type: 'sale',
        quantity: -item.qty,
        document_id: newDoc.id,
        created_by: session.user.id
      });
      invItem.quantity_on_hand = newQty; // keep local copy in sync for repeat saves in this session
    }

    showMsg(
      wentNegative
        ? 'Invoice saved — note: one or more linked items are now below zero stock.'
        : 'Invoice saved to your Business Suite records.',
      wentNegative ? 'error' : 'success'
    );
  });

  document.getElementById('downloadBtn').addEventListener('click', async () => {
    const data = renderPreview();
    const btn = document.getElementById('downloadBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Preparing PDF…';
    btn.disabled = true;
    try {
      await KoboExport.downloadPdf(`${data.invNumber || 'invoice'}.pdf`);
    } catch (err) {
      showMsg('Could not generate PDF: ' + err.message, 'error');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });

  document.getElementById('waBtn').addEventListener('click', async () => {
    const data = renderPreview();
    if (!currentClient) { showMsg('Select a client first.', 'error'); return; }
    const btn = document.getElementById('waBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Preparing image…';
    btn.disabled = true;

    const caption = [
      `*Invoice ${data.invNumber}*`,
      `From: ${business.name}`,
      `To: ${currentClient.name}`,
      '',
      `Total due: *${naira(data.total)}*`,
      data.dueDateRaw ? `Due: ${fmtDate(data.dueDateRaw)}` : ''
    ].filter(Boolean).join('\n');

    try {
      await KoboExport.shareWhatsApp(`${data.invNumber || 'invoice'}.png`, caption);
    } catch (err) {
      if (err.name !== 'AbortError') showMsg('Could not prepare the image: ' + err.message, 'error');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
})();
