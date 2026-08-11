// ---------- helpers ----------
const CURRENCY_SYMBOLS = { NGN: '₦', USD: '$', GBP: '£', EUR: '€' };
const CURRENCY_LOCALES = { NGN: 'en-NG', USD: 'en-US', GBP: 'en-GB', EUR: 'de-DE' };
function money(n, currency) {
  currency = currency || (document.getElementById('invCurrency') ? document.getElementById('invCurrency').value : 'NGN');
  const symbol = CURRENCY_SYMBOLS[currency] || '₦';
  const locale = CURRENCY_LOCALES[currency] || 'en-NG';
  return symbol + (Number(n) || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const naira = (n) => money(n, 'NGN'); // kept for any external callers; new code should use money()
const todayStr = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

function currentCurrency() {
  const el = document.getElementById('invCurrency');
  return el ? el.value : 'NGN';
}

function updateItemPricePlaceholders() {
  const symbol = CURRENCY_SYMBOLS[currentCurrency()] || '₦';
  document.querySelectorAll('.item-price').forEach(inp => {
    inp.placeholder = `Unit price (${symbol})`;
  });
}

let itemId = 0;
function addItemRow(desc = '', qty = 1, price = '') {
  itemId++;
  const symbol = CURRENCY_SYMBOLS[currentCurrency()] || '₦';
  const row = document.createElement('div');
  row.className = 'item-row';
  row.dataset.id = itemId;
  row.innerHTML = `
    <input type="text" class="item-desc" placeholder="Item or service" value="${desc}">
    <input type="number" class="item-qty" min="1" value="${qty}">
    <input type="number" class="item-price" min="0" placeholder="Unit price (${symbol})" value="${price}">
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
  const currency = currentCurrency();
  const vatOn = document.getElementById('vatToggle').checked;
  const note = document.getElementById('invNote').value;

  const foreignNote = document.getElementById('foreignCurrencyNote');
  if (foreignNote) foreignNote.style.display = (currency !== 'NGN') ? 'block' : 'none';

  document.getElementById('pBizName').textContent = bizName;
  document.getElementById('pBizContact').textContent = [bizPhone, bizBank].filter(Boolean).join(' · ') || 'Phone · Bank details';
  document.getElementById('pInvNumber').textContent = invNumber;
  document.getElementById('pInvDate').textContent = invDateRaw
    ? new Date(invDateRaw + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : todayStr();
  document.getElementById('pClientName').textContent = clientName;

  const bizRc = document.getElementById('bizRc').value.trim();
  const bizDirectors = document.getElementById('bizDirectors').value.trim();
  const bizTin = document.getElementById('bizTin').value.trim();
  const bizVat = document.getElementById('bizVat').value.trim();
  const cacFooterEl = document.getElementById('pCacFooter');
  const footerParts = [];
  if (bizRc) footerParts.push(`RC ${bizRc}`);
  if (bizTin) footerParts.push(`TIN ${bizTin}`);
  if (bizVat) footerParts.push(`VAT ${bizVat}`);
  if (footerParts.length) {
    let html = `${bizName} · ${footerParts.join(' · ')}`;
    if (bizDirectors) html += ` · Director(s): ${bizDirectors}`;
    cacFooterEl.innerHTML = html;
    cacFooterEl.style.display = 'block';
  } else {
    cacFooterEl.style.display = 'none';
  }

  const items = getItems();
  const tbody = document.getElementById('pItemsBody');
  tbody.innerHTML = items.map(it => `
    <tr>
      <td>${it.desc}</td>
      <td class="num">${it.qty}</td>
      <td class="num">${money(it.qty * it.price, currency)}</td>
    </tr>
  `).join('');

  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
  const vat = vatOn ? subtotal * 0.075 : 0;
  const total = subtotal + vat;

  let totalsHtml = `<div class="row"><span>Subtotal</span><span>${money(subtotal, currency)}</span></div>`;
  if (vatOn) totalsHtml += `<div class="row"><span>VAT (7.5%)</span><span>${money(vat, currency)}</span></div>`;
  totalsHtml += `<div class="row grand"><span>Total due</span><span>${money(total, currency)}</span></div>`;
  document.getElementById('pTotals').innerHTML = totalsHtml;

  const noteEl = document.getElementById('pNote');
  if (note) { noteEl.textContent = note; noteEl.style.display = 'block'; }
  else { noteEl.style.display = 'none'; }

  if (window.KoboStorage) KoboStorage.save('invoice', { bizName, bizPhone, bizBank, bizRc, bizDirectors, bizTin, bizVat, invNumber, invDate: invDateRaw, clientName, currency, vatOn, note, items });

  return { bizName, bizPhone, bizBank, invNumber, clientName, currency, items, subtotal, vat, total, vatOn, note };
}

function collectFormState() {
  return {
    bizName: document.getElementById('bizName').value,
    bizPhone: document.getElementById('bizPhone').value,
    bizBank: document.getElementById('bizBank').value,
    bizRc: document.getElementById('bizRc').value,
    bizDirectors: document.getElementById('bizDirectors').value,
    bizTin: document.getElementById('bizTin').value,
    bizVat: document.getElementById('bizVat').value,
    invNumber: document.getElementById('invNumber').value,
    invDate: document.getElementById('invDate').value,
    clientName: document.getElementById('clientName').value,
    currency: currentCurrency(),
    vatOn: document.getElementById('vatToggle').checked,
    note: document.getElementById('invNote').value,
    items: getItems()
  };
}

function applyFormState(state) {
  document.getElementById('bizName').value = state.bizName || '';
  document.getElementById('bizPhone').value = state.bizPhone || '';
  document.getElementById('bizBank').value = state.bizBank || '';
  document.getElementById('bizRc').value = state.bizRc || '';
  document.getElementById('bizDirectors').value = state.bizDirectors || '';
  document.getElementById('bizTin').value = state.bizTin || '';
  document.getElementById('bizVat').value = state.bizVat || '';
  document.getElementById('invNumber').value = state.invNumber || 'INV-0001';
  document.getElementById('invDate').value = state.invDate || new Date().toISOString().split('T')[0];
  document.getElementById('clientName').value = state.clientName || '';
  document.getElementById('invCurrency').value = state.currency || 'NGN';
  document.getElementById('vatToggle').checked = state.vatOn !== false;
  document.getElementById('invNote').value = state.note || '';
  document.getElementById('itemRows').innerHTML = '';
  (state.items && state.items.length ? state.items : [{ desc: '', qty: 1, price: '' }])
    .forEach(it => addItemRow(it.desc, it.qty, it.price));
}

// ---------- wire up inputs ----------
['bizName','bizPhone','bizBank','bizRc','bizDirectors','bizTin','bizVat','invNumber','invDate','clientName','vatToggle','invNote'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderPreview);
});
document.getElementById('vatToggle').addEventListener('change', renderPreview);
document.getElementById('invCurrency').addEventListener('change', () => { updateItemPricePlaceholders(); renderPreview(); });
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
  const rows = data.items.map(it => [it.desc, it.qty, money(it.qty * it.price, data.currency)]);
  const totals = [{ label: 'Subtotal', value: money(data.subtotal, data.currency) }];
  if (data.vatOn) totals.push({ label: 'VAT (7.5%)', value: money(data.vat, data.currency) });
  totals.push({ label: 'Total due', value: money(data.total, data.currency), emphasis: true });

  return KoboExport.buildTablePdf({
    style: 'branded',
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
document.getElementById('downloadBtn').addEventListener('click', async () => {
  const data = renderPreview();
  try {
    const doc = await buildInvoicePdf(data);
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
    `Total due: *${money(data.total, data.currency)}*`,
    data.bizBank ? `Pay to: ${data.bizBank}` : ''
  ].filter(Boolean).join('\n');

  try {
    const doc = await buildInvoicePdf(data);
    const result = await KoboExport.shareWhatsApp(`${data.invNumber || 'invoice'}.pdf`, caption, doc);
  } catch (err) {
    if (err.name !== 'AbortError') alert('Could not prepare the PDF: ' + err.message);
  } finally {
    btn.textContent = originalText;
  }
});
