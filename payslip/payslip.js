const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Nigeria Tax Act 2025 (effective 1 Jan 2026) progressive annual bands.
// Source-checked: 0% to ₦800k, then 15/18/21/23/25% — corroborated across
// Africa Check, iTax.ng, and NGN Market as of mid-2026.
const TAX_BANDS = [
  { size: 800000, rate: 0 },
  { size: 2200000, rate: 0.15 },   // 800,001 - 3,000,000
  { size: 9000000, rate: 0.18 },   // 3,000,001 - 12,000,000
  { size: 13000000, rate: 0.21 },  // 12,000,001 - 25,000,000
  { size: 25000000, rate: 0.23 },  // 25,000,001 - 50,000,000
  { size: Infinity, rate: 0.25 }   // above 50,000,000
];

function annualTax(taxable) {
  let remaining = Math.max(taxable, 0);
  let tax = 0;
  for (const band of TAX_BANDS) {
    if (remaining <= 0) break;
    const chunk = Math.min(remaining, band.size);
    tax += chunk * band.rate;
    remaining -= chunk;
  }
  return tax;
}

function calc() {
  const basic = parseFloat(document.getElementById('basic').value) || 0;
  const housing = parseFloat(document.getElementById('housing').value) || 0;
  const transport = parseFloat(document.getElementById('transport').value) || 0;
  const other = parseFloat(document.getElementById('other').value) || 0;
  const pensionOn = document.getElementById('pensionToggle').checked;
  const nhfOn = document.getElementById('nhfToggle').checked;
  const annualRent = parseFloat(document.getElementById('annualRent').value) || 0;

  const grossMonthly = basic + housing + transport + other;
  const grossAnnual = grossMonthly * 12;

  const pensionAnnual = pensionOn ? 0.08 * (basic + housing + transport) * 12 : 0;
  const nhfAnnual = nhfOn ? 0.025 * basic * 12 : 0;
  const rentRelief = annualRent > 0 ? Math.min(0.2 * annualRent, 500000) : 0;

  const taxableAnnual = Math.max(grossAnnual - pensionAnnual - nhfAnnual - rentRelief, 0);
  const payeAnnual = annualTax(taxableAnnual);

  const pensionMonthly = pensionAnnual / 12;
  const nhfMonthly = nhfAnnual / 12;
  const payeMonthly = payeAnnual / 12;
  const netMonthly = grossMonthly - pensionMonthly - nhfMonthly - payeMonthly;

  return { basic, housing, transport, other, grossMonthly, pensionMonthly, nhfMonthly, payeMonthly, netMonthly, pensionOn, nhfOn };
}

function renderPreview() {
  const empName = document.getElementById('empName').value || 'Employer name';
  const staffName = document.getElementById('staffName').value || 'Employee name';
  const periodRaw = document.getElementById('payPeriod').value;

  document.getElementById('pEmpName').textContent = empName;
  document.getElementById('pStaffName').textContent = staffName;
  document.getElementById('pPeriod').textContent = periodRaw
    ? new Date(periodRaw + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const d = calc();

  document.getElementById('pEarnings').innerHTML = `
    <tr><td>Basic salary</td><td class="num">${naira(d.basic)}</td></tr>
    <tr><td>Housing allowance</td><td class="num">${naira(d.housing)}</td></tr>
    <tr><td>Transport allowance</td><td class="num">${naira(d.transport)}</td></tr>
    ${d.other ? `<tr><td>Other allowances</td><td class="num">${naira(d.other)}</td></tr>` : ''}
  `;

  let deductionsHtml = '';
  if (d.pensionOn) deductionsHtml += `<tr><td>Pension (8%)</td><td class="num">${naira(d.pensionMonthly)}</td></tr>`;
  if (d.nhfOn) deductionsHtml += `<tr><td>NHF (2.5% of basic)</td><td class="num">${naira(d.nhfMonthly)}</td></tr>`;
  deductionsHtml += `<tr><td>PAYE tax</td><td class="num">${naira(d.payeMonthly)}</td></tr>`;
  document.getElementById('pDeductions').innerHTML = deductionsHtml;

  document.getElementById('pTotals').innerHTML = `
    <div class="row"><span>Gross pay</span><span>${naira(d.grossMonthly)}</span></div>
    <div class="row grand"><span>Net pay</span><span>${naira(d.netMonthly)}</span></div>
  `;

  return { empName, staffName, period: document.getElementById('pPeriod').textContent, ...d };
}

['empName','staffName','payPeriod','basic','housing','transport','other','pensionToggle','nhfToggle','annualRent'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('input', renderPreview);
  el.addEventListener('change', renderPreview);
});

document.getElementById('payPeriod').value = new Date().toISOString().slice(0, 7);
document.getElementById('basic').value = 200000;
document.getElementById('housing').value = 60000;
document.getElementById('transport').value = 30000;
renderPreview();

document.getElementById('downloadBtn').addEventListener('click', () => {
  const d = renderPreview();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 48; let y = 60;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(d.empName, left, y); y += 22;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.text(`Payslip for ${d.staffName}`, left, y); y += 14;
  doc.setFontSize(10); doc.setTextColor(90); doc.text(`Pay period: ${d.period}`, left, y); y += 24;

  doc.setTextColor(20); doc.setDrawColor(20); doc.line(left, y, 547, y); y += 20;
  doc.setFont('helvetica', 'bold'); doc.text('Earnings', left, y); doc.text('Amount', 547, y, { align: 'right' }); y += 6;
  doc.line(left, y, 547, y); y += 16;
  doc.setFont('helvetica', 'normal');
  const earnings = [['Basic salary', d.basic], ['Housing allowance', d.housing], ['Transport allowance', d.transport]];
  if (d.other) earnings.push(['Other allowances', d.other]);
  earnings.forEach(([label, val]) => { doc.text(label, left, y); doc.text(naira(val), 547, y, { align: 'right' }); y += 18; });

  y += 10; doc.setFont('helvetica', 'bold'); doc.text('Deductions', left, y); doc.text('Amount', 547, y, { align: 'right' }); y += 6;
  doc.line(left, y, 547, y); y += 16; doc.setFont('helvetica', 'normal');
  const deductions = [];
  if (d.pensionOn) deductions.push(['Pension (8%)', d.pensionMonthly]);
  if (d.nhfOn) deductions.push(['NHF (2.5% of basic)', d.nhfMonthly]);
  deductions.push(['PAYE tax', d.payeMonthly]);
  deductions.forEach(([label, val]) => { doc.text(label, left, y); doc.text(naira(val), 547, y, { align: 'right' }); y += 18; });

  y += 14; doc.line(350, y, 547, y); y += 18;
  doc.text('Gross pay', 460, y, { align: 'right' }); doc.text(naira(d.grossMonthly), 547, y, { align: 'right' }); y += 18;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('Net pay', 460, y, { align: 'right' }); doc.text(naira(d.netMonthly), 547, y, { align: 'right' });

  y += 30; doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(120);
  doc.text('Estimated figures based on the Nigeria Tax Act 2025 (effective Jan 2026). Confirm with an accountant or the Nigeria Revenue Service before relying on for compliance.', left, y, { maxWidth: 499 });

  doc.save(`payslip-${d.staffName.replace(/\s+/g, '-') || 'employee'}.pdf`);
});

document.getElementById('waBtn').addEventListener('click', () => {
  const d = renderPreview();
  const lines = [
    `*Payslip — ${d.period}*`,
    `${d.empName}`,
    `Employee: ${d.staffName}`,
    '',
    `Gross pay: ${naira(d.grossMonthly)}`,
    `Net pay: *${naira(d.netMonthly)}*`
  ];
  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
});
