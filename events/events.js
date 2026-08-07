let selectedType = 'wedding';

const naira = (n) => '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');

const HERO_COPY = {
  wedding: {
    title: 'Plan your wedding — budget, guests, RSVP, and vendors, all in one place',
    sub: "Guest list with live RSVP tracking, a vendor/payment tracker, contribution tracker, invitation card with a QR RSVP link, and aso-ebi list — for the day itself, not just the paperwork.",
  },
  naming: {
    title: 'Plan the naming ceremony — budget, guest list, and a proper certificate',
    sub: 'Naming item list for Yoruba, Igbo, or Hausa tradition, a guest list, budget, printable naming certificate, and an event-day timeline.',
  },
  funeral: {
    title: 'Plan the funeral / memorial service, with care',
    sub: 'Order of service and obituary generator, an attendance list, budget, and a family contribution tracker — organized, without adding to the burden.',
  },
};

// Rates are a rough starting point per guest / per event, split by city tier.
// Wedding rates are the highest given typical spend; naming and funeral scale down.
const RATES = {
  wedding: {
    premium: { perGuest: 8000, venueBase: 800000, decor: 500000, photo: 400000, entertainment: 350000 },
    mid:     { perGuest: 5500, venueBase: 450000, decor: 300000, photo: 250000, entertainment: 200000 },
    budget:  { perGuest: 3500, venueBase: 200000, decor: 150000, photo: 120000, entertainment: 100000 },
  },
  naming: {
    premium: { perGuest: 5000, venueBase: 300000, decor: 200000, photo: 150000, entertainment: 100000 },
    mid:     { perGuest: 3500, venueBase: 180000, decor: 120000, photo: 100000, entertainment: 60000 },
    budget:  { perGuest: 2000, venueBase: 80000,  decor: 60000,  photo: 50000,  entertainment: 30000 },
  },
  funeral: {
    premium: { perGuest: 5500, venueBase: 400000, decor: 150000, photo: 100000, entertainment: 80000 },
    mid:     { perGuest: 3800, venueBase: 250000, decor: 100000, photo: 70000,  entertainment: 50000 },
    budget:  { perGuest: 2200, venueBase: 120000, decor: 60000,  photo: 40000,  entertainment: 25000 },
  },
};

const CATEGORY_LABELS = {
  wedding: { venue: 'Venue', decor: 'Décor', photo: 'Photography/Video', entertainment: 'Music & entertainment' },
  naming:  { venue: 'Venue/home setup', decor: 'Décor', photo: 'Photography', entertainment: 'Entertainment' },
  funeral: { venue: 'Venue/hall', decor: 'Décor', photo: 'Photography', entertainment: 'Transport/logistics' },
};

function venueScale(guestCount) {
  if (guestCount > 400) return 1.4;
  if (guestCount > 200) return 1.2;
  return 1;
}

function updateHero() {
  document.getElementById('heroTitle').textContent = HERO_COPY[selectedType].title;
  document.getElementById('heroSub').textContent = HERO_COPY[selectedType].sub;
}

function calc() {
  const city = document.getElementById('calcCity').value;
  const guestCount = parseFloat(document.getElementById('guestCount').value) || 0;
  const r = RATES[selectedType][city];
  const labels = CATEGORY_LABELS[selectedType];

  const catering = guestCount * r.perGuest;
  const venue = r.venueBase * venueScale(guestCount);
  const decor = r.decor;
  const photo = r.photo;
  const entertainment = r.entertainment;
  const subtotal = catering + venue + decor + photo + entertainment;
  const misc = subtotal * 0.1;
  const total = subtotal + misc;

  document.getElementById('calcResult').innerHTML = `
    <div class="calc-line"><span>Catering</span><span>${naira(catering)}</span></div>
    <div class="calc-line"><span>${labels.venue}</span><span>${naira(venue)}</span></div>
    <div class="calc-line"><span>${labels.decor}</span><span>${naira(decor)}</span></div>
    <div class="calc-line"><span>${labels.photo}</span><span>${naira(photo)}</span></div>
    <div class="calc-line"><span>${labels.entertainment}</span><span>${naira(entertainment)}</span></div>
    <div class="calc-line"><span>Miscellaneous (10%)</span><span>${naira(misc)}</span></div>
    <div class="calc-line total"><span>Estimated total</span><span>${naira(total)}</span></div>
  `;
}

document.getElementById('typeSelect').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  selectedType = btn.dataset.type;
  document.querySelectorAll('#typeSelect button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateHero();
  calc();
});

document.getElementById('calcCity').addEventListener('change', calc);
document.getElementById('guestCount').addEventListener('input', calc);

updateHero();
calc();
