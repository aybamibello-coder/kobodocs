const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function addRow(containerId, label = '', amount = '') {
  const row = document.createElement('div');
  row.className = 'item-row budget-row';
  row.innerHTML = `
    <input type="text" class="row-label" placeholder="e.g. Salary, Rent, Feeding" value="${label}">
    <input type="number" class="row-amount" min="0" placeholder="₦" value="${amount}">
    <button type="button" class="item-remove" aria-label="Remove">&times;</button>
  `;
  document.getElementById(containerId).appendChild(row);
  row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', renderPreview));
  row.querySelector('.item-remove').addEventListener('click', () => { row.remove(); renderPreview(); });
}

function getRows(containerId) {
  return [...document.querySelectorAll(`#${containerId} .item-row`)].map(row => ({
    label: row.querySelector('.row-label').value || 'Item',
    amount: parseFloat(row.querySelector('.row-amount').value) || 0
  }));
}

function renderPreview() {
  const monthRaw = document.getElementById('budgetMonth').value;
  document.getElementById('pMonth').textContent = monthRaw
    ? new Date(monthRaw + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : 'This month';

  const income = getRows('incomeRows');
  const expenses = getRows('expenseRows');

  document.getElementById('pIncome').innerHTML = income.map(r => `<tr><td>${r.label}</td><td class="num">${naira(r.amount)}</td></tr>`).join('')
    || '<tr><td colspan="2" style="opacity:0.5;">No income added yet</td></tr>';
  document.getElementById('pExpenses').innerHTML = expenses.map(r => `<tr><td>${r.label}</td><td class="num">${naira(r.amount)}</td></tr>`).join('')
    || '<tr><td colspan="2" style="opacity:0.5;">No expenses added yet</td></tr>';

  const totalIncome = income.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);
  const balance = totalIncome - totalExpenses;
  const balanceLabel = balance >= 0 ? 'Balance left over' : 'Shortfall';

  document.getElementById('pTotals').innerHTML = `
    <div class="row"><span>Total income</span><span>${naira(totalIncome)}</span></div>
    <div class="row"><span>Total expenses</span><span>${naira(totalExpenses)}</span></div>
    <div class="row grand"><span>${balanceLabel}</span><span style="color:${balance >= 0 ? 'var(--stamp-gold)' : 'var(--stamp-red)'};">${naira(Math.abs(balance))}</span></div>
  `;

  if (window.KoboStorage) KoboStorage.save('budget', { budgetMonth: monthRaw, income, expenses });

  return { month: document.getElementById('pMonth').textContent, income, expenses, totalIncome, totalExpenses, balance };
}

function collectFormState() {
  return {
    budgetMonth: document.getElementById('budgetMonth').value,
    income: getRows('incomeRows'),
    expenses: getRows('expenseRows')
  };
}

function applyFormState(state) {
  document.getElementById('budgetMonth').value = state.budgetMonth || new Date().toISOString().slice(0, 7);
  document.getElementById('incomeRows').innerHTML = '';
  document.getElementById('expenseRows').innerHTML = '';
  (state.income && state.income.length ? state.income : [{ label: 'Salary', amount: 250000 }])
    .forEach(r => addRow('incomeRows', r.label, r.amount));
  (state.expenses && state.expenses.length ? state.expenses : [
    { label: 'Rent', amount: 80000 }, { label: 'Feeding', amount: 60000 }, { label: 'Transport', amount: 25000 }
  ]).forEach(r => addRow('expenseRows', r.label, r.amount));
}

document.getElementById('budgetMonth').addEventListener('input', renderPreview);
document.getElementById('addIncomeBtn').addEventListener('click', () => { addRow('incomeRows'); renderPreview(); });
document.getElementById('addExpenseBtn').addEventListener('click', () => { addRow('expenseRows'); renderPreview(); });

document.getElementById('clearFormBtn').addEventListener('click', () => {
  if (!confirm('Clear this form? This only affects this device.')) return;
  KoboStorage.clear('budget');
  document.getElementById('budgetMonth').value = new Date().toISOString().slice(0, 7);
  document.getElementById('incomeRows').innerHTML = '';
  document.getElementById('expenseRows').innerHTML = '';
  renderPreview();
});

const saved = window.KoboStorage ? KoboStorage.load('budget') : null;
applyFormState(saved || {});
renderPreview();

let watermarkHidden = false;

function buildBudgetPdf(d) {
  const rows = [['Income', '']];
  d.income.forEach(r => rows.push([r.label, naira(r.amount)]));
  rows.push(['Expenses', '']);
  d.expenses.forEach(r => rows.push([r.label, naira(r.amount)]));

  const label = d.balance >= 0 ? 'Balance left over' : 'Shortfall';

  return KoboExport.buildTablePdf({
    docLabel: 'Budget Plan',
    businessName: d.month,
    columns: ['Item', 'Amount'],
    rightAlignCols: [1],
    rows,
    totals: [
      { label: 'Total income', value: naira(d.totalIncome) },
      { label: 'Total expenses', value: naira(d.totalExpenses) },
      { label, value: naira(Math.abs(d.balance)), emphasis: true }
    ],
    watermark: !watermarkHidden
  });
}

document.getElementById('downloadBtn').addEventListener('click', () => {
  const d = renderPreview();
  try {
    const doc = buildBudgetPdf(d);
    KoboExport.download(`budget-${(d.month || 'plan').replace(/\s+/g, '-')}.pdf`, doc);
  } catch (err) {
    alert('Could not generate PDF: ' + err.message);
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  const d = renderPreview();
  const btn = document.getElementById('waBtn');
  const originalText = btn.textContent;

  const label = d.balance >= 0 ? 'Balance left over' : 'Shortfall';
  const caption = [
    `*Budget — ${d.month}*`,
    `Total income: ${naira(d.totalIncome)}`,
    `Total expenses: ${naira(d.totalExpenses)}`,
    `${label}: *${naira(Math.abs(d.balance))}*`
  ].join('\n');

  try {
    const doc = buildBudgetPdf(d);
    const result = await KoboExport.shareWhatsApp(`budget-${(d.month || 'plan').replace(/\s+/g, '-')}.pdf`, caption, doc);
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

