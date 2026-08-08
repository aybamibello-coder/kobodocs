let currentType = 'igbo';
let isPro = false;
let rowId = 0;

const TRADITIONS = {
  igbo: [
    { name: 'Kola nuts (Oji)', value: '2 baskets' },
    { name: 'Palm wine', value: '4 jars' },
    { name: 'Bag(s) of rice', value: '2 bags' },
    { name: 'Bag(s) of garri', value: '1 bag' },
    { name: 'Crates of assorted drinks', value: '5 crates' },
    { name: 'Goat(s)', value: '1' },
    { name: 'Bride price', value: '₦50,000' },
    { name: 'Isi ego (respect money to father)', value: '₦20,000' },
    { name: "Thank-you money to mother", value: '₦20,000' },
    { name: 'Umbrella / walking stick for father', value: '1' },
    { name: 'Aso-ebi / clothing money', value: '₦30,000' }
  ],
  yoruba: [
    { name: 'Holy Book (Bible/Quran)', value: '1' },
    { name: 'Kola nuts, bitter kola & alligator pepper', value: 'Set' },
    { name: 'Honey', value: '1 bottle' },
    { name: 'Sugar cane', value: '2 sticks' },
    { name: 'Basket of fruits', value: '1' },
    { name: 'Yams/tubers', value: '4' },
    { name: 'Bride price (symbolic)', value: '₦50,000' },
    { name: "Owo ijoko iya (mother's sitting fee)", value: '₦20,000' },
    { name: "Head tie for bride's mother", value: '1' },
    { name: 'Suitcase of clothes/shoes for bride', value: '1' }
  ],
  custom: []
};

function addListRow(name = '', value = '', checked = true) {
  rowId++;
  const row = document.createElement('div');
  row.className = 'list-row' + (checked ? '' : ' excluded');
  row.dataset.id = rowId;
  row.innerHTML = `
    <input type="checkbox" class="row-check" ${checked ? 'checked' : ''}>
    <input type="text" class="row-name" placeholder="Item" value="${name}">
    <input type="text" class="row-value" placeholder="Qty / Amount" value="${value}">
    <button type="button" class="item-remove" aria-label="Remove">&times;</button>
  `;
  document.getElementById('listRows').appendChild(row);
  row.querySelectorAll('input[type=text]').forEach(inp => inp.addEventListener('input', renderPreview));
  row.querySelector('.row-check').addEventListener('change', (e) => {
    row.classList.toggle('excluded', !e.target.checked);
    renderPreview();
  });
  row.querySelector('.item-remove').addEventListener('click', () => { row.remove(); renderPreview(); });
}

function loadTradition(type) {
  document.getElementById('listRows').innerHTML = '';
  const items = TRADITIONS[type];
  if (!items.length) {
    addListRow();
  } else {
    items.forEach(it => addListRow(it.name, it.value));
  }
  renderPreview();
}

document.getElementById('typeTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  currentType = btn.dataset.type;
  document.querySelectorAll('#typeTabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadTradition(currentType);
});

document.getElementById('addItemBtn').addEventListener('click', () => { addListRow(); renderPreview(); });

function getIncludedItems() {
  return [...document.querySelectorAll('.list-row')]
    .filter(row => row.querySelector('.row-check').checked)
    .map(row => ({
      name: row.querySelector('.row-name').value || 'Item',
      value: row.querySelector('.row-value').value || ''
    }));
}

function renderPreview() {
  const groomName = document.getElementById('groomName').value.trim() || "Groom's name";
  const brideName = document.getElementById('brideName').value.trim() || "Bride's name";
  const groomFamily = document.getElementById('groomFamily').value.trim();
  const brideFamily = document.getElementById('brideFamily').value.trim();

  document.getElementById('pTitle').textContent = `${groomName} & ${brideName} — Traditional Wedding List`;
  document.getElementById('pFamilies').textContent = [groomFamily, brideFamily].filter(Boolean).join(' · ') || "Groom's family & Bride's family";

  const items = getIncludedItems();
  document.getElementById('pItemsBody').innerHTML = items.map(it => `
    <tr><td>${it.name}</td><td class="num">${it.value}</td></tr>
  `).join('');

  document.getElementById('pTotals').innerHTML = `<div class="row"><span>Total items</span><span>${items.length}</span></div>`;

  return { groomName, brideName, groomFamily, brideFamily, items };
}

document.querySelectorAll('.form-panel input[type=text]').forEach(el => el.addEventListener('input', renderPreview));
loadTradition('igbo');

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

function buildListPdf(data) {
  const rows = data.items.map(it => [it.name, it.value]);
  return KoboExport.buildTablePdf({
    style: 'branded',
    docLabel: 'Wedding List',
    businessName: `${data.groomName} & ${data.brideName}`,
    businessSub: [data.groomFamily, data.brideFamily].filter(Boolean).join(' · '),
    columns: ['Item', 'Qty / Amount'],
    rightAlignCols: [1],
    rows,
    watermark: !isPro
  });
}

document.getElementById('downloadPdfBtn').addEventListener('click', async () => {
  const data = renderPreview();
  try {
    const doc = await buildListPdf(data);
    KoboExport.download(`wedding-list-${data.groomName.replace(/\s+/g, '-')}.pdf`, doc);
  } catch (err) {
    showMsg('Could not generate PDF: ' + err.message, 'error');
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  const data = renderPreview();
  const btn = document.getElementById('waBtn');
  const original = btn.textContent;
  try {
    const doc = await buildListPdf(data);
    await KoboExport.shareWhatsApp(`wedding-list-${data.groomName.replace(/\s+/g, '-')}.pdf`, `Traditional wedding list for ${data.groomName} & ${data.brideName}, made with KoboDocs.`, doc);
  } catch (err) {
    if (err.name !== 'AbortError') showMsg('Could not prepare the PDF: ' + err.message, 'error');
  } finally {
    btn.textContent = original;
  }
});

document.getElementById('upgradeProBtn').addEventListener('click', async () => {
  const btn = document.getElementById('upgradeProBtn');
  const original = btn.textContent;
  btn.textContent = 'Redirecting…';
  try {
    await KoboSubscribe.start('init-payment', { billing_cycle: 'monthly' });
  } catch {
    btn.textContent = original;
  }
});

// ---------- Pro gating: watermark + accent color ----------
(async function checkPro() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const profile = await window.KoboAuth.getProfile();
  const active = profile && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date();
  isPro = !!(profile && active && (profile.plan === 'pro' || profile.plan === 'business'));

  if (!isPro) return;

  document.getElementById('pWatermark').classList.add('hidden');
  document.getElementById('proLockBanner').style.display = 'none';
  if (profile.brand_color) {
    document.getElementById('docPreview').style.setProperty('--stamp-gold', profile.brand_color);
  }
})();
