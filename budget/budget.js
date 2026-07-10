const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function addRow(containerId, label = '', amount = '') {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.style.gridTemplateColumns = '1fr 140px 32px';
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

  return { month: document.getElementById('pMonth').textContent, income, expenses, totalIncome, totalExpenses, balance };
}

document.getElementById('budgetMonth').addEventListener('input', renderPreview);
document.getElementById('addIncomeBtn').addEventListener('click', () => addRow('incomeRows'));
document.getElementById('addExpenseBtn').addEventListener('click', () => addRow('expenseRows'));

document.getElementById('budgetMonth').value = new Date().toISOString().slice(0, 7);
addRow('incomeRows', 'Salary', 250000);
addRow('expenseRows', 'Rent', 80000);
addRow('expenseRows', 'Feeding', 60000);
addRow('expenseRows', 'Transport', 25000);
renderPreview();

document.getElementById('downloadBtn').addEventListener('click', () => {
  const d = renderPreview();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 48; let y = 60;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(`Budget — ${d.month}`, left, y); y += 30;
  doc.setDrawColor(20); doc.line(left, y, 547, y); y += 20;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Income', left, y); y += 6;
  doc.line(left, y, 547, y); y += 16;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  d.income.forEach(r => { doc.text(r.label, left, y); doc.text(naira(r.amount), 547, y, { align: 'right' }); y += 18; });

  y += 10; doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Expenses', left, y); y += 6;
  doc.line(left, y, 547, y); y += 16;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  d.expenses.forEach(r => { doc.text(r.label, left, y); doc.text(naira(r.amount), 547, y, { align: 'right' }); y += 18; });

  y += 16; doc.line(350, y, 547, y); y += 18;
  doc.text('Total income', 460, y, { align: 'right' }); doc.text(naira(d.totalIncome), 547, y, { align: 'right' }); y += 16;
  doc.text('Total expenses', 460, y, { align: 'right' }); doc.text(naira(d.totalExpenses), 547, y, { align: 'right' }); y += 18;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  const label = d.balance >= 0 ? 'Balance left over' : 'Shortfall';
  doc.text(label, 460, y, { align: 'right' }); doc.text(naira(Math.abs(d.balance)), 547, y, { align: 'right' });

  doc.save(`budget-${d.month.replace(/\s+/g, '-')}.pdf`);
});

document.getElementById('waBtn').addEventListener('click', () => {
  const d = renderPreview();
  const label = d.balance >= 0 ? 'Balance left over' : 'Shortfall';
  const lines = [
    `*Budget — ${d.month}*`,
    `Total income: ${naira(d.totalIncome)}`,
    `Total expenses: ${naira(d.totalExpenses)}`,
    `${label}: *${naira(Math.abs(d.balance))}*`
  ];
  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
});
