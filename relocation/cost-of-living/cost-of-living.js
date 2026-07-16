const naira = (n) => '₦' + (Math.round(Number(n) || 0)).toLocaleString('en-NG');

// City cost data now lives in /assets/relocation-data.js — the single source
// of truth shared by all 3 relocation calculators. Edit figures there only.
const CITIES = RelocationData.costOfLiving.destinations;
const LIFESTYLE_MULT = RelocationData.costOfLiving.LIFESTYLE_MULT;
const rentTierFor = RelocationData.costOfLiving.rentTierFor;

let japaPassActive = false;

function describeAccessDenial(status) {
  if (status.reason === 'limit_reached') {
    return `You've used all ${status.reportLimit} report exports on your ${status.tier === 'agency' ? 'Agency' : ''} Japa Pass. Get another pass to keep exporting.`;
  }
  return 'Get the Japa Pass to unlock full reports, PDF and WhatsApp export.';
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

  const status = await RelocationAccess.getStatus();
  japaPassActive = !!status.active && status.remaining > 0;
  renderPreview();
})();

document.getElementById('downloadBtn').addEventListener('click', async () => {
  const btn = document.getElementById('downloadBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Checking access…';
  btn.disabled = true;

  const status = await RelocationAccess.checkAndConsume();
  if (!status.allowed) {
    alert(describeAccessDenial(status));
    window.location.href = '/pricing/#relocation-pricing';
    btn.textContent = originalText;
    btn.disabled = false;
    return;
  }

  const { city } = renderPreview();
  btn.textContent = 'Preparing PDF…';
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
  const btn = document.getElementById('waBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Checking access…';
  btn.disabled = true;

  const status = await RelocationAccess.checkAndConsume();
  if (!status.allowed) {
    alert(describeAccessDenial(status));
    window.location.href = '/pricing/#relocation-pricing';
    btn.textContent = originalText;
    btn.disabled = false;
    return;
  }

  const { dest, city, monthlyTotal, totalPeople } = renderPreview();
  btn.textContent = 'Preparing image…';

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
