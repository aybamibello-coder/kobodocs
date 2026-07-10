const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let members = []; // { id, name, paid }
let nextId = 0;

function addMember(name = '') {
  const id = nextId++;
  members.push({ id, name, paid: false });
  renderForm();
  renderPreview();
}

function removeMember(id) {
  members = members.filter(m => m.id !== id);
  renderForm();
  renderPreview();
}

function moveMember(id, dir) {
  const idx = members.findIndex(m => m.id === id);
  const swapWith = idx + dir;
  if (swapWith < 0 || swapWith >= members.length) return;
  [members[idx], members[swapWith]] = [members[swapWith], members[idx]];
  renderForm();
  renderPreview();
}

function renderForm() {
  const container = document.getElementById('memberRows');
  container.innerHTML = '';
  members.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `
      <span class="order-num">${i + 1}</span>
      <input type="text" class="member-name" placeholder="Member name" value="${m.name}">
      <label class="paid-toggle"><input type="checkbox" class="member-paid" ${m.paid ? 'checked' : ''}> Paid</label>
      <button type="button" class="reorder-btn" data-dir="-1" ${i === 0 ? 'disabled style="opacity:.3;"' : ''}>↑</button>
      <button type="button" class="reorder-btn" data-dir="1" ${i === members.length - 1 ? 'disabled style="opacity:.3;"' : ''}>↓</button>
      <button type="button" class="item-remove">&times;</button>
    `;
    row.querySelector('.member-name').addEventListener('input', (e) => { m.name = e.target.value; renderPreview(); });
    row.querySelector('.member-paid').addEventListener('change', (e) => { m.paid = e.target.checked; renderPreview(); });
    row.querySelectorAll('.reorder-btn').forEach(btn => btn.addEventListener('click', () => moveMember(m.id, parseInt(btn.dataset.dir, 10))));
    row.querySelector('.item-remove').addEventListener('click', () => removeMember(m.id));
    container.appendChild(row);
  });
}

function renderPreview() {
  const circleName = document.getElementById('circleName').value || 'Circle name';
  const contribution = parseFloat(document.getElementById('contribution').value) || 0;
  const frequency = document.getElementById('frequency').value;

  document.getElementById('pCircleName').textContent = circleName;
  document.getElementById('pCycleInfo').textContent = `${frequency} · ${members.length} member${members.length === 1 ? '' : 's'}`;

  const pot = contribution * members.length;
  document.getElementById('pPotInfo').innerHTML = `Pot per cycle<br><span style="font-size:1.1rem; color:var(--stamp-red);">${naira(pot)}</span>`;

  const nextCollector = members.find(m => !m.paid);

  if (window.KoboStorage) KoboStorage.save('ajo', collectFormState());

  document.getElementById('pMemberList').innerHTML = members.map((m, i) => `
    <li>
      <div class="member-info">
        <strong>${m.name || `Member ${i + 1}`}</strong>
        <span>${naira(contribution)} per cycle</span>
      </div>
      <span class="ajo-tag ${nextCollector && m.id === nextCollector.id ? 'next' : ''}">
        ${m.paid ? 'Paid' : (nextCollector && m.id === nextCollector.id ? 'Collects next' : 'Pending')}
      </span>
    </li>
  `).join('') || '<li style="opacity:0.5;">Add members to build the rotation</li>';

  return { circleName, contribution, frequency, members: [...members], pot, nextCollector };
}

function collectFormState() {
  return {
    circleName: document.getElementById('circleName').value,
    contribution: document.getElementById('contribution').value,
    frequency: document.getElementById('frequency').value,
    members: members.map(m => ({ name: m.name, paid: m.paid }))
  };
}

document.getElementById('circleName').addEventListener('input', renderPreview);
document.getElementById('contribution').addEventListener('input', renderPreview);
document.getElementById('frequency').addEventListener('change', renderPreview);
document.getElementById('addMemberBtn').addEventListener('click', () => addMember());

document.getElementById('clearFormBtn').addEventListener('click', () => {
  if (!confirm('Clear this circle? This only affects this device.')) return;
  KoboStorage.clear('ajo');
  document.getElementById('circleName').value = '';
  document.getElementById('contribution').value = 20000;
  document.getElementById('frequency').value = 'Monthly';
  members = [];
  nextId = 0;
  renderForm();
  renderPreview();
});

const saved = window.KoboStorage ? KoboStorage.load('ajo') : null;
if (saved) {
  document.getElementById('circleName').value = saved.circleName || '';
  document.getElementById('contribution').value = saved.contribution ?? 20000;
  document.getElementById('frequency').value = saved.frequency || 'Monthly';
  members = [];
  nextId = 0;
  (saved.members || []).forEach(m => { members.push({ id: nextId++, name: m.name, paid: !!m.paid }); });
  if (!members.length) { addMember(); }
  renderForm();
  renderPreview();
} else {
  addMember('Adaeze O.');
  addMember('Chinedu K.');
  addMember('Funmi A.');
  addMember('Segun T.');
  members[0].paid = true;
  members[1].paid = true;
  renderForm();
  renderPreview();
}

document.getElementById('downloadBtn').addEventListener('click', () => {
  const d = renderPreview();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 48; let y = 60;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(d.circleName, left, y); y += 20;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
  doc.text(`${d.frequency} contributions of ${naira(d.contribution)} · Pot per cycle: ${naira(d.pot)}`, left, y); y += 24;

  doc.setTextColor(20); doc.setDrawColor(20); doc.line(left, y, 547, y); y += 20;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('#', left, y); doc.text('Member', left + 24, y); doc.text('Status', 500, y, { align: 'right' });
  y += 6; doc.line(left, y, 547, y); y += 16;

  doc.setFont('helvetica', 'normal');
  d.members.forEach((m, i) => {
    const status = m.paid ? 'Paid' : (d.nextCollector && m.id === d.nextCollector.id ? 'Collects next' : 'Pending');
    doc.text(String(i + 1), left, y);
    doc.text(m.name || `Member ${i + 1}`, left + 24, y);
    doc.text(status, 500, y, { align: 'right' });
    y += 20;
  });

  y += 20; doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(120);
  doc.text('This is a contribution record only. KoboDocs does not hold or move money on behalf of this circle.', left, y, { maxWidth: 499 });

  doc.save(`ajo-${d.circleName.replace(/\s+/g, '-') || 'circle'}.pdf`);
});

document.getElementById('waBtn').addEventListener('click', () => {
  const d = renderPreview();
  const lines = [
    `*${d.circleName} — ${d.frequency} update*`,
    `Contribution: ${naira(d.contribution)} per member`,
    `Pot this cycle: ${naira(d.pot)}`,
    '',
    ...d.members.map((m, i) => {
      const status = m.paid ? 'Paid ✓' : (d.nextCollector && m.id === d.nextCollector.id ? 'Collects next' : 'Pending');
      return `${i + 1}. ${m.name || `Member ${i + 1}`} — ${status}`;
    })
  ];
  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
});
