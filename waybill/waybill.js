KoboSubscribe.resumePendingIfAny();

document.getElementById('upgradeProBtn').addEventListener('click', async () => {
  const btn = document.getElementById('upgradeProBtn');
  const original = btn.textContent;
  btn.textContent = 'Redirecting…';
  try {
    await KoboSubscribe.start('init-payment', { billing_cycle: 'monthly' });
  } catch {
    btn.textContent = original;
  }
});

const todayStr = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
let isPro = false;

function addItemRow(desc = '', qty = 1) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <input type="text" class="item-desc" placeholder="Item description" value="${desc}" style="flex:2;">
    <input type="number" class="item-qty" min="1" value="${qty}" placeholder="Qty">
    <button type="button" class="item-remove" aria-label="Remove item">&times;</button>
  `;
  document.getElementById('itemRows').appendChild(row);
  row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', renderPreview));
  row.querySelector('.item-remove').addEventListener('click', () => { row.remove(); renderPreview(); });
}

function getItems() {
  return [...document.querySelectorAll('.item-row')].map(row => ({
    desc: row.querySelector('.item-desc').value || 'Item',
    qty: parseFloat(row.querySelector('.item-qty').value) || 0
  }));
}

function renderPreview() {
  const bizName = document.getElementById('bizName').value || 'Your business name';
  const bizPhone = document.getElementById('bizPhone').value;
  const receiverName = document.getElementById('receiverName').value || 'Receiver name';
  const receiverPhone = document.getElementById('receiverPhone').value;
  const wbNumber = document.getElementById('wbNumber').value || 'WB-0001';
  const wbDateRaw = document.getElementById('wbDate').value;
  const vehicleNo = document.getElementById('vehicleNo').value || '—';
  const driverName = document.getElementById('driverName').value || '—';
  const note = document.getElementById('wbNote').value;

  document.getElementById('pBizName').textContent = bizName;
  document.getElementById('pBizContact').textContent = bizPhone || 'Phone';
  document.getElementById('pReceiverName').textContent = receiverName;
  document.getElementById('pReceiverPhone').textContent = receiverPhone;
  document.getElementById('pWbNumber').textContent = wbNumber;
  document.getElementById('pWbDate').textContent = wbDateRaw
    ? new Date(wbDateRaw + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : todayStr();
  document.getElementById('pVehicleNo').textContent = vehicleNo;
  document.getElementById('pDriverName').textContent = driverName;

  const items = getItems();
  document.getElementById('pItemsBody').innerHTML = items.map(it => `
    <tr><td>${it.desc}</td><td class="num">${it.qty}</td></tr>
  `).join('');

  const noteEl = document.getElementById('pNote');
  if (note) { noteEl.textContent = note; noteEl.style.display = 'block'; }
  else { noteEl.style.display = 'none'; }
}

document.getElementById('wbDate').value = new Date().toISOString().split('T')[0];
addItemRow();
document.getElementById('addItemBtn').addEventListener('click', () => { addItemRow(); renderPreview(); });
document.querySelectorAll('.form-panel input, .form-panel textarea').forEach(el => el.addEventListener('input', renderPreview));
renderPreview();

function buildWaybillPdf() {
  const bizName = document.getElementById('bizName').value || 'Your business name';
  const bizPhone = document.getElementById('bizPhone').value;
  const receiverName = document.getElementById('receiverName').value || 'Receiver name';
  const receiverPhone = document.getElementById('receiverPhone').value;
  const wbNumber = document.getElementById('wbNumber').value || 'WB-0001';
  const vehicleNo = document.getElementById('vehicleNo').value || '—';
  const driverName = document.getElementById('driverName').value || '—';
  const note = document.getElementById('wbNote').value;
  const rows = getItems().map(it => [it.desc, it.qty]);

  return KoboExport.buildTablePdf({
    docLabel: 'Waybill',
    businessName: bizName,
    businessSub: bizPhone,
    metaLines: [wbNumber, document.getElementById('pWbDate').textContent, `Vehicle: ${vehicleNo}`, `Driver: ${driverName}`],
    toLabel: 'Deliver to',
    toName: receiverName,
    toSub: receiverPhone,
    columns: ['Description', 'Qty'],
    rightAlignCols: [1],
    rows,
    note,
    signatureLines: ["Sender's signature", "Receiver's signature"],
    watermark: !isPro
  });
}

document.getElementById('downloadPdfBtn').addEventListener('click', () => {
  renderPreview();
  try {
    const doc = buildWaybillPdf();
    KoboExport.download(`${document.getElementById('wbNumber').value || 'waybill'}.pdf`, doc);
  } catch (err) {
    alert('Could not generate PDF: ' + err.message);
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  renderPreview();
  const btn = document.getElementById('waBtn');
  const originalText = btn.textContent;
  try {
    const doc = buildWaybillPdf();
    const result = await KoboExport.shareWhatsApp(`${document.getElementById('wbNumber').value || 'waybill'}.pdf`, 'Waybill made with KoboDocs.', doc);
  } catch (err) {
    if (err.name !== 'AbortError') alert('Could not prepare the PDF: ' + err.message);
  } finally {
    btn.textContent = originalText;
  }
});

// ---------- Pro gating: branding + saved clients ----------
(async function checkPro() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const profile = await window.KoboAuth.getProfile();
  const active = profile && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date();
  isPro = !!(profile && active && (profile.plan === 'pro' || profile.plan === 'business'));

  if (!isPro) return;

  document.getElementById('pWatermark').classList.add('hidden');
  if (profile.brand_logo_url) {
    const logo = document.getElementById('pBrandLogo');
    logo.src = profile.brand_logo_url;
    logo.classList.remove('hidden');
    document.getElementById('pStamp').classList.add('hidden');
  }
  if (profile.brand_color) {
    document.getElementById('docPreview').style.setProperty('--stamp-gold', profile.brand_color);
  }

  document.getElementById('proLockBanner').style.display = 'none';
  document.getElementById('savedClientRow').style.display = 'block';

  const supabase = window.KoboAuth.supabase;
  const { data: clients } = await supabase.from('clients').select('id, name, phone').order('name');

  const select = document.getElementById('savedClientSelect');
  if (!clients || !clients.length) {
    select.innerHTML = '<option value="">No saved clients yet</option>';
    return;
  }
  select.innerHTML = '<option value="">Select a client…</option>' +
    clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  select.addEventListener('change', () => {
    const client = clients.find(c => c.id === select.value);
    if (!client) return;
    document.getElementById('receiverName').value = client.name || '';
    document.getElementById('receiverPhone').value = client.phone || '';
    renderPreview();
  });
})();
