const naira = (n) => '₦' + (Math.round(Number(n) || 0)).toLocaleString('en-NG');

// ---------- Cost data (NGN, pre-converted at an approximate FX rate) ----------
// Figures sourced from IRCC and UK Home Office official fee schedules, verified
// July 2026. Immigration fees change without much notice — always confirm the
// current figure on the official site before paying anything.
const DESTINATIONS = {
  canada: {
    label: 'Canada',
    asOf: 'IRCC fees as of the April 2026 increase, verified July 2026. ~₦1,000 per CAD.',
    routes: {
      express_entry: {
        label: 'Express Entry (Permanent Residence)',
        perAdult: {
          'IRCC processing fee': 990000,
          'Right of Permanent Residence Fee': 600000,
          'Biometrics': 85000,
          'Language test (IELTS/CELPIP)': 320000,
          'Educational Credential Assessment': 340000,
          'Medical exam': 200000
        },
        perChild: { 'IRCC processing fee': 270000, 'Biometrics': 85000 },
        settlingBuffer: 2500000,
        defaultFlight: 1100000
      },
      work_permit: {
        label: 'Work Permit (temporary)',
        perAdult: { 'Work permit application': 155000, 'Biometrics': 85000 },
        perChild: { 'Work permit application (accompanying)': 155000, 'Biometrics': 85000 },
        settlingBuffer: 2000000,
        defaultFlight: 1100000
      },
      study_permit: {
        label: 'Study Permit',
        perAdult: { 'Study permit application': 150000, 'Biometrics': 85000 },
        perChild: { 'Study permit application (accompanying)': 150000, 'Biometrics': 85000 },
        settlingBuffer: 2200000,
        defaultFlight: 1100000
      }
    }
  },
  uk: {
    label: 'United Kingdom',
    asOf: 'UK Home Office fees as of the April 2026 increase, verified July 2026. ~₦1,860 per GBP.',
    routes: {
      skilled_worker: {
        label: 'Skilled Worker visa (3-year, outside UK)',
        perAdult: {
          'Visa application fee': 1523000,
          'Immigration Health Surcharge (3 yrs)': 5775000,
          'English test (IELTS)': 335000
        },
        perChild: { 'Visa application fee': 1523000, 'Immigration Health Surcharge (3 yrs)': 5775000 },
        settlingBuffer: 2790000,
        defaultFlight: 850000
      },
      student: {
        label: 'Student visa (1-year course)',
        perAdult: {
          'Visa application fee': 911000,
          'Immigration Health Surcharge (1 yr)': 1443000,
          'English test (IELTS)': 335000
        },
        perChild: { 'Visa application fee (dependent)': 911000, 'Immigration Health Surcharge (1 yr)': 1443000 },
        settlingBuffer: 2418000,
        defaultFlight: 850000
      }
    }
  },
  other: {
    label: 'Other / not sure yet',
    asOf: 'Generic global average, not destination-specific — more countries coming soon. ~₦1,380 per USD.',
    routes: {
      general: {
        label: 'General relocation (visa + settling)',
        perAdult: {
          'Visa/application fees (est.)': 552000,
          'Biometrics/medical (est.)': 207000,
          'English test (est.)': 304000
        },
        perChild: { 'Visa/application fees (est.)': 276000 },
        settlingBuffer: 2480000,
        defaultFlight: 950000
      }
    }
  }
};

// ---------- Japa Pass entitlement check ----------
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

// ---------- Form <-> data ----------
function populateRouteOptions() {
  const dest = DESTINATIONS[document.getElementById('destination').value];
  const routeSelect = document.getElementById('visaRoute');
  const prevValue = routeSelect.value;
  routeSelect.innerHTML = Object.entries(dest.routes)
    .map(([key, r]) => `<option value="${key}">${r.label}</option>`).join('');
  if (dest.routes[prevValue]) routeSelect.value = prevValue;
}

function currentRoute() {
  const dest = DESTINATIONS[document.getElementById('destination').value];
  const route = dest.routes[document.getElementById('visaRoute').value] || Object.values(dest.routes)[0];
  return { dest, route };
}

function updateDefaultFlight() {
  const { route } = currentRoute();
  document.getElementById('flightCost').value = route.defaultFlight;
}

function renderPreview() {
  const { dest, route } = currentRoute();
  const adults = Math.max(0, parseInt(document.getElementById('adultsCount').value) || 0);
  const children = Math.max(0, parseInt(document.getElementById('childrenCount').value) || 0);
  const flightPerPerson = parseFloat(document.getElementById('flightCost').value) || 0;
  const agencyFee = parseFloat(document.getElementById('agencyFee').value) || 0;
  const monthlySavings = parseFloat(document.getElementById('monthlySavings').value) || 0;
  const totalTravelers = 1 + adults + children;

  document.getElementById('pDestination').textContent = dest.label;
  document.getElementById('pRoute').textContent = route.label;
  document.getElementById('pFamily').textContent = `${totalTravelers} traveler${totalTravelers > 1 ? 's' : ''}`;

  // Line items: principal applicant + each accompanying adult use perAdult rates,
  // each accompanying child uses perChild rates.
  const lineItems = [];
  const adultTravelers = 1 + adults; // principal applicant counts as an adult
  Object.entries(route.perAdult).forEach(([label, amount]) => {
    lineItems.push({ label: `${label} (×${adultTravelers} adult${adultTravelers > 1 ? 's' : ''})`, amount: amount * adultTravelers });
  });
  if (children > 0) {
    Object.entries(route.perChild).forEach(([label, amount]) => {
      lineItems.push({ label: `${label} (×${children} child${children > 1 ? 'ren' : ''})`, amount: amount * children });
    });
  }
  lineItems.push({ label: `Flights (×${totalTravelers})`, amount: flightPerPerson * totalTravelers });
  lineItems.push({ label: 'Settling-in buffer (first month + essentials)', amount: route.settlingBuffer });
  if (agencyFee > 0) lineItems.push({ label: 'Agency / consultant fee', amount: agencyFee });

  const grandTotal = lineItems.reduce((s, r) => s + r.amount, 0);

  // Headline is always visible — this is the free-tier value.
  document.getElementById('pHeadline').innerHTML = `
    <div class="row grand"><span>Estimated total cost</span><span>${naira(grandTotal)}</span></div>
  `;

  const gate = document.getElementById('reportGate');
  if (japaPassActive) {
    gate.classList.remove('locked');
    document.getElementById('pBreakdown').innerHTML = lineItems
      .map(r => `<tr><td>${r.label}</td><td class="num">${naira(r.amount)}</td></tr>`).join('');
    document.getElementById('pTotals').innerHTML = `
      <div class="row grand"><span>Total</span><span>${naira(grandTotal)}</span></div>
    `;
    let savingsNote = dest.asOf;
    if (monthlySavings > 0) {
      const months = Math.ceil(grandTotal / monthlySavings);
      savingsNote = `Saving ${naira(monthlySavings)}/month, you'd reach this total in about ${months} month${months > 1 ? 's' : ''}. ${dest.asOf}`;
    }
    document.getElementById('pSavingsNote').textContent = savingsNote;
  } else {
    gate.classList.add('locked');
    // Masked placeholder rows — no real figures reach the DOM while locked,
    // so there's nothing sensitive to reveal even if the blur is bypassed.
    document.getElementById('pBreakdown').innerHTML = lineItems
      .map(r => `<tr><td>••••••••••••</td><td class="num">••••••</td></tr>`).join('');
    document.getElementById('pTotals').innerHTML = `<div class="row grand"><span>Total</span><span>••••••</span></div>`;
    document.getElementById('pSavingsNote').textContent = '';
  }

  if (window.KoboStorage) {
    KoboStorage.save('japa-calculator', {
      destination: document.getElementById('destination').value,
      visaRoute: document.getElementById('visaRoute').value,
      adultsCount: adults,
      childrenCount: children,
      flightCost: flightPerPerson,
      agencyFee,
      monthlySavings
    });
  }

  return { dest, route, grandTotal, totalTravelers };
}

function applyFormState(state) {
  document.getElementById('destination').value = state.destination || 'canada';
  populateRouteOptions();
  document.getElementById('visaRoute').value = state.visaRoute || Object.keys(DESTINATIONS[document.getElementById('destination').value].routes)[0];
  document.getElementById('adultsCount').value = state.adultsCount ?? 0;
  document.getElementById('childrenCount').value = state.childrenCount ?? 0;
  document.getElementById('flightCost').value = state.flightCost ?? currentRoute().route.defaultFlight;
  document.getElementById('agencyFee').value = state.agencyFee ?? 0;
  document.getElementById('monthlySavings').value = state.monthlySavings ?? '';
}

document.getElementById('destination').addEventListener('change', () => {
  populateRouteOptions();
  updateDefaultFlight();
  renderPreview();
});
document.getElementById('visaRoute').addEventListener('change', () => {
  updateDefaultFlight();
  renderPreview();
});
['adultsCount', 'childrenCount', 'flightCost', 'agencyFee', 'monthlySavings'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderPreview);
});

document.getElementById('clearFormBtn').addEventListener('click', () => {
  if (!confirm('Clear this form? This only affects this device.')) return;
  KoboStorage.clear('japa-calculator');
  applyFormState({});
  renderPreview();
});

// ---------- Init ----------
(async function init() {
  const saved = window.KoboStorage ? KoboStorage.load('japa-calculator') : null;
  applyFormState(saved || {});
  renderPreview(); // show a value immediately, then upgrade once entitlement resolves

  japaPassActive = await checkJapaPassActive();
  renderPreview();
})();

// ---------- Export ----------
document.getElementById('downloadBtn').addEventListener('click', async () => {
  if (!japaPassActive) {
    window.location.href = '/pricing/#relocation-pricing';
    return;
  }
  const { dest } = renderPreview();
  const btn = document.getElementById('downloadBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Preparing PDF…';
  btn.disabled = true;
  try {
    await KoboExport.downloadPdf(`japa-cost-${dest.label.replace(/\s+/g, '-')}.pdf`);
  } catch (err) {
    alert('Could not generate PDF: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  if (!japaPassActive) {
    window.location.href = '/pricing/#relocation-pricing';
    return;
  }
  const { dest, route, grandTotal, totalTravelers } = renderPreview();
  const btn = document.getElementById('waBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Preparing image…';
  btn.disabled = true;

  const caption = [
    `*Japa Cost Estimate — ${dest.label}*`,
    `${route.label}`,
    `${totalTravelers} traveler${totalTravelers > 1 ? 's' : ''}`,
    `Estimated total: *${naira(grandTotal)}*`
  ].join('\n');

  try {
    const result = await KoboExport.shareWhatsApp(`japa-cost-${dest.label.replace(/\s+/g, '-')}.png`, caption);
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
