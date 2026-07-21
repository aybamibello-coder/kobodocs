const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayStr = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

function addItemRow(desc = '', qty = 1, price = '') {
  const row = document.createElement('div');
  row.className = 'item-row';
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
  const quoNumber = document.getElementById('quoNumber').value || 'QUO-0001';
  const quoDateRaw = document.getElementById('quoDate').value;
  const clientName = document.getElementById('clientName').value || 'Client name';
  const vatOn = document.getElementById('vatToggle').checked;
  const validDays = parseInt(document.getElementById('validDays').value, 10) || 7;
  const note = document.getElementById('quoNote').value;

  document.getElementById('pBizName').textContent = bizName;
  document.getElementById('pBizContact').textContent = bizPhone || 'Phone';
  document.getElementById('pQuoNumber').textContent = quoNumber;
  const baseDate = quoDateRaw ? new Date(quoDateRaw + 'T00:00:00') : new Date();
  document.getElementById('pQuoDate').textContent = baseDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  document.getElementById('pClientName').textContent = clientName;

  const items = getItems();
  document.getElementById('pItemsBody').innerHTML = items.map(it => `
    <tr><td>${it.desc}</td><td class="num">${it.qty}</td><td class="num">${naira(it.qty * it.price)}</td></tr>
  `).join('');

  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
  const vat = vatOn ? subtotal * 0.075 : 0;
  const total = subtotal + vat;

  let totalsHtml = `<div class="row"><span>Subtotal</span><span>${naira(subtotal)}</span></div>`;
  if (vatOn) totalsHtml += `<div class="row"><span>VAT (7.5%)</span><span>${naira(vat)}</span></div>`;
  totalsHtml += `<div class="row grand"><span>Estimated total</span><span>${naira(total)}</span></div>`;
  document.getElementById('pTotals').innerHTML = totalsHtml;

  const validUntil = new Date(baseDate);
  validUntil.setDate(validUntil.getDate() + validDays);
  const validStr = validUntil.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  document.getElementById('pValid').textContent = `Valid until ${validStr}`;

  const noteEl = document.getElementById('pNote');
  if (note) { noteEl.textContent = note; noteEl.style.display = 'block'; }
  else { noteEl.style.display = 'none'; }

  if (window.KoboStorage) KoboStorage.save('quotation', { bizName, bizPhone, quoNumber, quoDate: quoDateRaw, clientName, vatOn, validDays, note, items });

  return { bizName, bizPhone, quoNumber, clientName, items, subtotal, vat, total, vatOn, validStr, note };
}

function collectFormState() {
  return {
    bizName: document.getElementById('bizName').value,
    bizPhone: document.getElementById('bizPhone').value,
    quoNumber: document.getElementById('quoNumber').value,
    quoDate: document.getElementById('quoDate').value,
    clientName: document.getElementById('clientName').value,
    vatOn: document.getElementById('vatToggle').checked,
    validDays: document.getElementById('validDays').value,
    note: document.getElementById('quoNote').value,
    items: getItems()
  };
}

function applyFormState(state) {
  document.getElementById('bizName').value = state.bizName || '';
  document.getElementById('bizPhone').value = state.bizPhone || '';
  document.getElementById('quoNumber').value = state.quoNumber || 'QUO-0001';
  document.getElementById('quoDate').value = state.quoDate || new Date().toISOString().split('T')[0];
  document.getElementById('clientName').value = state.clientName || '';
  document.getElementById('vatToggle').checked = state.vatOn !== false;
  document.getElementById('validDays').value = state.validDays || 7;
  document.getElementById('quoNote').value = state.note || '';
  document.getElementById('itemRows').innerHTML = '';
  (state.items && state.items.length ? state.items : [{ desc: '', qty: 1, price: '' }])
    .forEach(it => addItemRow(it.desc, it.qty, it.price));
}

['bizName','bizPhone','quoNumber','quoDate','clientName','vatToggle','validDays','quoNote'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderPreview);
  document.getElementById(id).addEventListener('change', renderPreview);
});
document.getElementById('addItemBtn').addEventListener('click', () => { addItemRow(); renderPreview(); });

document.getElementById('clearFormBtn').addEventListener('click', () => {
  if (!confirm('Clear this form? This only affects this device.')) return;
  KoboStorage.clear('quotation');
  applyFormState({});
  renderPreview();
});

const saved = window.KoboStorage ? KoboStorage.load('quotation') : null;
if (saved) {
  applyFormState(saved);
} else {
  document.getElementById('quoDate').value = new Date().toISOString().split('T')[0];
  addItemRow('Custom cabinet installation', 1, 150000);
}
renderPreview();

let watermarkHidden = false;

function buildQuotationPdf(data) {
  const rows = data.items.map(it => [it.desc, it.qty, naira(it.qty * it.price)]);
  const totals = [{ label: 'Subtotal', value: naira(data.subtotal) }];
  if (data.vatOn) totals.push({ label: 'VAT (7.5%)', value: naira(data.vat) });
  totals.push({ label: 'Estimated total', value: naira(data.total), emphasis: true });

  return KoboExport.buildTablePdf({
    docLabel: 'Quotation',
    businessName: data.bizName,
    businessSub: data.bizPhone,
    metaLines: [data.quoNumber, `Valid until ${data.validStr}`],
    toLabel: 'For',
    toName: data.clientName,
    columns: ['Description', 'Qty', 'Amount'],
    rightAlignCols: [1, 2],
    rows,
    totals,
    note: data.note,
    watermark: !watermarkHidden
  });
}

document.getElementById('downloadBtn').addEventListener('click', () => {
  const data = renderPreview();
  try {
    const doc = buildQuotationPdf(data);
    KoboExport.download(`${data.quoNumber || 'quotation'}.pdf`, doc);
  } catch (err) {
    alert('Could not generate PDF: ' + err.message);
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  const data = renderPreview();
  const btn = document.getElementById('waBtn');
  const originalText = btn.textContent;

  const caption = [
    `*Quotation ${data.quoNumber}*`,
    `From: ${data.bizName}`,
    `For: ${data.clientName}`,
    '',
    `Estimated total: *${naira(data.total)}*`,
    `Valid until ${data.validStr}`
  ].filter(Boolean).join('\n');

  try {
    const doc = buildQuotationPdf(data);
    const result = await KoboExport.shareWhatsApp(`${data.quoNumber || 'quotation'}.pdf`, caption, doc);
    if (result === 'downloaded') {
      alert('PDF downloaded — attach it in WhatsApp. Opening WhatsApp with the caption now.');
    }
  } catch (err) {
    if (err.name !== 'AbortError') alert('Could not prepare the PDF: ' + err.message);
  } finally {
    btn.textContent = originalText;
  }
});

// ---------- White-label branding (Pro feature) ----------
// Free users always see the default KoboDocs premium template with the
// "Made with KoboDocs" mark. Pro users who've uploaded a logo/color in
// /account/ see their own branding instead — no watermark, their logo in
// place of the stamp, their brand color driving every accent in the document.
(async function applyBranding() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener("kobo-auth-ready", r, { once: true });
  });
  const session = await window.KoboAuth.getSession();
  if (!session) return;

  const profile = await window.KoboAuth.getProfile();
  const planActive = profile && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date();
  if (!profile || !planActive || (profile.plan !== "pro" && profile.plan !== "business")) return;

  const hasBranding = profile.brand_logo_url || profile.brand_color;
  if (hasBranding) {
    document.getElementById("pWatermark").classList.add("hidden");
    watermarkHidden = true;
  }

  if (profile.brand_logo_url) {
    const logo = document.getElementById("pBrandLogo");
    logo.src = profile.brand_logo_url;
    logo.classList.remove("hidden");
    document.getElementById("pStamp").classList.add("hidden");
  }
  if (profile.brand_color) {
    document.getElementById("docPreview").style.setProperty("--stamp-gold", profile.brand_color);
  }
})();

