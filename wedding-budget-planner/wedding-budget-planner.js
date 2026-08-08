const naira = (n) => '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');

// ---------- Section tab switching ----------
document.getElementById('sectionTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-section]');
  if (!btn) return;
  const section = btn.dataset.section;
  document.querySelectorAll('#sectionTabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${section}`).classList.add('active');
});

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
  setTimeout(() => { el.className = ''; }, 3000);
}

// ======================================================================
// COST CALCULATOR
// ======================================================================
const CITY_RATES = {
  premium: { catering: 8000, venueBase: 800000, decoration: 500000, photo: 400000, entertainment: 350000 },
  mid:     { catering: 5500, venueBase: 450000, decoration: 300000, photo: 250000, entertainment: 200000 },
  budget:  { catering: 3500, venueBase: 200000, decoration: 150000, photo: 120000, entertainment: 100000 }
};

function venueScale(guestCount) {
  if (guestCount > 400) return 1.4;
  if (guestCount > 200) return 1.2;
  return 1;
}

function calcCost() {
  const city = document.getElementById('calcCity').value;
  const guestCount = parseFloat(document.getElementById('guestCount').value) || 0;
  const rates = CITY_RATES[city];

  const catering = guestCount * rates.catering;
  const venue = rates.venueBase * venueScale(guestCount);
  const decoration = rates.decoration;
  const photo = rates.photo;
  const entertainment = rates.entertainment;
  const subtotal = catering + venue + decoration + photo + entertainment;
  const misc = subtotal * 0.1;
  const total = subtotal + misc;

  document.getElementById('calcCatering').textContent = naira(catering);
  document.getElementById('calcVenue').textContent = naira(venue);
  document.getElementById('calcDecoration').textContent = naira(decoration);
  document.getElementById('calcPhoto').textContent = naira(photo);
  document.getElementById('calcEntertainment').textContent = naira(entertainment);
  document.getElementById('calcMisc').textContent = naira(misc);
  document.getElementById('calcTotal').textContent = naira(total);

  return { catering, venue, decoration, photo, entertainment, misc, total };
}

document.getElementById('calcCity').addEventListener('change', calcCost);
document.getElementById('guestCount').addEventListener('input', calcCost);
calcCost();

document.getElementById('sectionTabs').addEventListener('click', (e) => {
  if (e.target.closest('[data-section="planner"]')) {
    // Prefill the budget planner from the calculator's estimate the first time it's opened
    if (!budgetPrefilled) prefillBudgetFromCalculator();
  }
});

// ======================================================================
// BUDGET PLANNER
// ======================================================================
let budgetPrefilled = false;

function addBudgetRow(name = '', amount = '') {
  const row = document.createElement('div');
  row.className = 'budget-row';
  row.innerHTML = `
    <input type="text" class="budget-name" placeholder="Category" value="${name}">
    <input type="number" class="budget-amount" placeholder="Amount (₦)" min="0" value="${amount}">
    <button type="button" class="item-remove" aria-label="Remove">&times;</button>
  `;
  document.getElementById('budgetRows').appendChild(row);
  row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', renderBudget));
  row.querySelector('.item-remove').addEventListener('click', () => { row.remove(); renderBudget(); });
}

function prefillBudgetFromCalculator() {
  budgetPrefilled = true;
  const c = calcCost();
  document.getElementById('budgetRows').innerHTML = '';
  addBudgetRow('Catering', Math.round(c.catering));
  addBudgetRow('Venue', Math.round(c.venue));
  addBudgetRow('Decoration', Math.round(c.decoration));
  addBudgetRow('Photography & Videography', Math.round(c.photo));
  addBudgetRow('Entertainment (MC, DJ)', Math.round(c.entertainment));
  addBudgetRow('Aso-ebi (family)', 0);
  addBudgetRow('Transportation', 0);
  addBudgetRow('Contingency', Math.round(c.misc));
  renderBudget();
}

function getBudgetItems() {
  return [...document.querySelectorAll('.budget-row')].map(row => ({
    name: row.querySelector('.budget-name').value || 'Category',
    amount: parseFloat(row.querySelector('.budget-amount').value) || 0
  }));
}

function renderBudget() {
  const items = getBudgetItems();
  const total = items.reduce((s, it) => s + it.amount, 0);
  document.getElementById('budgetTotal').textContent = naira(total);
  document.getElementById('budgetPreviewRows').innerHTML = items.map(it =>
    `<div class="result-row"><span>${it.name}</span><span>${naira(it.amount)}</span></div>`
  ).join('');
  return { items, total };
}

document.getElementById('addBudgetBtn').addEventListener('click', () => { addBudgetRow(); renderBudget(); });
addBudgetRow('Catering');
addBudgetRow('Venue');
addBudgetRow('Aso-ebi (family)');
renderBudget();

document.getElementById('downloadBudgetBtn').addEventListener('click', async () => {
  const { items, total } = renderBudget();
  try {
    const doc = await KoboExport.buildTablePdf({
      style: 'branded',
      docLabel: 'Wedding Budget',
      businessName: 'Wedding / Party Budget Plan',
      columns: ['Category', 'Amount'],
      rightAlignCols: [1],
      rows: items.map(it => [it.name, naira(it.amount)]),
      totals: [{ label: 'Total budget', value: naira(total), emphasis: true }],
      watermark: true
    });
    KoboExport.download('wedding-budget-plan.pdf', doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBudgetBtn').addEventListener('click', async () => {
  const { items, total } = renderBudget();
  try {
    const doc = await KoboExport.buildTablePdf({
      style: 'branded',
      docLabel: 'Wedding Budget',
      businessName: 'Wedding / Party Budget Plan',
      columns: ['Category', 'Amount'],
      rightAlignCols: [1],
      rows: items.map(it => [it.name, naira(it.amount)]),
      totals: [{ label: 'Total budget', value: naira(total), emphasis: true }],
      watermark: true
    });
    await KoboExport.shareWhatsApp('wedding-budget-plan.pdf', `Wedding/party budget plan, total ${naira(total)}, made with KoboDocs.`, doc);
  } catch (err) {
    if (err.name !== 'AbortError') showMsg('Could not prepare the PDF: ' + err.message, 'error');
  }
});

// ======================================================================
// ASO-EBI TRACKER
// ======================================================================
function addAsoebiRow(name = '', amount = '', paid = false) {
  const row = document.createElement('div');
  row.className = 'asoebi-row';
  row.innerHTML = `
    <input type="text" class="asoebi-name" placeholder="Contributor name" value="${name}">
    <input type="number" class="asoebi-amount" placeholder="Amount (₦)" min="0" value="${amount}">
    <select class="asoebi-status">
      <option value="pending" ${!paid ? 'selected' : ''}>Pending</option>
      <option value="paid" ${paid ? 'selected' : ''}>Paid</option>
    </select>
    <button type="button" class="item-remove" aria-label="Remove">&times;</button>
  `;
  document.getElementById('asoebiRows').appendChild(row);
  row.querySelectorAll('input, select').forEach(inp => inp.addEventListener('input', renderAsoebi));
  row.querySelector('select').addEventListener('change', renderAsoebi);
  row.querySelector('.item-remove').addEventListener('click', () => { row.remove(); renderAsoebi(); });
}

function getAsoebiContributors() {
  return [...document.querySelectorAll('.asoebi-row')].map(row => ({
    name: row.querySelector('.asoebi-name').value || 'Contributor',
    amount: parseFloat(row.querySelector('.asoebi-amount').value) || 0,
    paid: row.querySelector('.asoebi-status').value === 'paid'
  }));
}

function renderAsoebi() {
  const contributors = getAsoebiContributors();
  const collected = contributors.filter(c => c.paid).reduce((s, c) => s + c.amount, 0);
  const outstanding = contributors.filter(c => !c.paid).reduce((s, c) => s + c.amount, 0);
  const paidCount = contributors.filter(c => c.paid).length;

  document.getElementById('asoebiCollected').textContent = naira(collected);
  document.getElementById('asoebiPaidCount').textContent = `${paidCount} of ${contributors.length}`;
  document.getElementById('asoebiOutstanding').textContent = naira(outstanding);

  return { contributors, collected, outstanding, paidCount };
}

document.getElementById('addAsoebiBtn').addEventListener('click', () => { addAsoebiRow(); renderAsoebi(); });
addAsoebiRow();
addAsoebiRow();
renderAsoebi();

document.getElementById('downloadAsoebiBtn').addEventListener('click', async () => {
  const { contributors, collected, outstanding } = renderAsoebi();
  try {
    const doc = await KoboExport.buildTablePdf({
      style: 'branded',
      docLabel: 'Aso-Ebi Tracker',
      businessName: 'Aso-Ebi Contribution List',
      columns: ['Contributor', 'Amount', 'Status'],
      rightAlignCols: [1],
      rows: contributors.map(c => [c.name, naira(c.amount), c.paid ? 'Paid' : 'Pending']),
      totals: [
        { label: 'Collected', value: naira(collected) },
        { label: 'Outstanding', value: naira(outstanding), emphasis: true }
      ],
      watermark: true
    });
    KoboExport.download('aso-ebi-tracker.pdf', doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waAsoebiBtn').addEventListener('click', async () => {
  const { contributors, collected, outstanding } = renderAsoebi();
  try {
    const doc = await KoboExport.buildTablePdf({
      style: 'branded',
      docLabel: 'Aso-Ebi Tracker',
      businessName: 'Aso-Ebi Contribution List',
      columns: ['Contributor', 'Amount', 'Status'],
      rightAlignCols: [1],
      rows: contributors.map(c => [c.name, naira(c.amount), c.paid ? 'Paid' : 'Pending']),
      totals: [
        { label: 'Collected', value: naira(collected) },
        { label: 'Outstanding', value: naira(outstanding), emphasis: true }
      ],
      watermark: true
    });
    await KoboExport.shareWhatsApp('aso-ebi-tracker.pdf', `Aso-ebi tracker — collected ${naira(collected)}, made with KoboDocs.`, doc);
  } catch (err) {
    if (err.name !== 'AbortError') showMsg('Could not prepare the PDF: ' + err.message, 'error');
  }
});
