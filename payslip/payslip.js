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

  if (window.KoboStorage) KoboStorage.save('payslip', collectFormState());

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

function collectFormState() {
  return {
    empName: document.getElementById('empName').value,
    staffName: document.getElementById('staffName').value,
    payPeriod: document.getElementById('payPeriod').value,
    basic: document.getElementById('basic').value,
    housing: document.getElementById('housing').value,
    transport: document.getElementById('transport').value,
    other: document.getElementById('other').value,
    pensionOn: document.getElementById('pensionToggle').checked,
    nhfOn: document.getElementById('nhfToggle').checked,
    annualRent: document.getElementById('annualRent').value
  };
}

function applyFormState(state) {
  document.getElementById('empName').value = state.empName || '';
  document.getElementById('staffName').value = state.staffName || '';
  document.getElementById('payPeriod').value = state.payPeriod || new Date().toISOString().slice(0, 7);
  document.getElementById('basic').value = state.basic ?? 200000;
  document.getElementById('housing').value = state.housing ?? 60000;
  document.getElementById('transport').value = state.transport ?? 30000;
  document.getElementById('other').value = state.other ?? 0;
  document.getElementById('pensionToggle').checked = state.pensionOn !== false;
  document.getElementById('nhfToggle').checked = state.nhfOn !== false;
  document.getElementById('annualRent').value = state.annualRent ?? 0;
}

['empName','staffName','payPeriod','basic','housing','transport','other','pensionToggle','nhfToggle','annualRent'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('input', renderPreview);
  el.addEventListener('change', renderPreview);
});

document.getElementById('clearFormBtn').addEventListener('click', () => {
  if (!confirm('Clear this form? This only affects this device.')) return;
  KoboStorage.clear('payslip');
  applyFormState({});
  renderPreview();
});

const saved = window.KoboStorage ? KoboStorage.load('payslip') : null;
if (saved) applyFormState(saved);
else applyFormState({});
renderPreview();

document.getElementById('downloadBtn').addEventListener('click', async () => {
  const d = renderPreview();
  const btn = document.getElementById('downloadBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Preparing PDF…';
  btn.disabled = true;
  try {
    await KoboExport.downloadPdf(`payslip-${(d.staffName || 'employee').replace(/\s+/g, '-')}.pdf`);
  } catch (err) {
    alert('Could not generate PDF: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  const d = renderPreview();
  const btn = document.getElementById('waBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Preparing image…';
  btn.disabled = true;

  const caption = [
    `*Payslip — ${d.period}*`,
    `${d.empName}`,
    `Employee: ${d.staffName}`,
    '',
    `Gross pay: ${naira(d.grossMonthly)}`,
    `Net pay: *${naira(d.netMonthly)}*`
  ].join('\n');

  try {
    const result = await KoboExport.shareWhatsApp(`payslip-${(d.staffName || 'employee').replace(/\s+/g, '-')}.png`, caption);
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
