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

document.getElementById('downloadBtn').addEventListener('click', async () => {
  const d = renderPreview();
  const btn = document.getElementById('downloadBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Preparing PDF…';
  btn.disabled = true;
  try {
    await KoboExport.downloadPdf(`ajo-${(d.circleName || 'circle').replace(/\s+/g, '-')}.pdf`);
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
    `*${d.circleName} — ${d.frequency} update*`,
    `Contribution: ${naira(d.contribution)} per member`,
    `Pot this cycle: ${naira(d.pot)}`
  ].join('\n');

  try {
    const result = await KoboExport.shareWhatsApp(
      `ajo-${(d.circleName || 'circle').replace(/\s+/g, '-')}.png`,
      caption
    );
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
  if (hasBranding) document.getElementById("pWatermark").classList.add("hidden");

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

