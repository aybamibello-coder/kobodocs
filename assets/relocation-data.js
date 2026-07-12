// ---------- Relocation suite: shared data ----------
// Single source of truth for all 3 relocation calculators (Japa Cost, Proof of
// Funds, Cost of Living). Update figures HERE ONLY — every tool reads from
// window.RelocationData, so a fee change only needs to happen in one place.
//
// Sources: IRCC, UK Home Office, USCIS/travel.state.gov, German Federal Foreign
// Office (Sperrkonto/BAföG rate), Irish Immigration Service Delivery (ISD) &
// Dept. of Enterprise, Trade & Employment (DETE), ONS Price Index of Private
// Rents, Zumper rental data. All NGN figures are pre-converted at the FX rates
// below.
//
// A NOTE ON THE USA: unlike Canada/UK, the US has no single official "proof of
// funds" table (F-1 students prove funds via their own school's stated cost of
// attendance, which varies by institution) and H-1B has no individual savings
// requirement at all — it's employer-sponsored, and most H-1B fees are legally
// the EMPLOYER's responsibility, not the applicant's. The H-1B $100,000
// proclamation fee is, as of this writing, under active litigation (struck
// down by a federal judge, currently stayed pending appeal) — it is NOT baked
// into these figures since its status is unsettled. Always confirm current
// status before relying on any US work-visa figure here.
//
// REVIEW CADENCE: check the official sources below every ~6 months — several
// of these bodies have changed fees in April in past cycles, so late
// April/early May and again in October are sensible checkpoints. Update
// LAST_VERIFIED and NEXT_REVIEW_DUE below every time this file is edited.

const RelocationData = (function () {
  const LAST_VERIFIED = 'July 2026';
  const NEXT_REVIEW_DUE = 'October 2026';

  const FX = { CAD: 1000, GBP: 1860, USD: 1380, EUR: 1610 }; // NGN per 1 unit foreign currency
  const cad = (n) => n * FX.CAD;
  const gbp = (n) => n * FX.GBP;
  const usd = (n) => n * FX.USD;
  const eur = (n) => n * FX.EUR;

  const SOURCES = [
    { label: 'IRCC — Pay your application fees', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/fees.html' },
    { label: 'IRCC — Proof of funds (settlement funds table)', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/proof-funds.html' },
    { label: 'IRCC — Cost of living (study permit financial requirement)', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/prepare/cost-of-living.html' },
    { label: 'UK Home Office — Visa fees', url: 'https://www.gov.uk/visa-fees' },
    { label: 'UK Home Office — Skilled Worker: maintenance', url: 'https://www.gov.uk/skilled-worker-visa/money' },
    { label: 'UK Home Office — Student visa: money', url: 'https://www.gov.uk/student-visa/money' },
    { label: 'US Dept of State — Visa fees (travel.state.gov)', url: 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/fees/fees-visa-services.html' },
    { label: 'US SEVP — I-901 SEVIS fee (FMJfee.com)', url: 'https://www.fmjfee.com/' },
    { label: 'German Federal Foreign Office — Sperrkonto/BAföG rate', url: 'https://www.auswaertiges-amt.de/en' },
    { label: 'Ireland ISD — Student finance requirements', url: 'https://www.irishimmigration.ie/coming-to-study-in-ireland/what-are-my-study-options/a-fee-paying-private-primary-or-secondary-school/information-on-student-finances/' },
    { label: 'Ireland DETE — Critical Skills Employment Permit', url: 'https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/permit-types/critical-skills-employment-permit/' },
    { label: 'ONS — Price Index of Private Rents', url: 'https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/priceindexofprivaterents/latest' }
  ];

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
    usa: {
      label: 'United States',
      asOf: 'US Dept of State & SEVP fees, verified July 2026. ~₦1,380 per USD. H-1B core petition fees are legally the employer\'s responsibility, not shown here — the contested $100,000 H-1B fee is excluded as its legal status is unsettled (under appeal as of writing).',
      routes: {
        student: {
          label: 'F-1 Student visa',
          perAdult: {
            'MRV visa application fee': usd(185),
            'SEVIS I-901 fee': usd(350)
          },
          perChild: { 'MRV visa application fee (dependent F-2)': usd(185) },
          settlingBuffer: usd(2200),
          defaultFlight: 1000000
        },
        skilled_worker: {
          label: 'H-1B Skilled Worker (employer-sponsored)',
          perAdult: {
            'MRV visa application fee (your only direct cost — employer pays petition/registration fees)': usd(205)
          },
          perChild: { 'MRV visa application fee (dependent H-4)': usd(205) },
          settlingBuffer: usd(2500),
          defaultFlight: 1000000
        }
      }
    },
    germany: {
      label: 'Germany',
      asOf: 'German Federal Foreign Office Sperrkonto/BAföG rate, verified July 2026. ~₦1,610 per EUR.',
      routes: {
        job_seeker: {
          label: 'Job Seeker visa / Opportunity Card (Chancenkarte)',
          perAdult: {
            'National visa fee': eur(75),
            'Blocked account (Sperrkonto) deposit — refundable, released monthly on arrival': eur(13092)
          },
          perChild: { 'National visa fee (dependent)': eur(75) },
          settlingBuffer: eur(1500),
          defaultFlight: 950000
        },
        student: {
          label: 'Student visa',
          perAdult: {
            'National visa fee': eur(75),
            'Blocked account (Sperrkonto) deposit — refundable, released monthly on arrival': eur(11904)
          },
          perChild: { 'National visa fee (dependent)': eur(75) },
          settlingBuffer: eur(1300),
          defaultFlight: 950000
        }
      }
    },
    ireland: {
      label: 'Ireland',
      asOf: 'Ireland ISD & DETE fees, verified July 2026. ~₦1,610 per EUR.',
      routes: {
        critical_skills: {
          label: 'Critical Skills Employment Permit',
          perAdult: {
            'Employment permit fee (typically employer-paid, shown for full-cost visibility)': eur(1000),
            'D-visa fee (if required for your nationality)': eur(60)
          },
          perChild: { 'Visa fee (dependent, if required)': eur(60) },
          settlingBuffer: eur(1400),
          defaultFlight: 900000
        },
        student: {
          label: 'Student visa (D Study Visa)',
          perAdult: {
            'Visa fee (multi-entry)': eur(100),
            'Minimum tuition prepayment required before visa grant': eur(6000)
          },
          perChild: { 'Visa fee (dependent)': eur(60) },
          settlingBuffer: eur(1200),
          defaultFlight: 900000
        }
      }
    },
    other: {
      label: 'Other / not sure yet',
      asOf: 'Generic global average, not destination-specific. ~₦1,380 per USD.',
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
    },
    usa: {
      label: 'United States',
      routes: {
        student: {
          label: 'F-1 Student (cost of attendance)',
          asOf: 'The US has no single government threshold — this is your school\'s stated cost of attendance on Form I-20, which varies by institution. Figure below is a typical estimate only. ~₦1,380 per USD.',
          compute(adults, children) {
            const baseUSD = 28000;
            const dependentAddUSD = 6000 * (adults + children);
            const totalUSD = baseUSD + dependentAddUSD;
            const lines = [{ label: 'Typical cost of attendance (varies by school — check your I-20)', amount: usd(baseUSD) }];
            if (adults + children > 0) lines.push({ label: `Dependent(s) (×${adults + children}, estimate)`, amount: usd(dependentAddUSD) });
            return {
              total: usd(totalUSD),
              lines,
              docWindow: 'Your actual required amount is whatever your school certifies on your I-20 — always use that figure, not this estimate, for your visa application.'
            };
          }
        }
      }
    },
    germany: {
      label: 'Germany',
      routes: {
        student: {
          label: 'Student visa (blocked account)',
          asOf: 'German Federal Foreign Office Sperrkonto rate (BAföG-linked), verified July 2026. ~₦1,610 per EUR. This is a refundable deposit released to you monthly, not a fee.',
          compute(adults, children) {
            const baseEUR = 11904;
            const lines = [{ label: 'Blocked account deposit (single applicant, 1 year)', amount: eur(baseEUR) }];
            return {
              total: eur(baseEUR),
              lines,
              docWindow: 'Funds are "blocked" and released to you in fixed monthly instalments after arrival — not spent or paid to anyone. Refunded in full if your visa is refused.'
            };
          }
        },
        job_seeker: {
          label: 'Job Seeker visa / Opportunity Card (blocked account)',
          asOf: 'German Federal Foreign Office Sperrkonto rate for job seekers, verified July 2026. ~₦1,610 per EUR.',
          compute(adults, children) {
            const baseEUR = 13092;
            const lines = [{ label: 'Blocked account deposit (single applicant, 1 year)', amount: eur(baseEUR) }];
            return {
              total: eur(baseEUR),
              lines,
              docWindow: 'Funds are "blocked" and released to you in fixed monthly instalments after arrival — not spent or paid to anyone. Refunded in full if your visa is refused.'
            };
          }
        }
      }
    },
    ireland: {
      label: 'Ireland',
      routes: {
        student: {
          label: 'Student visa (D Study Visa)',
          asOf: 'Ireland Immigration Service Delivery financial requirement, verified July 2026. ~₦1,610 per EUR. Excludes tuition (separate €6,000 minimum prepayment also required).',
          compute(adults, children) {
            const baseEUR = 10000;
            const lines = [{ label: 'Living costs, first academic year (single applicant)', amount: eur(baseEUR) }];
            return {
              total: eur(baseEUR),
              lines,
              docWindow: 'Funds must be held for at least 6 months and shown as immediately accessible — non-liquid assets like property are not accepted.'
            };
          }
        }
      }
    }
  };

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
    },
    usa: {
      label: 'United States',
      cities: {
        national: {
          label: 'National average (blended estimate)',
          rentBySize: { 1: usd(1700), 2: usd(2150), 3: usd(2700) },
          groceries: usd(400), transport: usd(100), utilitiesPhone: usd(220), misc: usd(350),
          setupAllowance: usd(1800)
        }
      }
    },
    germany: {
      label: 'Germany',
      cities: {
        national: {
          label: 'National average (blended estimate)',
          rentBySize: { 1: eur(950), 2: eur(1250), 3: eur(1600) },
          groceries: eur(280), transport: eur(58), utilitiesPhone: eur(220), misc: eur(220),
          setupAllowance: eur(1000)
        }
      }
    },
    ireland: {
      label: 'Ireland',
      cities: {
        national: {
          label: 'National average (blended estimate)',
          rentBySize: { 1: eur(1450), 2: eur(1850), 3: eur(2300) },
          groceries: eur(320), transport: eur(115), utilitiesPhone: eur(200), misc: eur(250),
          setupAllowance: eur(1100)
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
