// ---------- Relocation suite: shared data ----------
// Single source of truth for all 3 relocation calculators (Japa Cost, Proof of
// Funds, Cost of Living). Update figures HERE ONLY — every tool reads from
// window.RelocationData, so a fee change only needs to happen in one place.
//
// Sources: IRCC fee schedule & settlement funds table, UK Home Office visa
// fees & maintenance requirements, ONS Price Index of Private Rents, Zumper
// rental data. All NGN figures are pre-converted at the FX rates below.
//
// REVIEW CADENCE: check the official sources below every ~6 months — IRCC and
// UK Home Office fees have both changed in April in past cycles, so late
// April/early May and again in October are sensible checkpoints. Update
// LAST_VERIFIED and NEXT_REVIEW_DUE below every time this file is edited.

const RelocationData = (function () {
  const LAST_VERIFIED = 'July 2026';
  const NEXT_REVIEW_DUE = 'October 2026';

  const FX = { CAD: 1000, GBP: 1860, USD: 1380 }; // NGN per 1 unit foreign currency
  const cad = (n) => n * FX.CAD;
  const gbp = (n) => n * FX.GBP;
  const usd = (n) => n * FX.USD;

  const SOURCES = [
    { label: 'IRCC — Pay your application fees', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/fees.html' },
    { label: 'IRCC — Proof of funds (settlement funds table)', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/proof-funds.html' },
    { label: 'IRCC — Cost of living (study permit financial requirement)', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/prepare/cost-of-living.html' },
    { label: 'UK Home Office — Visa fees', url: 'https://www.gov.uk/visa-fees' },
    { label: 'UK Home Office — Skilled Worker: maintenance', url: 'https://www.gov.uk/skilled-worker-visa/money' },
    { label: 'UK Home Office — Student visa: money', url: 'https://www.gov.uk/student-visa/money' },
    { label: 'ONS — Price Index of Private Rents', url: 'https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/priceindexofprivaterents/latest' }
  ];

  // ---------- Japa Relocation Cost Calculator ----------
  const japaCostDestinations = {
    canada: {
      label: 'Canada',
      asOf: 'IRCC fees as of the April 2026 increase. ~₦1,000 per CAD.',
      routes: {
        express_entry: {
          label: 'Express Entry (Permanent Residence)',
          perAdult: {
            'IRCC processing fee': cad(990),
            'Right of Permanent Residence Fee': cad(600),
            'Biometrics': cad(85),
            'Language test (IELTS/CELPIP)': cad(320),
            'Educational Credential Assessment': cad(340),
            'Medical exam': cad(200)
          },
          perChild: { 'IRCC processing fee': cad(270), 'Biometrics': cad(85) },
          settlingBuffer: cad(2500),
          defaultFlight: cad(1100)
        },
        work_permit: {
          label: 'Work Permit (temporary)',
          perAdult: { 'Work permit application': cad(155), 'Biometrics': cad(85) },
          perChild: { 'Work permit application (accompanying)': cad(155), 'Biometrics': cad(85) },
          settlingBuffer: cad(2000),
          defaultFlight: cad(1100)
        },
        study_permit: {
          label: 'Study Permit',
          perAdult: { 'Study permit application': cad(150), 'Biometrics': cad(85) },
          perChild: { 'Study permit application (accompanying)': cad(150), 'Biometrics': cad(85) },
          settlingBuffer: cad(2200),
          defaultFlight: cad(1100)
        }
      }
    },
    uk: {
      label: 'United Kingdom',
      asOf: 'UK Home Office fees as of the April 2026 increase. ~₦1,860 per GBP.',
      routes: {
        skilled_worker: {
          label: 'Skilled Worker visa (3-year, outside UK)',
          perAdult: {
            'Visa application fee': gbp(819),
            'Immigration Health Surcharge (3 yrs)': gbp(3105),
            'English test (IELTS)': gbp(180)
          },
          perChild: { 'Visa application fee': gbp(819), 'Immigration Health Surcharge (3 yrs)': gbp(3105) },
          settlingBuffer: gbp(1500),
          defaultFlight: 850000
        },
        student: {
          label: 'Student visa (1-year course)',
          perAdult: {
            'Visa application fee': gbp(490),
            'Immigration Health Surcharge (1 yr)': gbp(776),
            'English test (IELTS)': gbp(180)
          },
          perChild: { 'Visa application fee (dependent)': gbp(490), 'Immigration Health Surcharge (1 yr)': gbp(776) },
          settlingBuffer: gbp(1300),
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
            'Visa/application fees (est.)': usd(400),
            'Biometrics/medical (est.)': usd(150),
            'English test (est.)': usd(220)
          },
          perChild: { 'Visa/application fees (est.)': usd(200) },
          settlingBuffer: usd(1800),
          defaultFlight: 950000
        }
      }
    }
  };

  // ---------- Proof of Funds Calculator ----------
  // Canada Express Entry settlement funds by family size. Anchors at 1, 4 and 7
  // are IRCC's published figures; sizes 2, 3, 5, 6 are linearly interpolated.
  const EXPRESS_ENTRY_CAD = { 1: 15263, 2: 19613, 3: 23963, 4: 28362, 5: 31838, 6: 35313, 7: 38771 };
  function expressEntryFundsCAD(familySize) {
    if (familySize <= 7) return EXPRESS_ENTRY_CAD[familySize];
    return EXPRESS_ENTRY_CAD[7] + 4112 * (familySize - 7);
  }

  const proofOfFundsDestinations = {
    canada: {
      label: 'Canada',
      routes: {
        express_entry: {
          label: 'Express Entry (Permanent Residence)',
          asOf: 'IRCC settlement funds table. ~₦1,000 per CAD. Family sizes 2/3/5/6 interpolated between published anchors.',
          compute(adults, children) {
            const familySize = 1 + adults + children;
            const totalNGN = cad(expressEntryFundsCAD(familySize));
            return {
              total: totalNGN,
              lines: [{ label: `Settlement funds for a family of ${familySize}`, amount: totalNGN }],
              docWindow: 'Funds must be shown at application and again when your visa is issued — keep records for at least 6 months.'
            };
          }
        },
        study_permit: {
          label: 'Study Permit',
          asOf: 'IRCC study permit financial requirements. ~₦1,000 per CAD. Excludes tuition.',
          compute(adults, children) {
            const baseNGN = cad(22895);
            const adultAddNGN = cad(8000) * adults;
            const childAddNGN = cad(3500) * children;
            const totalNGN = baseNGN + adultAddNGN + childAddNGN;
            const lines = [{ label: 'Living costs, first year (single applicant)', amount: baseNGN }];
            if (adults > 0) lines.push({ label: `Additional adult(s) (×${adults})`, amount: adultAddNGN });
            if (children > 0) lines.push({ label: `Additional child(ren) (×${children})`, amount: childAddNGN });
            return {
              total: totalNGN,
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
          asOf: 'UK Home Office maintenance requirement. ~₦1,860 per GBP.',
          compute(adults, children) {
            const baseGBP = 1270;
            const partnerGBP = adults > 0 ? 285 : 0;
            const extraAdultsGBP = adults > 1 ? 285 * (adults - 1) : 0;
            const firstChildGBP = children > 0 ? 315 : 0;
            const extraChildrenGBP = children > 1 ? 200 * (children - 1) : 0;
            const totalGBP = baseGBP + partnerGBP + extraAdultsGBP + firstChildGBP + extraChildrenGBP;
            const lines = [{ label: 'Main applicant (28-day balance)', amount: gbp(baseGBP) }];
            if (partnerGBP) lines.push({ label: 'Partner/spouse', amount: gbp(partnerGBP + extraAdultsGBP) });
            if (firstChildGBP) lines.push({ label: `Child(ren) (×${children})`, amount: gbp(firstChildGBP + extraChildrenGBP) });
            return {
              total: gbp(totalGBP),
              lines,
              docWindow: 'Must be held for 28 consecutive days, with the closing balance dated within 31 days of your application — a single day below the threshold can mean refusal.'
            };
          }
        },
        student: {
          label: 'Student visa',
          asOf: 'UK Home Office student maintenance rates. ~₦1,860 per GBP.',
          compute(adults, children, london) {
            const months = 9;
            const monthlyRate = london ? 1529 : 1171;
            const depMonthlyRate = london ? 845 : 680;
            const studentGBP = monthlyRate * months;
            const dependents = adults + children;
            const dependentsGBP = depMonthlyRate * months * dependents;
            const totalGBP = studentGBP + dependentsGBP;
            const lines = [{ label: `Student maintenance (${months} months, ${london ? 'London' : 'outside London'})`, amount: gbp(studentGBP) }];
            if (dependents > 0) lines.push({ label: `Dependent(s) (×${dependents}, ${months} months)`, amount: gbp(dependentsGBP) });
            return {
              total: gbp(totalGBP),
              lines,
              docWindow: 'Held for 28 consecutive days. This covers living costs only — tuition shown on your CAS is separate and must also be covered.'
            };
          }
        }
      }
    }
  };

  // ---------- Cost of Living Calculator ----------
  const LIFESTYLE_MULT = { lean: 0.82, comfortable: 1.0, upscale: 1.35 };

  const costOfLivingDestinations = {
    canada: {
      label: 'Canada',
      cities: {
        toronto: {
          label: 'Toronto',
          rentBySize: { 1: cad(2200), 2: cad(2750), 3: cad(3600) },
          groceries: cad(480), transport: cad(156), utilitiesPhone: cad(210), misc: cad(300),
          setupAllowance: cad(1500)
        },
        calgary: {
          label: 'Calgary',
          rentBySize: { 1: cad(1700), 2: cad(2000), 3: cad(2400) },
          groceries: cad(420), transport: cad(112), utilitiesPhone: cad(190), misc: cad(260),
          setupAllowance: cad(1500)
        }
      }
    },
    uk: {
      label: 'United Kingdom',
      cities: {
        london: {
          label: 'London',
          rentBySize: { 1: gbp(1900), 2: gbp(3200), 3: gbp(4400) },
          groceries: gbp(280), transport: gbp(152), utilitiesPhone: gbp(145), misc: gbp(260),
          setupAllowance: gbp(900)
        },
        manchester: {
          label: 'Manchester',
          rentBySize: { 1: gbp(987), 2: gbp(1213), 3: gbp(1406) },
          groceries: gbp(210), transport: gbp(85), utilitiesPhone: gbp(130), misc: gbp(180),
          setupAllowance: gbp(900)
        }
      }
    }
  };

  return {
    LAST_VERIFIED,
    NEXT_REVIEW_DUE,
    SOURCES,
    FX,
    japaCost: { destinations: japaCostDestinations },
    proofOfFunds: { destinations: proofOfFundsDestinations },
    costOfLiving: { destinations: costOfLivingDestinations, LIFESTYLE_MULT, rentTierFor: (n) => (n <= 1 ? 1 : n <= 3 ? 2 : 3) }
  };
})();

window.RelocationData = RelocationData;
