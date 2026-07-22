// ---------- helpers ----------
const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayStr = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

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

function renderPreview() {
  const bizName = document.getElementById('bizName').value || 'Your business name';
  const bizPhone = document.getElementById('bizPhone').value;
  const bizBank = document.getElementById('bizBank').value;
  const invNumber = document.getElementById('invNumber').value || 'INV-0001';
  const invDateRaw = document.getElementById('invDate').value;
  const clientName = document.getElementById('clientName').value || 'Client name';
  const vatOn = document.getElementById('vatToggle').checked;
  const note = document.getElementById('invNote').value;

  document.getElementById('pBizName').textContent = bizName;
  document.getElementById('pBizContact').textContent = [bizPhone, bizBank].filter(Boolean).join(' · ') || 'Phone · Bank details';
  document.getElementById('pInvNumber').textContent = invNumber;
  document.getElementById('pInvDate').textContent = invDateRaw
    ? new Date(invDateRaw + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : todayStr();
  document.getElementById('pClientName').textContent = clientName;

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
  const total = subtotal + vat;

  let totalsHtml = `<div class="row"><span>Subtotal</span><span>${naira(subtotal)}</span></div>`;
  if (vatOn) totalsHtml += `<div class="row"><span>VAT (7.5%)</span><span>${naira(vat)}</span></div>`;
  totalsHtml += `<div class="row grand"><span>Total due</span><span>${naira(total)}</span></div>`;
  document.getElementById('pTotals').innerHTML = totalsHtml;

  const noteEl = document.getElementById('pNote');
  if (note) { noteEl.textContent = note; noteEl.style.display = 'block'; }
  else { noteEl.style.display = 'none'; }

  if (window.KoboStorage) KoboStorage.save('invoice', { bizName, bizPhone, bizBank, invNumber, invDate: invDateRaw, clientName, vatOn, note, items });

  return { bizName, bizPhone, bizBank, invNumber, clientName, items, subtotal, vat, total, vatOn, note };
}

function collectFormState() {
  return {
    bizName: document.getElementById('bizName').value,
    bizPhone: document.getElementById('bizPhone').value,
    bizBank: document.getElementById('bizBank').value,
    invNumber: document.getElementById('invNumber').value,
    invDate: document.getElementById('invDate').value,
    clientName: document.getElementById('clientName').value,
    vatOn: document.getElementById('vatToggle').checked,
    note: document.getElementById('invNote').value,
    items: getItems()
  };
}

function applyFormState(state) {
  document.getElementById('bizName').value = state.bizName || '';
  document.getElementById('bizPhone').value = state.bizPhone || '';
  document.getElementById('bizBank').value = state.bizBank || '';
  document.getElementById('invNumber').value = state.invNumber || 'INV-0001';
  document.getElementById('invDate').value = state.invDate || new Date().toISOString().split('T')[0];
  document.getElementById('clientName').value = state.clientName || '';
  document.getElementById('vatToggle').checked = state.vatOn !== false;
  document.getElementById('invNote').value = state.note || '';
  document.getElementById('itemRows').innerHTML = '';
  (state.items && state.items.length ? state.items : [{ desc: '', qty: 1, price: '' }])
    .forEach(it => addItemRow(it.desc, it.qty, it.price));
}

// ---------- wire up inputs ----------
['bizName','bizPhone','bizBank','invNumber','invDate','clientName','vatToggle','invNote'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderPreview);
});
document.getElementById('vatToggle').addEventListener('change', renderPreview);
document.getElementById('addItemBtn').addEventListener('click', () => { addItemRow(); renderPreview(); });

document.getElementById('clearFormBtn').addEventListener('click', () => {
  if (!confirm('Clear this form? This only affects this device — nothing else is stored anywhere.')) return;
  KoboStorage.clear('invoice');
  document.getElementById('itemRows').innerHTML = '';
  applyFormState({});
  renderPreview();
});

// ---------- restore saved state, or seed defaults ----------
const saved = window.KoboStorage ? KoboStorage.load('invoice') : null;
if (saved) {
  applyFormState(saved);
} else {
  document.getElementById('invDate').value = new Date().toISOString().split('T')[0];
  addItemRow('Ankara print, 6 yards', 1, 42000);
  addItemRow('Delivery — Lekki', 1, 3500);
}
renderPreview();

// ---------- White-label branding (Pro feature) ----------
// Free users always see the default KoboDocs premium template with the
// "Made with KoboDocs" mark. Pro users who've uploaded a logo/color in
// /account/ see their own branding instead — no watermark, their logo in
// place of the stamp, their brand color driving every accent in the document.
let watermarkHidden = false;
(async function applyBranding() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });
  const session = await window.KoboAuth.getSession();
  if (!session) return; // stays on default template

  const profile = await window.KoboAuth.getProfile();
  const planActive = profile && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date();
  if (!profile || !planActive || (profile.plan !== 'pro' && profile.plan !== 'business')) return;

  const hasBranding = profile.brand_logo_url || profile.brand_color;
  if (hasBranding) {
    document.getElementById('pWatermark').classList.add('hidden');
    watermarkHidden = true;
  }

  if (profile.brand_logo_url) {
    const logo = document.getElementById('pBrandLogo');
    logo.src = profile.brand_logo_url;
    logo.classList.remove('hidden');
    document.getElementById('pStamp').classList.add('hidden');
  }
  if (profile.brand_color) {
    document.getElementById('docPreview').style.setProperty('--stamp-gold', profile.brand_color);
  }
})();

// ---------- Build the real PDF from data (no screenshotting) ----------
function buildInvoicePdf(data) {
  const rows = data.items.map(it => [it.desc, it.qty, naira(it.qty * it.price)]);
  const totals = [{ label: 'Subtotal', value: naira(data.subtotal) }];
  if (data.vatOn) totals.push({ label: 'VAT (7.5%)', value: naira(data.vat) });
  totals.push({ label: 'Total due', value: naira(data.total), emphasis: true });

  return KoboExport.buildTablePdf({
    docLabel: 'Invoice',
    businessName: data.bizName,
    businessSub: [data.bizPhone, data.bizBank].filter(Boolean).join(' · '),
    metaLines: [data.invNumber, document.getElementById('pInvDate').textContent],
    toLabel: 'Bill to',
    toName: data.clientName,
    columns: ['Description', 'Qty', 'Amount'],
    rightAlignCols: [1, 2],
    rows,
    totals,
    note: data.note,
    watermark: !watermarkHidden
  });
}

// ---------- PDF export ----------
document.getElementById('downloadBtn').addEventListener('click', () => {
  const data = renderPreview();
  try {
    const doc = buildInvoicePdf(data);
    KoboExport.download(`${data.invNumber || 'invoice'}.pdf`, doc);
  } catch (err) {
    alert('Could not generate PDF: ' + err.message);
  }
});

// ---------- WhatsApp share ----------
document.getElementById('waBtn').addEventListener('click', async () => {
  const data = renderPreview();
  const btn = document.getElementById('waBtn');
  const originalText = btn.textContent;

  const caption = [
    `*Invoice ${data.invNumber}*`,
    `From: ${data.bizName}`,
    `To: ${data.clientName}`,
    '',
    `Total due: *${naira(data.total)}*`,
    data.bizBank ? `Pay to: ${data.bizBank}` : ''
  ].filter(Boolean).join('\n');

  try {
    const doc = buildInvoicePdf(data);
    const result = await KoboExport.shareWhatsApp(`${data.invNumber || 'invoice'}.pdf`, caption, doc);
  } catch (err) {
    if (err.name !== 'AbortError') alert('Could not prepare the PDF: ' + err.message);
  } finally {
    btn.textContent = originalText;
  }
});
