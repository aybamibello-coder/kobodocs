// ---------- CAC Business Name Registration Assistant ----------
function val(id) { return document.getElementById(id).value.trim(); }

let proprietorId = 0;

function addProprietorBlock(prefill) {
  proprietorId++;
  const id = proprietorId;
  const wrap = document.createElement('div');
  wrap.className = 'proprietor-block';
  wrap.dataset.id = id;
  wrap.innerHTML = `
    ${id > 1 ? '<button type="button" class="remove-proprietor" aria-label="Remove proprietor">&times;</button>' : ''}
    <div class="field-group"><label>Full name</label><input type="text" class="p-name" placeholder="Adaeze Chioma Okafor"></div>
    <div class="field-row">
      <div class="field-group"><label>Date of birth</label><input type="date" class="p-dob"></div>
      <div class="field-group"><label>Phone number</label><input type="text" class="p-phone" placeholder="0803 000 0000"></div>
    </div>
    <div class="field-group"><label>Residential address</label><input type="text" class="p-address" placeholder="No. 4 Adeyemi Street, Surulere, Lagos"></div>
    <div class="field-row">
      <div class="field-group"><label>Email</label><input type="text" class="p-email" placeholder="adaeze@email.com"></div>
      <div class="field-group"><label>ID type</label>
        <select class="p-idtype">
          <option>NIN</option>
          <option>International Passport</option>
          <option>Driver's License</option>
          <option>Voter's Card</option>
        </select>
      </div>
    </div>
    <div class="field-group"><label>ID number</label><input type="text" class="p-idnumber" placeholder="e.g. 12345678901"></div>
  `;
  document.getElementById('proprietorsWrap').appendChild(wrap);
  wrap.querySelectorAll('input, select').forEach(el => el.addEventListener('input', renderPreview));
  const removeBtn = wrap.querySelector('.remove-proprietor');
  if (removeBtn) removeBtn.addEventListener('click', () => { wrap.remove(); renderPreview(); });
  renderPreview();
}

document.getElementById('addProprietorBtn').addEventListener('click', () => addProprietorBlock());
addProprietorBlock();

function getProprietors() {
  return [...document.querySelectorAll('.proprietor-block')].map(block => ({
    name: block.querySelector('.p-name').value.trim(),
    dob: block.querySelector('.p-dob').value,
    phone: block.querySelector('.p-phone').value.trim(),
    address: block.querySelector('.p-address').value.trim(),
    email: block.querySelector('.p-email').value.trim(),
    idType: block.querySelector('.p-idtype').value,
    idNumber: block.querySelector('.p-idnumber').value.trim()
  }));
}

function fmtDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '[date of birth]';
}

// ---------- PO Box inline warning ----------
document.getElementById('businessAddress').addEventListener('input', function () {
  const warn = document.getElementById('poBoxWarning');
  warn.classList.toggle('show', /\bp\.?\s*o\.?\s*box\b/i.test(this.value));
  renderPreview();
});

['propName1', 'propName2', 'natureOfBusiness'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderPreview);
});

function renderPreview() {
  document.getElementById('pDate').textContent = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const name1 = val('propName1') || '[Proposed name 1]';
  const name2 = val('propName2') || '[Proposed name 2]';
  const nature = val('natureOfBusiness') || '[Nature of business]';
  const address = val('businessAddress') || '[Business address]';
  const proprietors = getProprietors();

  const proprietorsHtml = proprietors.map((p, i) => `
    <p style="margin-top:10px;"><strong>Proprietor ${i + 1}:</strong> ${p.name || '[full name]'}<br>
    DOB: ${fmtDate(p.dob)} · Phone: ${p.phone || '[phone]'}<br>
    Address: ${p.address || '[residential address]'}<br>
    ${p.idType}: ${p.idNumber || '[ID number]'}</p>
  `).join('');

  document.getElementById('previewBody').innerHTML = `
    <p><strong>Proposed names:</strong><br>1. ${name1}<br>2. ${name2}</p>
    <p style="margin-top:10px;"><strong>Nature of business:</strong> ${nature}</p>
    <p style="margin-top:10px;"><strong>Business address:</strong> ${address}</p>
    ${proprietorsHtml}
  `;
}

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

function buildBriefPdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const m = 56;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  let y = m;

  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('BUSINESS NAME REGISTRATION BRIEF', pw / 2, y, { align: 'center' });
  y += 18;
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text('For reference while completing registration on the official CAC portal', pw / 2, y, { align: 'center' });
  doc.setTextColor(20);
  y += 30;

  function section(title) {
    if (y > ph - m - 40) { doc.addPage(); y = m; }
    doc.setFont('times', 'bold');
    doc.setFontSize(11.5);
    doc.text(title, m, y);
    y += 6;
    doc.setDrawColor(200);
    doc.line(m, y, pw - m, y);
    y += 18;
    doc.setFont('times', 'normal');
    doc.setFontSize(10.5);
  }

  function line(label, value) {
    if (y > ph - m) { doc.addPage(); y = m; }
    doc.setFont('times', 'bold');
    doc.text(label, m, y);
    doc.setFont('times', 'normal');
    const lines = doc.splitTextToSize(value || '', pw - m * 2 - 150);
    doc.text(lines, m + 150, y);
    y += 15 * Math.max(lines.length, 1) + 4;
  }

  section('Proposed Business Names');
  line('1st choice:', val('propName1') || '—');
  line('2nd choice:', val('propName2') || '—');
  y += 10;

  section('Nature of Business');
  const natureLines = doc.splitTextToSize(val('natureOfBusiness') || '—', pw - m * 2);
  natureLines.forEach(l => { doc.text(l, m, y); y += 15; });
  y += 10;

  section('Business Address');
  const addrLines = doc.splitTextToSize(val('businessAddress') || '—', pw - m * 2);
  addrLines.forEach(l => { doc.text(l, m, y); y += 15; });
  y += 10;

  getProprietors().forEach((p, i) => {
    section(`Proprietor ${i + 1}`);
    line('Full name:', p.name || '—');
    line('Date of birth:', fmtDate(p.dob));
    line('Phone number:', p.phone || '—');
    line('Email:', p.email || '—');
    line('Residential address:', p.address || '—');
    line('ID type:', p.idType);
    line('ID number:', p.idNumber || '—');
    y += 10;
  });

  return doc;
}

document.getElementById('downloadBriefBtn').addEventListener('click', () => {
  try {
    const doc = buildBriefPdf();
    KoboExport.download('cac-business-name-registration-brief.pdf', doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = buildBriefPdf();
    await KoboExport.shareWhatsApp('cac-business-name-registration-brief.pdf', 'CAC Business Name Registration Brief, made with KoboDocs.', doc);
  } catch (err) {
    if (err.name !== 'AbortError') showMsg('Could not prepare the PDF: ' + err.message, 'error');
  } finally {
    btn.textContent = original;
  }
});

renderPreview();
