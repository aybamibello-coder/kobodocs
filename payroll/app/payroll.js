// ---------- Payroll app ----------
const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['', 'January','February','March','April','May','June','July','August','September','October','November','December'];

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2600);
}

const FN_BASE = 'https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1';

async function callFn(name, session, payload) {
  const res = await fetch(`${FN_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function renderPlanPicker(ctx) {
  const area = document.getElementById('mainArea');
  area.innerHTML = `
    <div class="bs-panel">
      <div class="preview-label">What a payslip looks like</div>
      <div class="hero-doc mini">
        <div class="hero-doc-head">
          <div class="co">Funmi Adebayo</div>
          <div class="no">PAYSLIP<br>August 2026</div>
        </div>
        <div class="hero-doc-row"><span>Basic salary</span><span>₦200,000</span></div>
        <div class="hero-doc-row"><span>Housing allowance</span><span>₦60,000</span></div>
        <div class="hero-doc-row"><span>Pension (employee, 8%)</span><span>−₦23,200</span></div>
        <div class="hero-doc-row"><span>PAYE tax</span><span>−₦31,015</span></div>
        <div class="hero-doc-total"><span>Net pay</span><span>₦235,785</span></div>
      </div>
      <p style="margin-bottom:16px; text-align:center;">No active Payroll plan for <strong>${ctx.business.name}</strong> yet. Pick one to get started — priced by headcount, billed monthly.</p>
      <div class="plans-grid">
        <div class="plan-card">
          <h3>Starter</h3>
          <div class="plan-price">₦4,000<span style="font-size:0.7rem;">/mo</span></div>
          <p style="font-size:0.8rem; opacity:0.7; margin-bottom:14px;">Up to 5 employees</p>
          <button class="btn primary" data-plan="starter">Choose Starter</button>
        </div>
        <div class="plan-card">
          <h3>Growth</h3>
          <div class="plan-price">₦12,000<span style="font-size:0.7rem;">/mo</span></div>
          <p style="font-size:0.8rem; opacity:0.7; margin-bottom:14px;">Up to 20 employees</p>
          <button class="btn primary" data-plan="growth">Choose Growth</button>
        </div>
        <div class="plan-card">
          <h3>Business</h3>
          <div class="plan-price">₦25,000<span style="font-size:0.7rem;">/mo</span></div>
          <p style="font-size:0.8rem; opacity:0.7; margin-bottom:14px;">Up to 50 employees</p>
          <button class="btn primary" data-plan="business">Choose Business</button>
        </div>
      </div>
    </div>
  `;
  area.querySelectorAll('[data-plan]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.KoboSubscribe.start('init-payroll-payment', {
        business_id: ctx.business.id,
        plan: btn.dataset.plan,
        billing_cycle: 'monthly'
      });
    });
  });
}

async function loadEmployees(ctx) {
  const { data } = await ctx.supabase
    .from('payroll_employees')
    .select('*')
    .eq('business_id', ctx.business.id)
    .eq('active', true)
    .order('created_at', { ascending: true });
  return data || [];
}

function employeeRow(emp) {
  return `
    <div class="pr-row" data-emp="${emp.id}">
      <div>
        <div class="pr-name">${emp.full_name}</div>
        <div class="pr-meta">${emp.staff_role || 'No role set'} · Gross ${naira(Number(emp.basic_salary) + Number(emp.housing_allowance) + Number(emp.transport_allowance) + Number(emp.other_allowance))}/mo</div>
      </div>
      <button class="btn small remove-emp" data-id="${emp.id}">Remove</button>
    </div>
  `;
}

async function renderApp(ctx) {
  const area = document.getElementById('mainArea');
  const employees = await loadEmployees(ctx);
  const now = new Date();

  area.innerHTML = `
    <div class="bs-panel">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <strong>${ctx.business.name}</strong>
        <span class="pr-meta">${ctx.subscription.plan} plan · ${employees.length}/${ctx.subscription.employee_limit} employees · renews ${new Date(ctx.subscription.expires_at).toLocaleDateString('en-GB')}</span>
      </div>
      <div id="empListWrap">${employees.length ? employees.map(employeeRow).join('') : `
        <div class="preview-label">What a payslip looks like once you add staff</div>
        <div class="hero-doc mini">
          <div class="hero-doc-head">
            <div class="co">Funmi Adebayo</div>
            <div class="no">PAYSLIP<br>August 2026</div>
          </div>
          <div class="hero-doc-row"><span>Basic salary</span><span>₦200,000</span></div>
          <div class="hero-doc-row"><span>Pension (employee, 8%)</span><span>−₦23,200</span></div>
          <div class="hero-doc-row"><span>PAYE tax</span><span>−₦31,015</span></div>
          <div class="hero-doc-total"><span>Net pay</span><span>₦235,785</span></div>
        </div>
      `}</div>
    </div>

    <div class="bs-panel">
      <h3 style="font-size:1rem; margin-bottom:12px;">Add an employee</h3>
      <form id="addEmpForm" class="pr-form">
        <div class="form-grid">
          <div><label>Full name</label><input name="full_name" required></div>
          <div><label>Role</label><input name="staff_role"></div>
          <div><label>Basic salary (₦/mo)</label><input name="basic_salary" type="number" step="0.01" required></div>
          <div><label>Housing allowance (₦/mo)</label><input name="housing_allowance" type="number" step="0.01" value="0"></div>
          <div><label>Transport allowance (₦/mo)</label><input name="transport_allowance" type="number" step="0.01" value="0"></div>
          <div><label>Other allowance (₦/mo)</label><input name="other_allowance" type="number" step="0.01" value="0"></div>
          <div><label>Bank name</label><input name="bank_name"></div>
          <div><label>Bank account number</label><input name="bank_account_number"></div>
        </div>
        <label style="display:inline-flex; align-items:center; gap:6px; margin-bottom:10px;">
          <input type="checkbox" name="pension_opt_in" checked style="width:auto; margin:0;"> Enrolled in pension (8%/10%)
        </label>
        <label style="display:inline-flex; align-items:center; gap:6px; margin-bottom:14px;">
          <input type="checkbox" name="nhf_opt_in" style="width:auto; margin:0;"> Enrolled in NHF (2.5%)
        </label>
        <button class="btn primary" type="submit">Add employee</button>
      </form>
    </div>

    <div class="bs-panel">
      <h3 style="font-size:1rem; margin-bottom:12px;">Run payroll</h3>
      <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
        <div>
          <label class="pr-meta">Month</label>
          <select id="payMonth">${MONTHS.slice(1).map((m,i) => `<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${m}</option>`).join('')}</select>
        </div>
        <div>
          <label class="pr-meta">Year</label>
          <input id="payYear" type="number" value="${now.getFullYear()}" style="width:90px;">
        </div>
        <button class="btn primary" id="runPayrollBtn">Run payroll</button>
      </div>
      <div id="payslipResults" style="margin-top:16px;"></div>
    </div>
  `;

  document.getElementById('addEmpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      business_id: ctx.business.id,
      full_name: fd.get('full_name'),
      staff_role: fd.get('staff_role') || null,
      basic_salary: Number(fd.get('basic_salary')) || 0,
      housing_allowance: Number(fd.get('housing_allowance')) || 0,
      transport_allowance: Number(fd.get('transport_allowance')) || 0,
      other_allowance: Number(fd.get('other_allowance')) || 0,
      bank_name: fd.get('bank_name') || null,
      bank_account_number: fd.get('bank_account_number') || null,
      pension_opt_in: fd.get('pension_opt_in') === 'on',
      nhf_opt_in: fd.get('nhf_opt_in') === 'on',
    };
    if (employees.length >= ctx.subscription.employee_limit) {
      toast(`Plan limit reached (${ctx.subscription.employee_limit}). Upgrade to add more.`);
      return;
    }
    const { error } = await ctx.supabase.from('payroll_employees').insert(payload);
    if (error) { toast(error.message); return; }
    toast('Employee added');
    renderApp(ctx);
  });

  area.querySelectorAll('.remove-emp').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this employee from payroll?')) return;
      await ctx.supabase.from('payroll_employees').update({ active: false }).eq('id', btn.dataset.id);
      toast('Employee removed');
      renderApp(ctx);
    });
  });

  document.getElementById('runPayrollBtn').addEventListener('click', async () => {
    const btn = document.getElementById('runPayrollBtn');
    btn.disabled = true;
    btn.textContent = 'Running…';
    try {
      const result = await callFn('run-payroll', ctx.session, {
        business_id: ctx.business.id,
        period_month: Number(document.getElementById('payMonth').value),
        period_year: Number(document.getElementById('payYear').value),
      });
      const wrap = document.getElementById('payslipResults');
      wrap.innerHTML = result.payslips.map(p => `
        <div class="pr-row">
          <div>
            <div class="pr-name">Net pay: <span class="pr-amount">${naira(p.net_pay)}</span></div>
          </div>
          ${p.pdf_signed_url ? `<a class="btn small" href="${p.pdf_signed_url}" target="_blank" rel="noopener">Download payslip</a>` : ''}
        </div>
      `).join('');
      toast(`${result.count} payslip(s) generated`);
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Run payroll';
    }
  });
}

(async function init() {
  const ctx = await window.PayrollGuard.requireAccess();
  if (!ctx) return;

  if (!ctx.subActive) {
    renderPlanPicker(ctx);
  } else {
    renderApp(ctx);
  }
})();
