const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function buildSchedule() {
  const principal = parseFloat(document.getElementById('loanAmount').value) || 0;
  const annualRate = parseFloat(document.getElementById('loanRate').value) || 0;
  const months = Math.max(parseInt(document.getElementById('loanMonths').value, 10) || 1, 1);
  const startRaw = document.getElementById('loanStart').value;
  const startDate = startRaw ? new Date(startRaw + 'T00:00:00') : new Date();

  const monthlyRate = annualRate / 100 / 12;
  // Standard amortized payment formula (reducing balance)
  const payment = monthlyRate === 0
    ? principal / months
    : principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);

  let balance = principal;
  const rows = [];
  for (let i = 1; i <= months; i++) {
    const interest = balance * monthlyRate;
    let principalPaid = payment - interest;
    if (i === months) principalPaid = balance; // clean up rounding on final row
    const actualPayment = interest + principalPaid;
    balance = Math.max(balance - principalPaid, 0);
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + (i - 1));
    rows.push({
      month: i,
      dateLabel: date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      payment: actualPayment,
      interest,
      principal: principalPaid,
      balance
    });
  }

  const totalPaid = rows.reduce((s, r) => s + r.payment, 0);
  const totalInterest = totalPaid - principal;

  return { principal, annualRate, months, payment, rows, totalPaid, totalInterest };
}

function renderPreview() {
  const lenderName = document.getElementById('lenderName').value || 'Lender name';
  const borrowerName = document.getElementById('borrowerName').value || 'Borrower name';
  document.getElementById('pLender').textContent = lenderName;
  document.getElementById('pBorrower').textContent = `Loan to ${borrowerName}`;

  const d = buildSchedule();

  document.getElementById('pSummary').innerHTML = `
    <div class="row"><span>Loan amount</span><span>${naira(d.principal)}</span></div>
    <div class="row"><span>Monthly payment</span><span>${naira(d.payment)}</span></div>
    <div class="row"><span>Total interest</span><span>${naira(d.totalInterest)}</span></div>
  `;

  document.getElementById('pSchedule').innerHTML = d.rows.map(r => `
    <tr>
      <td>${r.month}. ${r.dateLabel}</td>
      <td>${naira(r.payment)}</td>
      <td>${naira(r.interest)}</td>
      <td>${naira(r.principal)}</td>
      <td>${naira(r.balance)}</td>
    </tr>
  `).join('');

  return { lenderName, borrowerName, ...d };
}

['lenderName','borrowerName','loanAmount','loanRate','loanMonths','loanStart'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderPreview);
});

document.getElementById('loanStart').value = new Date().toISOString().split('T')[0];
renderPreview();

document.getElementById('downloadBtn').addEventListener('click', () => {
  const d = renderPreview();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 40; const right = 555;
  let y = 50;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(d.lenderName, left, y); y += 18;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
  doc.text(`Loan to ${d.borrowerName}`, left, y); y += 14;
  doc.text(`Principal: ${naira(d.principal)}  ·  Rate: ${d.annualRate}% p.a.  ·  Tenure: ${d.months} months`, left, y); y += 14;
  doc.text(`Monthly payment: ${naira(d.payment)}  ·  Total interest: ${naira(d.totalInterest)}`, left, y); y += 24;

  doc.setTextColor(20); doc.setDrawColor(20); doc.line(left, y, right, y); y += 16;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  const cols = [left, 270, 350, 430, 510];
  ['Month', 'Payment', 'Interest', 'Principal', 'Balance'].forEach((h, i) => doc.text(h, cols[i], y));
  y += 6; doc.line(left, y, right, y); y += 14;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  d.rows.forEach(r => {
    if (y > 780) { doc.addPage(); y = 50; }
    doc.text(`${r.month}. ${r.dateLabel}`, cols[0], y);
    doc.text(naira(r.payment), cols[1], y);
    doc.text(naira(r.interest), cols[2], y);
    doc.text(naira(r.principal), cols[3], y);
    doc.text(naira(r.balance), cols[4], y);
    y += 15;
  });

  doc.save(`loan-schedule-${d.borrowerName.replace(/\s+/g, '-') || 'borrower'}.pdf`);
});

document.getElementById('waBtn').addEventListener('click', () => {
  const d = renderPreview();
  const lines = [
    `*Loan schedule — ${d.lenderName}*`,
    `Borrower: ${d.borrowerName}`,
    `Principal: ${naira(d.principal)} at ${d.annualRate}% p.a. over ${d.months} months`,
    `Monthly payment: *${naira(d.payment)}*`,
    `Total interest: ${naira(d.totalInterest)}`
  ];
  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
});
