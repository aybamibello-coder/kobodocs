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

const GRANT_TYPE_LABELS = {
  ngo_donor: { title: 'Grant Proposal', subtitle: 'NGO / Donor-Funded Program' },
  government: { title: 'Grant Application', subtitle: 'Government / Institutional Fund' },
  corporate_csr: { title: 'Grant Application', subtitle: 'Corporate / CSR Program' }
};

function currentGrantType() {
  return document.querySelector('input[name="grantType"]:checked').value;
}

// ---------- Budget ----------
function getBudgetItems() {
  const items = [];
  document.querySelectorAll('#budgetRows .budget-row').forEach(row => {
    const label = row.querySelector('.budgetLabel').value.trim();
    const amount = parseFloat(row.querySelector('.budgetAmount').value.replace(/,/g, '')) || 0;
    if (label || amount) items.push({ label: label || 'Untitled item', amount });
  });
  return items;
}
function totalBudget() {
  return getBudgetItems().reduce((sum, i) => sum + i.amount, 0);
}
function getAmountRequested() {
  const entered = num('amountRequested');
  return entered > 0 ? entered : totalBudget();
}

function addBudgetRow(label = '', amount = '') {
  const wrap = document.getElementById('budgetRows');
  const row = document.createElement('div');
  row.className = 'field-row budget-row';
  row.innerHTML = `
    <div class="field-group"><input type="text" class="budgetLabel" placeholder="Budget line item" value="${label}"></div>
    <div class="field-group" style="display:flex; gap:6px;">
      <input type="text" class="budgetAmount" placeholder="Amount (₦)" value="${amount}" style="flex:1;">
      <button type="button" class="btn btn-ghost removeBudgetRow" style="padding:6px 10px; border-color:var(--line);">✕</button>
    </div>
  `;
  wrap.appendChild(row);
  row.querySelectorAll('input').forEach(el => { el.addEventListener('input', renderPreview); });
  row.querySelector('.removeBudgetRow').addEventListener('click', () => { row.remove(); renderPreview(); });
}

// ---------- Logframe (M&E) ----------
function getLogframeRows() {
  const rows = [];
  document.querySelectorAll('#logframeRows .logframe-row').forEach(row => {
    const objective = row.querySelector('.lfObjective').value.trim();
    const indicator = row.querySelector('.lfIndicator').value.trim();
    const verification = row.querySelector('.lfVerification').value.trim();
    if (objective || indicator || verification) rows.push({ objective, indicator, verification });
  });
  return rows;
}
function addLogframeRow(objective = '', indicator = '', verification = '') {
  const wrap = document.getElementById('logframeRows');
  const row = document.createElement('div');
  row.className = 'logframe-row';
  row.style.cssText = 'border:1px solid var(--line); border-radius:6px; padding:10px; margin-bottom:8px;';
  row.innerHTML = `
    <div class="field-group"><label>Objective</label><input type="text" class="lfObjective" placeholder="e.g. Increase household income for 200 women" value="${objective}"></div>
    <div class="field-row">
      <div class="field-group"><label>Indicator</label><input type="text" class="lfIndicator" placeholder="e.g. % increase in monthly income" value="${indicator}"></div>
      <div class="field-group"><label>Means of verification</label><input type="text" class="lfVerification" placeholder="e.g. Household income surveys" value="${verification}"></div>
    </div>
    <button type="button" class="btn btn-ghost removeLogframeRow" style="border-color:var(--line); padding:5px 12px; font-size:0.8rem;">Remove row</button>
  `;
  wrap.appendChild(row);
  row.querySelectorAll('input').forEach(el => { el.addEventListener('input', renderPreview); });
  row.querySelector('.removeLogframeRow').addEventListener('click', () => { row.remove(); renderPreview(); });
}

// ---------- On-screen preview ----------
function renderPreview() {
  const grantType = currentGrantType();
  const labels = GRANT_TYPE_LABELS[grantType];
  const orgName = val('orgName') || '[Organization / business name]';
  const projectTitle = val('projectTitle') || '[Project title]';
  const budgetItems = getBudgetItems();
  const budgetTotal = totalBudget();

  const content = document.getElementById('gpContent');
  content.innerHTML = `
    <div class="bp-title">${labels.title}</div>
    <div class="bp-subtitle">${labels.subtitle} — ${orgName}</div>

    <div class="bp-h2">Project Title</div>
    <p>${projectTitle}</p>

    <div class="bp-h2">Executive Summary</div>
    <p>${orgName} is requesting ${fmtN(getAmountRequested())}${val('funderName') ? ` from ${val('funderName')}` : ''} to ${val('fundingPurpose') || 'implement the project described in this application'}.</p>

    <div class="bp-h2">Statement of Need</div>
    <p>${val('statementOfNeed') || '[Not provided]'}</p>

    <div class="bp-h2">Goals &amp; Objectives</div>
    <p>${val('goalsObjectives') || '[Not provided]'}</p>

    <div class="bp-h2">Budget Summary</div>
    <table class="bp-table">
      <thead><tr><th>Item</th><th>Amount</th></tr></thead>
      <tbody>
        ${budgetItems.length ? budgetItems.map(i => `<tr><td>${i.label}</td><td>${fmtN(i.amount)}</td></tr>`).join('') : '<tr><td colspan="2" style="text-align:center; opacity:0.6;">Add budget items on the left</td></tr>'}
      </tbody>
      <tfoot><tr><td>Total</td><td>${fmtN(budgetTotal)}</td></tr></tfoot>
    </table>
  `;
}

document.querySelectorAll('.form-panel input, .form-panel select, .form-panel textarea').forEach(el => {
  el.addEventListener('input', renderPreview);
  el.addEventListener('change', renderPreview);
});
document.querySelectorAll('input[name="grantType"]').forEach(el => el.addEventListener('change', renderPreview));
addBudgetRow();
addBudgetRow();
document.getElementById('addBudgetRowBtn').addEventListener('click', () => addBudgetRow());
document.getElementById('addLogframeRowBtn').addEventListener('click', () => addLogframeRow());
renderPreview();

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

// ---------- PDF building ----------
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
function addLogframeTable(doc, rows, y) {
  if (!rows.length) return y;
  y = checkPageBreak(doc, y, 60);
  doc.setFont('times', 'bold'); doc.setFontSize(9);
  const widths = [160, 145, 145];
  let x = MARGIN;
  ['Objective', 'Indicator', 'Means of Verification'].forEach((h, i) => { doc.text(h, x, y); x += widths[i]; });
  y += 6;
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 14;
  doc.setFont('times', 'normal'); doc.setFontSize(8.5);
  rows.forEach(r => {
    const objLines = doc.splitTextToSize(r.objective || '—', widths[0] - 6);
    const indLines = doc.splitTextToSize(r.indicator || '—', widths[1] - 6);
    const verLines = doc.splitTextToSize(r.verification || '—', widths[2] - 6);
    const lineCount = Math.max(objLines.length, indLines.length, verLines.length);
    y = checkPageBreak(doc, y, lineCount * 12 + 10);
    x = MARGIN;
    doc.text(objLines, x, y); x += widths[0];
    doc.text(indLines, x, y); x += widths[1];
    doc.text(verLines, x, y);
    y += lineCount * 12 + 8;
  });
  return y + 10;
}

function buildProposalPdf() {
  const grantType = currentGrantType();
  const labels = GRANT_TYPE_LABELS[grantType];
  const doc = newDoc();
  const orgName = val('orgName') || '[Organization / business name]';
  const budgetItems = getBudgetItems();
  const budgetTotal = totalBudget();
  const logframeRows = getLogframeRows();

  let y = addTitle(doc, labels.title, `${labels.subtitle} — ${orgName}`);

  y = addHeading(doc, '1. Project Title', y);
  y = addParagraph(doc, val('projectTitle') || '[Not provided]', y);

  y = addHeading(doc, '2. Organization Background', y);
  y = addParagraph(doc, `${orgName}${val('orgType') ? ` (${val('orgType')})` : ''}, based in ${val('location') || '[location]'}.${val('orgBackground') ? ` ${val('orgBackground')}` : ''}`, y);

  y = addHeading(doc, '3. Executive Summary', y);
  y = addParagraph(doc, `${orgName} is requesting ${fmtN(getAmountRequested())}${val('funderName') ? ` from ${val('funderName')}` : ''} to ${val('fundingPurpose') || 'implement the project described in this application'}.`, y);

  y = addHeading(doc, '4. Statement of Need', y);
  y = addParagraph(doc, val('statementOfNeed') || '[Not provided]', y);

  y = addHeading(doc, '5. Goals & Objectives', y);
  y = addParagraph(doc, val('goalsObjectives') || '[Not provided]', y);

  y = addHeading(doc, '6. Target Beneficiaries', y);
  y = addParagraph(doc, val('targetBeneficiaries') || '[Not provided]', y);

  y = addHeading(doc, '7. Methodology / Approach', y);
  y = addParagraph(doc, val('methodology') || '[Not provided]', y);

  if (logframeRows.length) {
    y = addHeading(doc, '8. Monitoring & Evaluation (Logframe)', y);
    y = addLogframeTable(doc, logframeRows, y);
  } else {
    y = addHeading(doc, '8. Monitoring & Evaluation', y);
    y = addParagraph(doc, val('monitoringPlan') || '[Not provided]', y);
  }

  y = addHeading(doc, '9. Budget Summary', y);
  y = addTable(doc, ['Item', 'Amount'], budgetItems.length ? budgetItems.map(i => [i.label, fmtN(i.amount)]).concat([['Total', fmtN(budgetTotal)]]) : [['—', '—']], y, [340, 155]);

  y = addHeading(doc, '10. Sustainability Plan', y);
  y = addParagraph(doc, val('sustainabilityPlan') || '[Not provided]', y);

  y = addHeading(doc, '11. Funding Request', y);
  y = addParagraph(doc, `Amount requested: ${fmtN(getAmountRequested())}`, y);

  return doc;
}

function buildBudgetPdf() {
  const doc = newDoc();
  const orgName = val('orgName') || '[Organization / business name]';
  const budgetItems = getBudgetItems();
  const budgetTotal = totalBudget();

  let y = addTitle(doc, 'Grant Budget', orgName);
  y = addHeading(doc, 'Itemized Budget', y);
  y = addTable(doc, ['Item', 'Amount'], budgetItems.length ? budgetItems.map(i => [i.label, fmtN(i.amount)]).concat([['Total', fmtN(budgetTotal)]]) : [['—', '—']], y, [340, 155]);
  y = addHeading(doc, 'Amount Requested', y);
  y = addParagraph(doc, fmtN(getAmountRequested()), y);

  return doc;
}

document.getElementById('downloadProposalBtn').addEventListener('click', () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  try {
    buildProposalPdf().save('grant-application.pdf');
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('downloadBudgetBtn').addEventListener('click', () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  try {
    buildBudgetPdf().save('grant-budget.pdf');
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  if (!hasAccess) { showMsg('Unlock this tool first — see the card on the right.', 'error'); return; }
  try {
    const doc = buildProposalPdf();
    const blob = doc.output('blob');
    const file = new File([blob], 'grant-application.pdf', { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: 'My grant application, made with KoboDocs.' });
    } else {
      doc.save('grant-application.pdf');
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
    await KoboSubscribe.start('init-tool-pass-payment', { tool_key: 'grant_application_generator', callback_path: '/grant-application-generator/' });
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
    document.getElementById('gpContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
    return;
  }

  try {
    const res = await fetch('https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1/check-tool-pass-access', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_key: 'grant_application_generator' })
    });
    const data = await res.json();
    hasAccess = !!data.allowed;
  } catch {
    hasAccess = false;
  }

  if (hasAccess) {
    document.getElementById('gpContent').classList.remove('locked');
    document.getElementById('lockOverlay').classList.remove('show');
  } else {
    document.getElementById('gpContent').classList.add('locked');
    document.getElementById('lockOverlay').classList.add('show');
  }
}

checkAccess();
KoboSubscribe.resumePendingIfAny().then(() => setTimeout(checkAccess, 500));
