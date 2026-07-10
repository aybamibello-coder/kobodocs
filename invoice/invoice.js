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

  return { bizName, bizPhone, bizBank, invNumber, clientName, items, subtotal, vat, total, vatOn, note };
}

// ---------- wire up inputs ----------
['bizName','bizPhone','bizBank','invNumber','invDate','clientName','vatToggle','invNote'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderPreview);
});
document.getElementById('vatToggle').addEventListener('change', renderPreview);
document.getElementById('addItemBtn').addEventListener('click', () => addItemRow());

// seed defaults
document.getElementById('invDate').value = new Date().toISOString().split('T')[0];
addItemRow('Ankara print, 6 yards', 1, 42000);
addItemRow('Delivery — Lekki', 1, 3500);
renderPreview();

// ---------- PDF export ----------
document.getElementById('downloadBtn').addEventListener('click', () => {
  const data = renderPreview();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 48; let y = 60;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(data.bizName, left, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
  y += 18;
  if (data.bizPhone || data.bizBank) { doc.text([data.bizPhone, data.bizBank].filter(Boolean).join('  ·  '), left, y); y += 14; }

  doc.setTextColor(20);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('INVOICE', 400, 60, { align: 'left' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`No: ${data.invNumber}`, 400, 80);
  doc.text(`Date: ${document.getElementById('pInvDate').textContent}`, 400, 94);

  y += 20;
  doc.setDrawColor(20); doc.line(left, y, 547, y); y += 20;
  doc.setFont('helvetica', 'bold'); doc.text('Bill to:', left, y); y += 14;
  doc.setFont('helvetica', 'normal'); doc.text(data.clientName, left, y); y += 26;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('Description', left, y);
  doc.text('Qty', 380, y, { align: 'right' });
  doc.text('Amount', 547, y, { align: 'right' });
  y += 6; doc.setDrawColor(20); doc.line(left, y, 547, y); y += 16;

  doc.setFont('helvetica', 'normal');
  data.items.forEach(it => {
    doc.text(it.desc, left, y);
    doc.text(String(it.qty), 380, y, { align: 'right' });
    doc.text(naira(it.qty * it.price), 547, y, { align: 'right' });
    y += 20;
  });

  y += 6; doc.line(350, y, 547, y); y += 18;
  doc.text('Subtotal', 460, y, { align: 'right' }); doc.text(naira(data.subtotal), 547, y, { align: 'right' }); y += 16;
  if (data.vatOn) { doc.text('VAT (7.5%)', 460, y, { align: 'right' }); doc.text(naira(data.vat), 547, y, { align: 'right' }); y += 16; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('Total due', 460, y, { align: 'right' }); doc.text(naira(data.total), 547, y, { align: 'right' });

  if (data.note) {
    y += 34; doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(100);
    doc.text(data.note, left, y, { maxWidth: 499 });
  }

  doc.save(`${data.invNumber || 'invoice'}.pdf`);
});

// ---------- WhatsApp share ----------
document.getElementById('waBtn').addEventListener('click', () => {
  const data = renderPreview();
  const lines = [
    `*Invoice ${data.invNumber}*`,
    `From: ${data.bizName}`,
    `To: ${data.clientName}`,
    '',
    ...data.items.map(it => `${it.desc} x${it.qty} — ${naira(it.qty * it.price)}`),
    '',
    `Total due: *${naira(data.total)}*`,
    data.bizBank ? `Pay to: ${data.bizBank}` : ''
  ].filter(Boolean);
  const text = encodeURIComponent(lines.join('\n'));
  window.open(`https://wa.me/?text=${text}`, '_blank');
});
