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
  const recNumber = document.getElementById('recNumber').value || 'RCT-0001';
  const recDateRaw = document.getElementById('recDate').value;
  const payerName = document.getElementById('payerName').value || 'Payer name';
  const method = document.getElementById('payMethod').value;
  const note = document.getElementById('recNote').value;

  document.getElementById('pBizName').textContent = bizName;
  document.getElementById('pBizContact').textContent = bizPhone || 'Phone';
  document.getElementById('pRecNumber').textContent = recNumber;
  document.getElementById('pRecDate').textContent = recDateRaw
    ? new Date(recDateRaw + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : todayStr();
  document.getElementById('pPayerName').textContent = payerName;

  const items = getItems();
  document.getElementById('pItemsBody').innerHTML = items.map(it => `
    <tr><td>${it.desc}</td><td class="num">${it.qty}</td><td class="num">${naira(it.qty * it.price)}</td></tr>
  `).join('');

  const total = items.reduce((s, it) => s + it.qty * it.price, 0);
  document.getElementById('pTotals').innerHTML = `<div class="row grand"><span>Total received</span><span>${naira(total)}</span></div>`;
  document.getElementById('pMethod').textContent = `Paid via ${method}`;

  const noteEl = document.getElementById('pNote');
  if (note) { noteEl.textContent = note; noteEl.style.display = 'block'; }
  else { noteEl.style.display = 'none'; }

  if (window.KoboStorage) KoboStorage.save('receipt', { bizName, bizPhone, recNumber, recDate: recDateRaw, payerName, method, note, items });

  return { bizName, bizPhone, recNumber, payerName, method, items, total, note };
}

function collectFormState() {
  return {
    bizName: document.getElementById('bizName').value,
    bizPhone: document.getElementById('bizPhone').value,
    recNumber: document.getElementById('recNumber').value,
    recDate: document.getElementById('recDate').value,
    payerName: document.getElementById('payerName').value,
    method: document.getElementById('payMethod').value,
    note: document.getElementById('recNote').value,
    items: getItems()
  };
}

function applyFormState(state) {
  document.getElementById('bizName').value = state.bizName || '';
  document.getElementById('bizPhone').value = state.bizPhone || '';
  document.getElementById('recNumber').value = state.recNumber || 'RCT-0001';
  document.getElementById('recDate').value = state.recDate || new Date().toISOString().split('T')[0];
  document.getElementById('payerName').value = state.payerName || '';
  document.getElementById('payMethod').value = state.method || 'Cash';
  document.getElementById('recNote').value = state.note || '';
  document.getElementById('itemRows').innerHTML = '';
  (state.items && state.items.length ? state.items : [{ desc: '', qty: 1, price: '' }])
    .forEach(it => addItemRow(it.desc, it.qty, it.price));
}

['bizName','bizPhone','recNumber','recDate','payerName','payMethod','recNote'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderPreview);
  document.getElementById(id).addEventListener('change', renderPreview);
});
document.getElementById('addItemBtn').addEventListener('click', () => { addItemRow(); renderPreview(); });

document.getElementById('clearFormBtn').addEventListener('click', () => {
  if (!confirm('Clear this form? This only affects this device.')) return;
  KoboStorage.clear('receipt');
  applyFormState({});
  renderPreview();
});

const saved = window.KoboStorage ? KoboStorage.load('receipt') : null;
if (saved) {
  applyFormState(saved);
} else {
  document.getElementById('recDate').value = new Date().toISOString().split('T')[0];
  addItemRow('Ankara print, 6 yards', 1, 42000);
}
renderPreview();

document.getElementById('downloadBtn').addEventListener('click', async () => {
  const data = renderPreview();
  const btn = document.getElementById('downloadBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Preparing PDF…';
  btn.disabled = true;
  try {
    await KoboExport.downloadPdf(`${data.recNumber || 'receipt'}.pdf`);
  } catch (err) {
    alert('Could not generate PDF: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  const data = renderPreview();
  const btn = document.getElementById('waBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Preparing image…';
  btn.disabled = true;

  const caption = [
    `*Receipt ${data.recNumber}*`,
    `From: ${data.bizName}`,
    `Received from: ${data.payerName}`,
    '',
    `Total received: *${naira(data.total)}*`,
    `Paid via ${data.method}`
  ].filter(Boolean).join('\n');

  try {
    const result = await KoboExport.shareWhatsApp(`${data.recNumber || 'receipt'}.png`, caption);
    if (result === 'downloaded') {
      alert('Image downloaded — attach it in WhatsApp. Opening WhatsApp with the caption now.');
    }
  } catch (err) {
    if (err.name !== 'AbortError') alert('Could not prepare the image: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
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
  if (hasBranding) document.getElementById("pWatermark").classList.add("hidden");

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

