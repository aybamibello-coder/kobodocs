const naira = (n) => '₦' + (Math.round(Number(n) || 0)).toLocaleString('en-NG');

// City cost data now lives in /assets/relocation-data.js — the single source
// of truth shared by all 3 relocation calculators. Edit figures there only.
const CITIES = RelocationData.costOfLiving.destinations;
const LIFESTYLE_MULT = RelocationData.costOfLiving.LIFESTYLE_MULT;
const rentTierFor = RelocationData.costOfLiving.rentTierFor;

let japaPassActive = false;

async function checkJapaPassActive() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });
  const session = await window.KoboAuth.getSession();
  if (!session) return false;
  const profile = await window.KoboAuth.getProfile();
  if (!profile || !profile.relocation_pass_expires_at) return false;
  return new Date(profile.relocation_pass_expires_at) > new Date();
}

function populateCityOptions() {
  const dest = CITIES[document.getElementById('destination').value];
  const citySelect = document.getElementById('city');
  const prevValue = citySelect.value;
  citySelect.innerHTML = Object.entries(dest.cities)
    .map(([key, c]) => `<option value="${key}">${c.label}</option>`).join('');
  if (dest.cities[prevValue]) citySelect.value = prevValue;
}

function currentCity() {
  const dest = CITIES[document.getElementById('destination').value];
  const city = dest.cities[document.getElementById('city').value] || Object.values(dest.cities)[0];
  return { dest, city };
}

function renderPreview() {
  const { dest, city } = currentCity();
  const adults = Math.max(0, parseInt(document.getElementById('adultsCount').value) || 0);
  const children = Math.max(0, parseInt(document.getElementById('childrenCount').value) || 0);
  const tier = document.getElementById('lifestyleTier').value;
  const mult = LIFESTYLE_MULT[tier] || 1;
  const totalPeople = 1 + adults + children;
  const extraAdults = adults; // additional adults beyond the principal applicant

  document.getElementById('pCity').textContent = city.label;
  document.getElementById('pDestination').textContent = dest.label;
  document.getElementById('pFamily').textContent = `${totalPeople} person${totalPeople > 1 ? 's' : ''}`;
  document.getElementById('pVerified').textContent = `Verified ${RelocationData.LAST_VERIFIED}`;

  const rent = city.rentBySize[rentTierFor(totalPeople)];
  const groceries = (city.groceries + city.groceries * 0.7 * extraAdults + city.groceries * 0.4 * children) * mult;
  const transport = (city.transport * (1 + extraAdults)) * mult; // children usually ride free/reduced
  const utilitiesPhone = (city.utilitiesPhone * (1 + 0.15 * (extraAdults + children))) * mult;
  const misc = (city.misc + city.misc * 0.6 * extraAdults + city.misc * 0.3 * children) * mult;

  const monthlyTotal = rent + groceries + transport + utilitiesPhone + misc;
  const landingSetup = city.setupAllowance * mult;
  const securityDeposit = rent; // typical one month's rent as a deposit
  const landingTotal = monthlyTotal * 3 + securityDeposit + landingSetup;

  document.getElementById('pHeadline').innerHTML = `
    <div class="row grand"><span>Estimated monthly cost</span><span>${naira(monthlyTotal)}</span></div>
  `;

  const gate = document.getElementById('reportGate');
  if (japaPassActive) {
    gate.classList.remove('locked');
    const rows = [
      ['Rent', rent], ['Groceries', groceries], ['Transport', transport],
      ['Utilities &amp; phone', utilitiesPhone], ['Eating out &amp; misc', misc]
    ];
    document.getElementById('pBreakdown').innerHTML = rows
      .map(([label, amount]) => `<tr><td>${label}</td><td class="num">${naira(amount)}</td></tr>`).join('');
    document.getElementById('pTotals').innerHTML = `<div class="row grand"><span>Monthly total</span><span>${naira(monthlyTotal)}</span></div>`;

    const landingRows = [
      ['3 months of living costs', monthlyTotal * 3],
      ['Security deposit (≈1 month rent)', securityDeposit],
      ['Setup &amp; furnishing allowance', landingSetup]
    ];
    document.getElementById('pLandingBreakdown').innerHTML = landingRows
      .map(([label, amount]) => `<tr><td>${label}</td><td class="num">${naira(amount)}</td></tr>`).join('');
    document.getElementById('pLandingTotals').innerHTML = `<div class="row grand"><span>Landing budget total</span><span>${naira(landingTotal)}</span></div>`;
    document.getElementById('pFxNote').textContent = `Figures verified ${RelocationData.LAST_VERIFIED} — rents especially can shift year to year, so re-check closer to your move date.`;
  } else {
    gate.classList.add('locked');
    document.getElementById('pBreakdown').innerHTML = ['Rent', 'Groceries', 'Transport', 'Utilities & phone', 'Eating out & misc']
      .map(() => `<tr><td>••••••••••••</td><td class="num">••••••</td></tr>`).join('');
    document.getElementById('pTotals').innerHTML = `<div class="row grand"><span>Monthly total</span><span>••••••</span></div>`;
    document.getElementById('pLandingBreakdown').innerHTML = ['', '', '']
      .map(() => `<tr><td>••••••••••••</td><td class="num">••••••</td></tr>`).join('');
    document.getElementById('pLandingTotals').innerHTML = `<div class="row grand"><span>Landing budget total</span><span>••••••</span></div>`;
    document.getElementById('pFxNote').textContent = '';
  }

  if (window.KoboStorage) {
    KoboStorage.save('cost-of-living', {
      destination: document.getElementById('destination').value,
      city: document.getElementById('city').value,
      adultsCount: adults,
      childrenCount: children,
      lifestyleTier: tier
    });
  }

  return { dest, city, monthlyTotal, landingTotal, totalPeople };
}

function applyFormState(state) {
  document.getElementById('destination').value = state.destination || 'canada';
  populateCityOptions();
  document.getElementById('city').value = state.city || Object.keys(CITIES[document.getElementById('destination').value].cities)[0];
  document.getElementById('adultsCount').value = state.adultsCount ?? 0;
  document.getElementById('childrenCount').value = state.childrenCount ?? 0;
  document.getElementById('lifestyleTier').value = state.lifestyleTier || 'comfortable';
}

document.getElementById('destination').addEventListener('change', () => { populateCityOptions(); renderPreview(); });
['city', 'adultsCount', 'childrenCount', 'lifestyleTier'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderPreview);
  document.getElementById(id).addEventListener('change', renderPreview);
});

document.getElementById('clearFormBtn').addEventListener('click', () => {
  if (!confirm('Clear this form? This only affects this device.')) return;
  KoboStorage.clear('cost-of-living');
  applyFormState({});
  renderPreview();
});

(async function init() {
  const saved = window.KoboStorage ? KoboStorage.load('cost-of-living') : null;
  applyFormState(saved || {});
  renderPreview();

  japaPassActive = await checkJapaPassActive();
  renderPreview();
})();

document.getElementById('downloadBtn').addEventListener('click', async () => {
  if (!japaPassActive) { window.location.href = '/pricing/#relocation-pricing'; return; }
  const { city } = renderPreview();
  const btn = document.getElementById('downloadBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Preparing PDF…';
  btn.disabled = true;
  try {
    await KoboExport.downloadPdf(`cost-of-living-${city.label.replace(/\s+/g, '-')}.pdf`);
  } catch (err) {
    alert('Could not generate PDF: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  if (!japaPassActive) { window.location.href = '/pricing/#relocation-pricing'; return; }
  const { dest, city, monthlyTotal, totalPeople } = renderPreview();
  const btn = document.getElementById('waBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Preparing image…';
  btn.disabled = true;

  const caption = [
    `*Cost of Living — ${city.label}, ${dest.label}*`,
    `${totalPeople} person${totalPeople > 1 ? 's' : ''}`,
    `Estimated monthly cost: *${naira(monthlyTotal)}*`
  ].join('\n');

  try {
    const result = await KoboExport.shareWhatsApp(`cost-of-living-${city.label.replace(/\s+/g, '-')}.png`, caption);
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
