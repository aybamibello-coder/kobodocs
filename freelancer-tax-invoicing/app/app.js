// ---------- Freelancer Income Log app logic ----------
const CURRENCY_SYMBOLS = { NGN: '₦', USD: '$', GBP: '£', EUR: '€' };
const FREE_ENTRY_LIMIT = 5;
const CATEGORY_LABELS = {
  rent: 'Rent', internet_data: 'Internet/data', software: 'Software',
  pension: 'Pension', nhf: 'NHF', life_insurance: 'Life insurance', other: 'Other'
};

let ctx = null;
let entries = [];
let currentType = 'income';
let billingCycle = 'monthly';

function money(n, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] || '₦';
  return symbol + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nextMarch31() {
  const now = new Date();
  let year = now.getFullYear();
  const deadline = new Date(year, 2, 31); // month is 0-indexed: 2 = March
  if (now > deadline) year += 1;
  return new Date(year, 2, 31);
}

function renderDeadlineBanner() {
  const deadline = nextMarch31();
  const days = Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24));
  document.getElementById('deadlineBanner').innerHTML =
    `<strong>${days} day${days === 1 ? '' : 's'}</strong> until the ${deadline.getFullYear()} annual filing deadline (March 31). ` +
    `<a href="/blog/freelancer-remote-worker-tax-nigeria-2026/" target="_blank" rel="noopener">What you need to know →</a>`;
}

function computeSummary() {
  const incomeByCurrency = {};
  let totalWht = 0;
  let totalExpenses = 0;

  entries.forEach(e => {
    if (e.entry_type === 'income') {
      incomeByCurrency[e.currency] = (incomeByCurrency[e.currency] || 0) + Number(e.amount);
      totalWht += Number(e.wht_withheld || 0);
    } else {
      totalExpenses += Number(e.amount);
    }
  });

  return { incomeByCurrency, totalWht, totalExpenses };
}

function renderStats() {
  const { incomeByCurrency, totalWht, totalExpenses } = computeSummary();
  const grid = document.getElementById('statsGrid');
  const incomeCards = Object.keys(incomeByCurrency).length
    ? Object.entries(incomeByCurrency).map(([cur, amt]) =>
        `<div class="fl-stat"><div class="num">${money(amt, cur)}</div><div class="label">Income (${cur})</div></div>`
      ).join('')
    : `<div class="fl-stat"><div class="num">₦0.00</div><div class="label">Income</div></div>`;

  grid.innerHTML = incomeCards + `
    <div class="fl-stat"><div class="num">${money(totalWht, 'NGN')}</div><div class="label">WHT credits</div></div>
    <div class="fl-stat"><div class="num">${money(totalExpenses, 'NGN')}</div><div class="label">Deductible expenses (NGN)</div></div>
    <div class="fl-stat"><div class="num">${entries.length}</div><div class="label">Total entries</div></div>
  `;
}

function renderEntries() {
  const body = document.getElementById('entriesBody');
  const empty = document.getElementById('emptyState');
  if (!entries.length) {
    body.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  body.innerHTML = entries.map(e => `
    <tr data-id="${e.id}">
      <td>${new Date(e.entry_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
      <td><span class="fl-tag ${e.entry_type}">${e.entry_type === 'income' ? 'Income' : CATEGORY_LABELS[e.category] || 'Expense'}</span></td>
      <td>${e.description}</td>
      <td class="num">${money(e.amount, e.entry_type === 'income' ? e.currency : 'NGN')}</td>
      <td class="num">${e.entry_type === 'income' && e.wht_withheld > 0 ? money(e.wht_withheld, 'NGN') : '—'}</td>
      <td><button class="fl-del" data-id="${e.id}" aria-label="Delete">&times;</button></td>
    </tr>
  `).join('');

  body.querySelectorAll('.fl-del').forEach(btn => {
    btn.addEventListener('click', () => deleteEntry(btn.dataset.id));
  });
}

function renderPaywall() {
  const banner = document.getElementById('paywallBanner');
  if (!ctx.isPro && entries.length >= FREE_ENTRY_LIMIT) {
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

async function loadEntries() {
  const { data, error } = await ctx.supabase
    .from('freelance_ledger_entries')
    .select('*')
    .eq('user_id', ctx.session.user.id)
    .order('entry_date', { ascending: false });

  if (!error) entries = data || [];
  renderStats();
  renderEntries();
  renderPaywall();
}

function setType(type) {
  currentType = type;
  document.getElementById('typeIncomeBtn').classList.toggle('active', type === 'income');
  document.getElementById('typeExpenseBtn').classList.toggle('active', type === 'expense');
  document.getElementById('entryDescLabel').textContent = type === 'income' ? 'Client / description' : 'Vendor / description';
  document.getElementById('categoryField').style.display = type === 'expense' ? 'block' : 'none';
  document.getElementById('currencyField').style.display = type === 'income' ? 'block' : 'none';
  document.getElementById('whtField').style.display = type === 'income' ? 'block' : 'none';
}

async function deleteEntry(id) {
  if (!confirm('Delete this entry?')) return;
  await ctx.supabase.from('freelance_ledger_entries').delete().eq('id', id);
  await loadEntries();
}

async function handleSubmit(e) {
  e.preventDefault();
  const msg = document.getElementById('formMsg');

  if (!ctx.isPro && entries.length >= FREE_ENTRY_LIMIT) {
    msg.textContent = "You've reached the free limit of 5 entries — upgrade above to keep tracking.";
    msg.style.color = '#a03a3a';
    return;
  }

  const payload = {
    user_id: ctx.session.user.id,
    entry_type: currentType,
    entry_date: document.getElementById('entryDate').value,
    description: document.getElementById('entryDesc').value.trim(),
    amount: parseFloat(document.getElementById('entryAmount').value) || 0,
    currency: currentType === 'income' ? document.getElementById('entryCurrency').value : 'NGN',
    category: currentType === 'expense' ? document.getElementById('entryCategory').value : null,
    wht_withheld: currentType === 'income' ? (parseFloat(document.getElementById('entryWht').value) || 0) : 0
  };

  if (!payload.entry_date || !payload.description || payload.amount <= 0) {
    msg.textContent = 'Fill in date, description, and a valid amount.';
    msg.style.color = '#a03a3a';
    return;
  }

  const { error } = await ctx.supabase.from('freelance_ledger_entries').insert(payload);
  if (error) {
    msg.textContent = 'Could not save that entry — try again.';
    msg.style.color = '#a03a3a';
    return;
  }

  msg.textContent = '';
  document.getElementById('entryForm').reset();
  document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
  await loadEntries();
}

async function init() {
  ctx = await window.FreelanceGuard.requireAccess();
  if (!ctx) return;

  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('appRoot').style.display = 'block';

  document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
  renderDeadlineBanner();

  document.getElementById('typeIncomeBtn').addEventListener('click', () => setType('income'));
  document.getElementById('typeExpenseBtn').addEventListener('click', () => setType('expense'));
  document.getElementById('entryForm').addEventListener('submit', handleSubmit);

  document.getElementById('cycleMonthlyBtn').addEventListener('click', () => {
    billingCycle = 'monthly';
    document.getElementById('cycleMonthlyBtn').classList.add('active');
    document.getElementById('cycleYearlyBtn').classList.remove('active');
  });
  document.getElementById('cycleYearlyBtn').addEventListener('click', () => {
    billingCycle = 'yearly';
    document.getElementById('cycleYearlyBtn').classList.add('active');
    document.getElementById('cycleMonthlyBtn').classList.remove('active');
  });
  document.getElementById('upgradeBtn').addEventListener('click', () => {
    window.KoboSubscribe.start('init-freelance-payment', { billing_cycle: billingCycle });
  });

  await loadEntries();
}

init();
