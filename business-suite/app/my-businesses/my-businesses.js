// ---------- My Businesses (multi-client dashboard) ----------
const ROLE_LABELS = { owner: 'Owner', staff: 'Staff', accountant: 'Accountant', lawyer: 'Lawyer', hr: 'HR', finance: 'Finance' };

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

(async function init() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });
  const session = await window.KoboAuth.getSession();
  if (!session) {
    window.location.href = '/business-suite/';
    return;
  }

  const { supabase, businesses } = await window.BizSuiteGuard.listMyBusinesses();
  const grid = document.getElementById('bizGrid');

  if (!businesses.length) {
    grid.innerHTML = '<div class="empty-note">No businesses yet — start a Business Suite trial or ask an owner to add you as a team member.</div>';
    return;
  }

  grid.innerHTML = '';

  for (const biz of businesses) {
    const [{ data: obligations }, { data: documents }] = await Promise.all([
      supabase.from('compliance_obligations').select('due_date, status').eq('business_id', biz.id),
      supabase.from('compliance_documents').select('expiry_date').eq('business_id', biz.id).not('expiry_date', 'is', null),
    ]);

    const obligationsList = obligations || [];
    const documentsList = documents || [];
    const overdue = obligationsList.filter(o => o.status !== 'completed' && o.status !== 'waived' && (daysUntil(o.due_date) ?? 0) < 0).length;
    const dueSoon = obligationsList.filter(o => {
      const d = daysUntil(o.due_date);
      return o.status !== 'completed' && o.status !== 'waived' && d !== null && d >= 0 && d <= 30;
    }).length;
    const expiring = documentsList.filter(d => (daysUntil(d.expiry_date) ?? 999) <= 30).length;

    const trackedTotal = obligationsList.length + documentsList.length;
    const atRisk = overdue + documentsList.filter(d => (daysUntil(d.expiry_date) ?? 999) < 0).length;
    const score = trackedTotal === 0 ? null : Math.round(100 * (1 - atRisk / trackedTotal));
    const scoreClass = score === null ? '' : score >= 90 ? 'good' : score >= 60 ? 'warn' : 'bad';

    const card = document.createElement('a');
    card.className = 'biz-card suite-card';
    card.href = `/business-suite/app/compliance-tracker/?business_id=${biz.id}`;
    card.innerHTML = `
      <div class="name">${biz.name}</div>
      <div class="role">${ROLE_LABELS[biz.myRole] || biz.myRole}</div>
      <div class="row"><span>Compliance score</span><span class="num ${scoreClass}">${score === null ? 'Set up' : score + '%'}</span></div>
      <div class="row"><span>Overdue</span><span class="num ${overdue > 0 ? 'bad' : ''}">${overdue}</span></div>
      <div class="row"><span>Due in 30 days</span><span class="num ${dueSoon > 0 ? 'warn' : ''}">${dueSoon}</span></div>
      <div class="row"><span>Documents expiring</span><span class="num ${expiring > 0 ? 'warn' : ''}">${expiring}</span></div>
    `;
    grid.appendChild(card);
  }
})();
