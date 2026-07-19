// ---------- Expense tracking + profit snapshot ----------
const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (isoDate) => isoDate
  ? new Date(isoDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

function periodStart(period) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const day = d.getDay(); // 0 = Sunday
    d.setDate(d.getDate() - day);
  } else if (period === 'month') {
    d.setDate(1);
  } else if (period === 'quarter') {
    const q = Math.floor(d.getMonth() / 3);
    d.setMonth(q * 3, 1);
  }
  return d;
}

function showMsg(text, type) {
  const el = document.getElementById('formMsg');
  el.textContent = text;
  el.className = type;
}

(async function init() {
  const ctx = await window.BizSuiteGuard.requireAccess();
  if (!ctx) return;
  const { business, supabase, session } = ctx;

  let currentPeriod = 'week';

  async function renderSnapshot() {
    const start = periodStart(currentPeriod).toISOString();

    const { data: paidInvoices } = await supabase
      .from('documents')
      .select('amount, created_at')
      .eq('business_id', business.id)
      .eq('doc_type', 'invoice')
      .eq('payment_status', 'paid')
      .gte('created_at', start);

    const { data: expenses } = await supabase
      .from('expenses')
      .select('amount, category, expense_date')
      .eq('business_id', business.id)
      .gte('expense_date', start.split('T')[0]);

    const income = (paidInvoices || []).reduce((s, d) => s + Number(d.amount || 0), 0);
    const expenseTotal = (expenses || []).reduce((s, e) => s + Number(e.amount || 0), 0);
    const profit = income - expenseTotal;

    document.getElementById('statIncome').textContent = naira(income);
    document.getElementById('statExpenses').textContent = naira(expenseTotal);
    document.getElementById('statProfit').textContent = naira(profit);

    const profitCard = document.getElementById('profitCard');
    profitCard.classList.remove('profit', 'loss');
    profitCard.classList.add(profit >= 0 ? 'profit' : 'loss');

    const byCategory = {};
    (expenses || []).forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount || 0); });
    const catEl = document.getElementById('catBreakdown');
    const cats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    catEl.innerHTML = cats.length
      ? cats.map(([cat, amt]) => `<div class="cat-row"><span style="text-transform:capitalize;">${cat}</span><span>${naira(amt)}</span></div>`).join('')
      : '<div class="empty-note" style="padding:8px 0;">No expenses logged in this period.</div>';
  }

  document.querySelectorAll('#periodToggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPeriod = btn.dataset.period;
      document.querySelectorAll('#periodToggle button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSnapshot();
    });
  });

  document.getElementById('expDate').value = new Date().toISOString().split('T')[0];

  async function loadExpenseList() {
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*')
      .eq('business_id', business.id)
      .order('expense_date', { ascending: false })
      .limit(20);

    const wrap = document.getElementById('expenseListWrap');
    if (!expenses || !expenses.length) {
      wrap.innerHTML = '<div class="empty-note">No expenses logged yet.</div>';
      return;
    }
    wrap.innerHTML = expenses.map(e => `
      <div class="exp-row">
        <div>
          <strong>${e.vendor || 'Expense'}</strong>
          <span class="exp-cat-tag">${e.category}</span>
          <div style="font-size:0.8rem; opacity:0.6;">${fmtDate(e.expense_date)}${e.notes ? ' — ' + e.notes : ''}</div>
        </div>
        <div>${naira(e.amount)}</div>
      </div>
    `).join('');
  }

  document.getElementById('saveExpenseBtn').addEventListener('click', async () => {
    const vendor = document.getElementById('expVendor').value.trim();
    const amount = Number(document.getElementById('expAmount').value);
    const category = document.getElementById('expCategory').value;
    const expenseDate = document.getElementById('expDate').value;
    const notes = document.getElementById('expNotes').value.trim() || null;

    if (!amount || amount <= 0) { showMsg('Enter a valid amount.', 'error'); return; }

    const btn = document.getElementById('saveExpenseBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    const { error } = await supabase.from('expenses').insert({
      business_id: business.id,
      user_id: session.user.id,
      vendor: vendor || null,
      amount,
      category,
      expense_date: expenseDate || new Date().toISOString().split('T')[0],
      notes
    });

    btn.disabled = false;
    btn.textContent = 'Log expense';

    if (error) {
      showMsg('Could not save expense: ' + error.message, 'error');
      return;
    }

    showMsg('Expense logged.', 'success');
    document.getElementById('expVendor').value = '';
    document.getElementById('expAmount').value = '';
    document.getElementById('expNotes').value = '';
    loadExpenseList();
    renderSnapshot();
  });

  renderSnapshot();
  loadExpenseList();
})();
