const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Nigeria Tax Act 2025 (effective 1 Jan 2026) progressive annual bands — same as Payslip tool.
const TAX_BANDS = [
  { size: 800000, rate: 0 },
  { size: 2200000, rate: 0.15 },   // 800,001 - 3,000,000
  { size: 9000000, rate: 0.18 },   // 3,000,001 - 12,000,000
  { size: 13000000, rate: 0.21 },  // 12,000,001 - 25,000,000
  { size: 25000000, rate: 0.23 },  // 25,000,001 - 50,000,000
  { size: Infinity, rate: 0.25 }
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

  document.getElementById('rGross').textContent = naira(grossMonthly);
  document.getElementById('rPension').textContent = naira(pensionMonthly);
  document.getElementById('rNhf').textContent = naira(nhfMonthly);
  document.getElementById('rPaye').textContent = naira(payeMonthly);
  document.getElementById('rNet').textContent = naira(netMonthly);
}

document.querySelectorAll('.form-panel input').forEach(el => el.addEventListener('input', calc));
calc();
