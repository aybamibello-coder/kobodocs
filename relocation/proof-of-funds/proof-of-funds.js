const naira = (n) => '₦' + (Math.round(Number(n) || 0)).toLocaleString('en-NG');

// ---------- Threshold data (NGN, pre-converted at an approximate FX rate) ----------
// Sources: IRCC settlement funds table and study permit financial requirements;
// UK Home Office maintenance requirements (Skilled Worker & Student routes).
// Verified July 2026 — these figures are reviewed and change periodically.
const FX = { CAD: 1000, GBP: 1860 };

// Canada Express Entry settlement funds by family size (CAD). Anchors at 1, 4
// and 7 are IRCC's published figures; sizes 2, 3, 5, 6 are linearly interpolated
// between those anchors and should be treated as estimates.
const EXPRESS_ENTRY_CAD = { 1: 15263, 2: 19613, 3: 23963, 4: 28362, 5: 31838, 6: 35313, 7: 38771 };
function expressEntryFundsCAD(familySize) {
  if (familySize <= 7) return EXPRESS_ENTRY_CAD[familySize];
  return EXPRESS_ENTRY_CAD[7] + 4112 * (familySize - 7);
}

const DESTINATIONS = {
  canada: {
    label: 'Canada',
    routes: {
      express_entry: {
        label: 'Express Entry (Permanent Residence)',
        asOf: 'IRCC settlement funds table, verified July 2026. ~₦1,000 per CAD.',
        compute(adults, children) {
          const familySize = 1 + adults + children;
          const totalCAD = expressEntryFundsCAD(familySize);
          return {
            total: totalCAD * FX.CAD,
            lines: [{ label: `Settlement funds for a family of ${familySize}`, amount: totalCAD * FX.CAD }],
            docWindow: 'Funds must be shown at application and again when your visa is issued — keep records for at least 6 months.'
          };
        }
      },
      study_permit: {
        label: 'Study Permit',
        asOf: 'IRCC study permit financial requirements, verified July 2026. ~₦1,000 per CAD. Excludes tuition.',
        compute(adults, children) {
          const baseCAD = 22895;
          const adultAddCAD = 8000 * adults;
          const childAddCAD = 3500 * children;
          const totalCAD = baseCAD + adultAddCAD + childAddCAD;
          const lines = [{ label: 'Living costs, first year (single applicant)', amount: baseCAD * FX.CAD }];
          if (adults > 0) lines.push({ label: `Additional adult(s) (×${adults})`, amount: adultAddCAD * FX.CAD });
          if (children > 0) lines.push({ label: `Additional child(ren) (×${children})`, amount: childAddCAD * FX.CAD });
          return {
            total: totalCAD * FX.CAD,
            lines,
            docWindow: 'This is living costs only — you also need proof of first-year tuition and travel, shown separately in your Letter of Acceptance.'
          };
        }
      }
    }
  },
  uk: {
    label: 'United Kingdom',
    routes: {
      skilled_worker: {
        label: 'Skilled Worker visa',
        asOf: 'UK Home Office maintenance requirement, verified July 2026. ~₦1,860 per GBP.',
        compute(adults, children) {
          const baseGBP = 1270;
          const partnerGBP = adults > 0 ? 285 : 0;
          const extraAdultsGBP = adults > 1 ? 285 * (adults - 1) : 0; // approximation beyond first partner
          const firstChildGBP = children > 0 ? 315 : 0;
          const extraChildrenGBP = children > 1 ? 200 * (children - 1) : 0;
          const totalGBP = baseGBP + partnerGBP + extraAdultsGBP + firstChildGBP + extraChildrenGBP;
          const lines = [{ label: 'Main applicant (28-day balance)', amount: baseGBP * FX.GBP }];
          if (partnerGBP) lines.push({ label: 'Partner/spouse', amount: (partnerGBP + extraAdultsGBP) * FX.GBP });
          if (firstChildGBP) lines.push({ label: `Child(ren) (×${children})`, amount: (firstChildGBP + extraChildrenGBP) * FX.GBP });
          return {
            total: totalGBP * FX.GBP,
            lines,
            docWindow: 'Must be held for 28 consecutive days, with the closing balance dated within 31 days of your application — a single day below the threshold can mean refusal.'
          };
        }
      },
      student: {
        label: 'Student visa',
        asOf: 'UK Home Office student maintenance rates, verified July 2026. ~₦1,860 per GBP.',
        compute(adults, children, london) {
          const months = 9;
          const monthlyRate = london ? 1529 : 1171;
          const depMonthlyRate = london ? 845 : 680;
          const studentGBP = monthlyRate * months;
          const dependents = adults + children;
          const dependentsGBP = depMonthlyRate * months * dependents;
          const totalGBP = studentGBP + dependentsGBP;
          const lines = [{ label: `Student maintenance (${months} months, ${london ? 'London' : 'outside London'})`, amount: studentGBP * FX.GBP }];
          if (dependents > 0) lines.push({ label: `Dependent(s) (×${dependents}, ${months} months)`, amount: dependentsGBP * FX.GBP });
          return {
            total: totalGBP * FX.GBP,
            lines,
            docWindow: 'Held for 28 consecutive days. This covers living costs only — tuition shown on your CAS is separate and must also be covered.'
          };
        }
      }
    }
  }
};

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

function populateRouteOptions() {
  const dest = DESTINATIONS[document.getElementById('destination').value];
  const routeSelect = document.getElementById('fundsRoute');
  const prevValue = routeSelect.value;
  routeSelect.innerHTML = Object.entries(dest.routes)
    .map(([key, r]) => `<option value="${key}">${r.label}</option>`).join('');
  if (dest.routes[prevValue]) routeSelect.value = prevValue;
}

function currentRoute() {
  const dest = DESTINATIONS[document.getElementById('destination').value];
  const route = dest.routes[document.getElementById('fundsRoute').value] || Object.values(dest.routes)[0];
  return { dest, route };
}

function updateLondonToggleVisibility() {
  const isUKStudent = document.getElementById('destination').value === 'uk'
    && document.getElementById('fundsRoute').value === 'student';
  document.getElementById('londonToggleGroup').style.display = isUKStudent ? '' : 'none';
}

function renderPreview() {
  const { dest, route } = currentRoute();
  const adults = Math.max(0, parseInt(document.getElementById('adultsCount').value) || 0);
  const children = Math.max(0, parseInt(document.getElementById('childrenCount').value) || 0);
  const london = document.getElementById('studyingLondon').value === 'yes';
  const currentSavings = parseFloat(document.getElementById('currentSavings').value) || 0;
  const monthlySavings = parseFloat(document.getElementById('monthlySavings').value) || 0;
  const totalTravelers = 1 + adults + children;

  updateLondonToggleVisibility();

  const result = route.compute(adults, children, london);

  document.getElementById('pDestination').textContent = dest.label;
  document.getElementById('pRoute').textContent = route.label;
  document.getElementById('pFamily').textContent = `${totalTravelers} traveler${totalTravelers > 1 ? 's' : ''}`;

  document.getElementById('pHeadline').innerHTML = `
    <div class="row grand"><span>Required threshold</span><span>${naira(result.total)}</span></div>
  `;

  const gate = document.getElementById('reportGate');
  if (japaPassActive) {
    gate.classList.remove('locked');
    document.getElementById('pBreakdown').innerHTML = result.lines
      .map(r => `<tr><td>${r.label}</td><td class="num">${naira(r.amount)}</td></tr>`).join('');

    let gapRow = '';
    if (currentSavings > 0) {
      const gap = result.total - currentSavings;
      gapRow = `<div class="row"><span>You already have</span><span>${naira(currentSavings)}</span></div>
        <div class="row grand"><span>${gap > 0 ? 'Gap remaining' : 'Surplus'}</span><span style="color:${gap > 0 ? 'var(--stamp-red)' : 'var(--stamp-gold)'};">${naira(Math.abs(gap))}</span></div>`;
    } else {
      gapRow = `<div class="row grand"><span>Total required</span><span>${naira(result.total)}</span></div>`;
    }
    document.getElementById('pTotals').innerHTML = gapRow;

    let note = `${route.docWindow} ${route.asOf}`;
    if (monthlySavings > 0) {
      const gap = Math.max(0, result.total - currentSavings);
      const months = gap > 0 ? Math.ceil(gap / monthlySavings) : 0;
      note = months > 0
        ? `Saving ${naira(monthlySavings)}/month, you'd close the gap in about ${months} month${months > 1 ? 's' : ''}. ${note}`
        : `You already meet this threshold. ${note}`;
    }
    document.getElementById('pSavingsNote').textContent = note;
  } else {
    gate.classList.add('locked');
    document.getElementById('pBreakdown').innerHTML = result.lines
      .map(() => `<tr><td>••••••••••••</td><td class="num">••••••</td></tr>`).join('');
    document.getElementById('pTotals').innerHTML = `<div class="row grand"><span>Total</span><span>••••••</span></div>`;
    document.getElementById('pSavingsNote').textContent = '';
  }

  if (window.KoboStorage) {
    KoboStorage.save('proof-of-funds', {
      destination: document.getElementById('destination').value,
      fundsRoute: document.getElementById('fundsRoute').value,
      studyingLondon: document.getElementById('studyingLondon').value,
      adultsCount: adults,
      childrenCount: children,
      currentSavings,
      monthlySavings
    });
  }

  return { dest, route, total: result.total, totalTravelers };
}

function applyFormState(state) {
  document.getElementById('destination').value = state.destination || 'canada';
  populateRouteOptions();
  document.getElementById('fundsRoute').value = state.fundsRoute || Object.keys(DESTINATIONS[document.getElementById('destination').value].routes)[0];
  document.getElementById('studyingLondon').value = state.studyingLondon || 'no';
  document.getElementById('adultsCount').value = state.adultsCount ?? 0;
  document.getElementById('childrenCount').value = state.childrenCount ?? 0;
  document.getElementById('currentSavings').value = state.currentSavings ?? '';
  document.getElementById('monthlySavings').value = state.monthlySavings ?? '';
}

document.getElementById('destination').addEventListener('change', () => { populateRouteOptions(); renderPreview(); });
['fundsRoute', 'studyingLondon', 'adultsCount', 'childrenCount', 'currentSavings', 'monthlySavings'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderPreview);
  document.getElementById(id).addEventListener('change', renderPreview);
});

document.getElementById('clearFormBtn').addEventListener('click', () => {
  if (!confirm('Clear this form? This only affects this device.')) return;
  KoboStorage.clear('proof-of-funds');
  applyFormState({});
  renderPreview();
});

(async function init() {
  const saved = window.KoboStorage ? KoboStorage.load('proof-of-funds') : null;
  applyFormState(saved || {});
  renderPreview();

  japaPassActive = await checkJapaPassActive();
  renderPreview();
})();

document.getElementById('downloadBtn').addEventListener('click', async () => {
  if (!japaPassActive) { window.location.href = '/pricing/#relocation-pricing'; return; }
  const { dest } = renderPreview();
  const btn = document.getElementById('downloadBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Preparing PDF…';
  btn.disabled = true;
  try {
    await KoboExport.downloadPdf(`proof-of-funds-${dest.label.replace(/\s+/g, '-')}.pdf`);
  } catch (err) {
    alert('Could not generate PDF: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  if (!japaPassActive) { window.location.href = '/pricing/#relocation-pricing'; return; }
  const { dest, route, total, totalTravelers } = renderPreview();
  const btn = document.getElementById('waBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Preparing image…';
  btn.disabled = true;

  const caption = [
    `*Proof of Funds — ${dest.label}*`,
    `${route.label}`,
    `${totalTravelers} traveler${totalTravelers > 1 ? 's' : ''}`,
    `Required threshold: *${naira(total)}*`
  ].join('\n');

  try {
    const result = await KoboExport.shareWhatsApp(`proof-of-funds-${dest.label.replace(/\s+/g, '-')}.png`, caption);
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
