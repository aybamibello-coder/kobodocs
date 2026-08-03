let hasAccess = false;

function val(id) { return document.getElementById(id).value.trim(); }
function num(id) {
  const v = val(id).replace(/,/g, '');
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function fmtN(n) {
  return '₦' + Math.round(n).toLocaleString('en-NG');
}

// ---------- Financial model ----------
function getStartupCosts() {
  return [
    { label: 'Equipment / assets', amount: num('costEquipment') },
    { label: 'Registration & legal', amount: num('costRegistration') },
    { label: 'Rent / deposit', amount: num('costRent') },
    { label: 'Initial inventory / stock', amount: num('costInventory') },
    { label: 'Marketing & launch', amount: num('costMarketing') },
    { label: 'Working capital buffer', amount: num('costWorkingCapital') },
    { label: 'Other startup costs', amount: num('costOther') },
  ];
}
function totalStartupCost() {
  return getStartupCosts().reduce((sum, c) => sum + c.amount, 0);
}
function monthlyOpex() {
  return num('expRent') + num('expSalaries') + num('expUtilities') + num('expOther');
}
function getRevenueForecast() {
  const month1 = num('month1Revenue');
  const growth = num('growthRate') / 100;
  const months = [];
  let revenue = month1;
  for (let i = 1; i <= 12; i++) {
    months.push(revenue);
    revenue = revenue * (1 + growth);
  }
  return months;
}
function getBreakEvenMonth() {
  const revenue = getRevenueForecast();
  const opex = monthlyOpex();
  const startupCost = totalStartupCost();
  let cumulative = -startupCost;
  for (let i = 0; i < revenue.length; i++) {
    cumulative += (revenue[i] - opex);
    if (cumulative >= 0) return i + 1;
  }
  return null; // not within 12 months
}
function getAmountRequested() {
  const entered = num('amountRequested');
  return entered > 0 ? entered : totalStartupCost();
}

// ---------- On-screen preview ----------
function renderPreview() {
  const businessName = val('businessName') || '[Business name]';
  const startupCosts = getStartupCosts();
  const startupTotal = totalStartupCost();
  const revenue = getRevenueForecast();
  const opex = monthlyOpex();
  const breakEven = getBreakEvenMonth();
  const year1Revenue = revenue.reduce((a, b) => a + b, 0);

  const content = document.getElementById('bpContent');
  content.innerHTML = `
    <div class="bp-title">Business Plan</div>
    <div class="bp-subtitle">${businessName}</div>

    <div class="bp-h2">Executive Summary</div>
    <p>${businessName} is requesting ${fmtN(getAmountRequested())} to ${val('fundingPurpose') || 'fund startup costs and initial operations'}. Based on the projections below, the business is expected to reach break-even ${breakEven ? `in month ${breakEven}` : 'beyond the 12-month forecast window'}, with projected Year 1 revenue of ${fmtN(year1Revenue)}.</p>

    <div class="bp-h2">Startup Costs</div>
    <table class="bp-table">
      <thead><tr><th>Item</th><th>Amount</th></tr></thead>
      <tbody>
        ${startupCosts.map(c => `<tr><td>${c.label}</td><td>${fmtN(c.amount)}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td>Total</td><td>${fmtN(startupTotal)}</td></tr></tfoot>
    </table>

    <div class="bp-h2">Break-Even</div>
    <div class="bp-callout">${breakEven ? `Projected break-even in Month ${breakEven}, based on your revenue and expense assumptions.` : 'Cumulative profit does not turn positive within the 12-month forecast at these assumptions — consider revisiting revenue, costs, or funding amount.'}</div>

    <div class="bp-h2">Funding Request</div>
    <p>Amount requested: ${fmtN(getAmountRequested())}${val('fundingPurpose') ? `<br>${val('fundingPurpose')}` : ''}</p>
  `;
}

document.querySelectorAll('.form-panel input, .form-panel select, .form-panel textarea').forEach(el => {
  el.addEventListener('input', renderPreview);
  el.addEventListener('change', renderPreview);
});
renderPreview();

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

// ---------- PDF building (custom, since this needs mixed prose + multiple tables) ----------
const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 50;

function newDoc() {
  return new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
}

function checkPageBreak(doc, y, needed = 60) {
  if (y > PAGE_H - MARGIN - needed) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function addTitle(doc, title, subtitle) {
  doc.setFont('times', 'bold'); doc.setFontSize(16);
  doc.text(title, PAGE_W / 2, MARGIN, { align: 'center' });
  doc.setFont('times', 'normal'); doc.setFontSize(11);
  doc.text(subtitle, PAGE_W / 2, MARGIN + 20, { align: 'center' });
  return MARGIN + 50;
}

function addHeading(doc, text, y) {
  y = checkPageBreak(doc, y, 40);
  doc.setFont('times', 'bold'); doc.setFontSize(12);
  doc.text(text, MARGIN, y);
  return y + 18;
}

function addParagraph(doc, text, y) {
  doc.setFont('times', 'normal'); doc.setFontSize(10);
  const lines = doc.splitTextToSize(text || '—', PAGE_W - MARGIN * 2);
  for (const line of lines) {
    y = checkPageBreak(doc, y, 20);
    doc.text(line, MARGIN, y);
    y += 14;
  }
  return y + 8;
}

function addTable(doc, headers, rows, y, colWidths) {
  const totalW = PAGE_W - MARGIN * 2;
  const widths = colWidths || headers.map(() => totalW / headers.length);
  y = checkPageBreak(doc, y, 40);
  doc.setFont('times', 'bold'); doc.setFontSize(9);
  let x = MARGIN;
  headers.forEach((h, i) => { doc.text(h, i === 0 ? x : x + widths[i] - 4, y, { align: i === 0 ? 'left' : 'right' }); x += widths[i]; });
  y += 6;
  doc.line(MARGIN, y, MARGIN + totalW, y);
  y += 14;
  doc.setFont('times', 'normal');
  rows.forEach(row => {
    y = checkPageBreak(doc, y, 20);
    x = MARGIN;
    row.forEach((cell, i) => { doc.text(String(cell), i === 0 ? x : x + widths[i] - 4, y, { align: i === 0 ? 'left' : 'right' }); x += widths[i]; });
    y += 15;
  });
  return y + 10;
}

function buildPlanPdf() {
  const doc = newDoc();
  const businessName = val('businessName') || '[Business name]';
  const startupCosts = getStartupCosts();
  const startupTotal = totalStartupCost();
  const revenue = getRevenueForecast();
  const breakEven = getBreakEvenMonth();
  const year1Revenue = revenue.reduce((a, b) => a + b, 0);

  let y = addTitle(doc, 'Business Plan', businessName);

  y = addHeading(doc, '1. Executive Summary', y);
  y = addParagraph(doc, `${businessName} (${val('businessType') || 'business'}) operates in ${val('industry') || '[industry]'}, based in ${val('location') || '[location]'}. The business is requesting ${fmtN(getAmountRequested())} to ${val('fundingPurpose') || 'fund startup costs and initial operations'}. Based on the financial projections in this plan, the business is expected to reach break-even ${breakEven ? `in month ${breakEven} of operation` : 'beyond the 12-month forecast window at the current assumptions'}, with projected Year 1 revenue of ${fmtN(year1Revenue)}.`, y);

  y = addHeading(doc, '2. Business Description', y);
  y = addParagraph(doc, val('missionStatement') || '[Mission / business summary not provided]', y);

  y = addHeading(doc, '3. Products & Services', y);
  y = addParagraph(doc, val('productsServices') || '[Not provided]', y);

  y = addHeading(doc, '4. Market Analysis', y);
  y = addParagraph(doc, `Target market: ${val('targetMarket') || '[Not provided]'}`, y);
  y = addParagraph(doc, `Main competitors: ${val('competitors') || '[Not provided]'}`, y);
  y = addParagraph(doc, `Competitive advantage: ${val('competitiveAdvantage') || '[Not provided]'}`, y);

  y = addHeading(doc, '5. Management & Organization', y);
  y = addParagraph(doc, `${val('ownerName') || '[Owner name]'} — ${val('ownerRole') || 'Founder / Managing Director'}.${val('keyStaff') ? ` Team: ${val('keyStaff')}.` : ''}`, y);

  y = addHeading(doc, '6. Use of Funds', y);
  y = addTable(doc, ['Item', 'Amount'], startupCosts.map(c => [c.label, fmtN(c.amount)]).concat([['Total', fmtN(startupTotal)]]), y, [340, 155]);

  y = addHeading(doc, '7. Funding Request', y);
  y = addParagraph(doc, `Amount requested: ${fmtN(getAmountRequested())}`, y);

  return doc;
}

function buildFinancialsPdf() {
  const doc = newDoc();
  const businessName = val('businessName') || '[Business name]';
  const startupCosts = getStartupCosts();
  const startupTotal = totalStartupCost();
  const revenue = getRevenueForecast();
  const opex = monthlyOpex();
  const breakEven = getBreakEvenMonth();
  const year1Revenue = revenue.reduce((a, b) => a + b, 0);

  let y = addTitle(doc, 'Financial Projections', businessName);

  y = addHeading(doc, 'Startup Costs', y);
  y = addTable(doc, ['Item', 'Amount'], startupCosts.map(c => [c.label, fmtN(c.amount)]).concat([['Total', fmtN(startupTotal)]]), y, [340, 155]);

  y = addHeading(doc, '12-Month Revenue Forecast', y);
  let cumulative = -startupTotal;
  const monthRows = revenue.map((rev, i) => {
    cumulative += (rev - opex);
    return [`Month ${i + 1}`, fmtN(rev), fmtN(opex), fmtN(rev - opex), fmtN(cumulative)];
  });
  y = addTable(doc, ['Month', 'Revenue', 'Expenses', 'Net', 'Cumulative'], monthRows, y, [90, 105, 105, 100, 95]);

  y = addHeading(doc, 'Summary', y);
  y = addParagraph(doc, `Total Year 1 revenue: ${fmtN(year1Revenue)}`, y);
  y = addParagraph(doc, `Monthly operating expenses: ${fmtN(opex)}`, y);
  y = addParagraph(doc, breakEven ? `Break-even: Month ${breakEven}` : 'Break-even: not reached within 12 months at these assumptions', y);

  return doc;
}

document.getElementById('downloadPlanBtn').addEventListener('click', () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  try {
    buildPlanPdf().save('business-plan.pdf');
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('downloadFinancialsBtn').addEventListener('click', () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  try {
    buildFinancialsPdf().save('financial-projections.pdf');
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  try {
    const doc = buildPlanPdf();
    const blob = doc.output('blob');
    const file = new File([blob], 'business-plan.pdf', { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: 'My business plan, made with KoboDocs.' });
    } else {
      doc.save('business-plan.pdf');
      showMsg('WhatsApp file sharing isn\'t supported on this device/browser — the PDF downloaded instead, attach it to WhatsApp manually.', 'success');
    }
  } catch (err) {
    if (err.name !== 'AbortError') showMsg('Could not prepare the PDF: ' + err.message, 'error');
  }
});

document.getElementById('buyPassBtn').addEventListener('click', async () => {
  const btn = document.getElementById('buyPassBtn');
  const original = btn.textContent;
  btn.textContent = 'Redirecting…';
  btn.disabled = true;
  try {
    await KoboSubscribe.start('init-tool-pass-payment', { tool_key: 'business_plan_generator', callback_path: '/business-plan-generator/' });
  } catch {
    btn.textContent = original;
    btn.disabled = false;
  }
});

// ---------- Access check ----------
async function checkAccess() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const session = await window.KoboAuth.getSession();
  if (!session) {
    document.getElementById('bpContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
    return;
  }

  try {
    const res = await fetch('https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1/check-tool-pass-access', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_key: 'business_plan_generator' })
    });
    const data = await res.json();
    hasAccess = !!data.allowed;
  } catch {
    hasAccess = false;
  }

  if (hasAccess) {
    document.getElementById('bpContent').classList.remove('locked');
    document.getElementById('lockOverlay').classList.remove('show');
  } else {
    document.getElementById('bpContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
  }
}

checkAccess();
KoboSubscribe.resumePendingIfAny().then(() => setTimeout(checkAccess, 500));
