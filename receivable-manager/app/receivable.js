// ---------- Receivable Manager ----------
const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (isoDate) => isoDate
  ? new Date(isoDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';
const fmtDateTime = (iso) => iso
  ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

function daysOverdue(dueDate) {
  if (!dueDate) return null;
  const ms = new Date().setHours(0, 0, 0, 0) - new Date(dueDate).setHours(0, 0, 0, 0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function daysBetween(fromIso, toIso) {
  const ms = new Date(toIso).setHours(0, 0, 0, 0) - new Date(fromIso).setHours(0, 0, 0, 0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

function agingBucket(days) {
  if (days === null || days <= 0) return 'current';
  if (days <= 30) return 'b1';
  if (days <= 60) return 'b2';
  if (days <= 90) return 'b3';
  return 'b4';
}

const BUCKET_LABEL = { current: 'Current', b1: '1–30d overdue', b2: '31–60d overdue', b3: '61–90d overdue', b4: '90+ days overdue' };

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2600);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Paywall / plan picker ----------
const STARTER_FEATURES = [
  'AR aging dashboard & client ledger',
  'WhatsApp payment reminders',
  'Promise-to-pay tracking',
  'Bank/payment statement reconciliation',
  'Payment date prediction',
  'Customer collection score',
  'PDF client statements'
];
const GROWTH_FEATURES = [
  'Everything in Starter, plus:',
  'AI-generated daily collection priorities',
  'AI collections agent (negotiation drafting)',
  'Dispute & missing-document tracking',
  'Cash-flow forecasting',
  'DSO driver breakdown',
  'Escalation engine (formal notices, referrals)',
  'Team assignment & workload analytics',
  'Full analytics charts & graphs'
];

function renderPlanPicker(ctx) {
  const area = document.getElementById('mainArea');
  const featureList = (items) => items.map(f => `<li style="font-size:0.8rem; padding:3px 0;">${escapeHtml(f)}</li>`).join('');
  area.innerHTML = `
    <div class="bs-panel">
      <p style="margin-bottom:16px; text-align:center;">No active Receivable Manager plan for <strong>${escapeHtml(ctx.business.name)}</strong> yet. Track outstanding balances, chase overdue payments, and see your DSO at a glance — no invoicing software required.</p>
      <div style="display:flex; justify-content:center; margin-bottom:16px;">
        <div style="display:inline-flex; border:1px solid var(--line); border-radius:8px; overflow:hidden;">
          <button id="cycleMonthlyBtn" class="btn small" style="border-radius:0;">Monthly</button>
          <button id="cycleYearlyBtn" class="btn small" style="border-radius:0;">Yearly (2 months free)</button>
        </div>
      </div>
      <div class="plans-grid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px; max-width:640px; margin:0 auto;">
        <div class="plan-card">
          <h3>Starter</h3>
          <div class="plan-price" data-price-starter>₦20,000<span style="font-size:0.7rem;">/mo</span></div>
          <ul style="text-align:left; list-style:none; padding:0; margin:10px 0 14px;">${featureList(STARTER_FEATURES)}</ul>
          <button class="btn primary" data-plan="starter">Subscribe to Starter</button>
        </div>
        <div class="plan-card" style="border-color:var(--accent, #2f8a4e);">
          <h3>Growth</h3>
          <div class="plan-price" data-price-growth>₦30,000<span style="font-size:0.7rem;">/mo</span></div>
          <p style="font-size:0.72rem; opacity:0.7; margin-top:-6px; margin-bottom:6px;">21-day free trial included</p>
          <ul style="text-align:left; list-style:none; padding:0; margin:10px 0 14px;">${featureList(GROWTH_FEATURES)}</ul>
          <button class="btn primary" data-plan="growth">Subscribe to Growth</button>
        </div>
      </div>
    </div>
  `;

  let cycle = 'monthly';
  const prices = { starter: { monthly: '₦20,000/mo', yearly: '₦200,000/yr' }, growth: { monthly: '₦30,000/mo', yearly: '₦300,000/yr' } };
  function applyCycle() {
    document.querySelector('[data-price-starter]').innerHTML = prices.starter[cycle].replace(/\/(mo|yr)/, m => `<span style="font-size:0.7rem;">${m}</span>`);
    document.querySelector('[data-price-growth]').innerHTML = prices.growth[cycle].replace(/\/(mo|yr)/, m => `<span style="font-size:0.7rem;">${m}</span>`);
    document.getElementById('cycleMonthlyBtn').classList.toggle('primary', cycle === 'monthly');
    document.getElementById('cycleYearlyBtn').classList.toggle('primary', cycle === 'yearly');
  }
  document.getElementById('cycleMonthlyBtn').addEventListener('click', () => { cycle = 'monthly'; applyCycle(); });
  document.getElementById('cycleYearlyBtn').addEventListener('click', () => { cycle = 'yearly'; applyCycle(); });
  applyCycle();

  area.querySelectorAll('[data-plan]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.KoboSubscribe.start('init-receivable-payment', {
        business_id: ctx.business.id,
        billing_cycle: cycle,
        plan: btn.dataset.plan
      });
    });
  });
}

function growthUpsellHtml(featureName) {
  return `<div class="empty-note" style="padding:14px; text-align:center;">
    <div style="margin-bottom:8px;">${escapeHtml(featureName)} is part of the <strong>Growth</strong> plan.</div>
    <button id="upsellBtn-${featureName.replace(/[^a-zA-Z0-9]/g, '')}" class="btn primary small" data-upsell>Upgrade to Growth</button>
  </div>`;
}

function renderPageHeader(ctx) {
  const header = document.getElementById('pageHeader');
  if (!header) return;
  const badge = ctx.isTrialing
    ? `<span class="trial-badge">Free trial — ${ctx.trialDaysLeft} day${ctx.trialDaysLeft === 1 ? '' : 's'} left</span>`
    : ctx.subActive
    ? `<span class="trial-badge" style="background:rgba(47,138,78,0.12); color:#2f8a4e; border-color:rgba(47,138,78,0.3);">${ctx.effectivePlan === 'growth' ? 'Growth' : 'Starter'} plan</span>`
    : '';
  header.innerHTML = `
    <div>
      <h1 style="font-size:1.4rem;">${escapeHtml(ctx.business.name)}</h1>
      <p style="font-size:0.88rem; opacity:0.7; margin-top:4px;">Receivable Manager — outstanding balances, overdue payments, and DSO at a glance.</p>
      <div>${badge}</div>
    </div>
    ${ctx.subActive ? `<button id="headerPlanBtn" class="btn small">${ctx.isTrialing ? 'Choose a plan' : 'Manage plan'}</button>` : ''}
  `;
  const planBtn = document.getElementById('headerPlanBtn');
  if (planBtn) planBtn.addEventListener('click', () => renderPlanPicker(ctx, true));
}

(async function init() {
  const ctx = await window.ReceivableGuard.requireAccess();
  if (!ctx) return;

  renderPageHeader(ctx);

  if (!ctx.subActive) {
    renderPlanPicker(ctx);
    return;
  }

  const { business, supabase, session } = ctx;
  const isGrowth = ctx.effectivePlan === 'growth';

  async function logActivity(action, details = {}, clientId = null) {
    await supabase.from('credit_audit_log').insert({
      business_id: business.id,
      client_id: clientId,
      actor_user_id: session.user.id,
      action,
      details
    });
  }

  const area = document.getElementById('mainArea');
  area.innerHTML = `
    <div class="rm-view" id="view-overview" data-view="overview">
      <div class="rm-view-header"><h2>Overview</h2><p>Your Days Sales Outstanding, what's driving it, and a quick daily summary.</p></div>
      <div class="bs-panel" id="panel-daily-summary">
        <strong style="font-size:0.9rem;">How things are going</strong>
        <div id="dailySummaryWrap" style="margin-top:10px;">
          <div class="empty-note">Loading…</div>
        </div>
      </div>
      <div class="bs-panel" id="panel-overview">
        <div id="dsoPanel"></div>
      </div>
    </div>
    <div class="rm-view" id="view-priorities" data-view="priorities">
      <div class="rm-view-header"><h2>Today's priorities</h2><p>Who to chase today, ranked by amount owed, how overdue, and broken promises.</p></div>
      <div class="bs-panel" id="panel-priorities">
        <div style="display:flex; justify-content:flex-end;">
          ${isGrowth ? '<button id="priorityRefreshBtn" class="btn small">Refresh</button>' : ''}
        </div>
        <div id="priorityMeta" style="font-size:0.72rem; opacity:0.55; margin-top:6px;"></div>
        <div id="priorityWrap" style="margin-top:14px;">${isGrowth ? '' : growthUpsellHtml("Today's priorities")}</div>
      </div>
    </div>
    <div class="rm-view" id="view-recon" data-view="recon">
      <div class="rm-view-header"><h2>Reconcile bank statement</h2><p>Upload a CSV export from your business bank account. We match incoming payments to outstanding balances so you don't have to log them one by one.</p></div>
      <div class="bs-panel" id="panel-recon">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <input type="file" id="reconFileInput" accept=".csv" />
          <button id="reconConfirmAllBtn" class="btn small" style="display:none;">Confirm all strong matches</button>
        </div>
        <div id="reconSummary" style="font-size:0.78rem; opacity:0.65; margin-top:8px;"></div>
        <div id="reconWrap" style="margin-top:14px;"></div>
      </div>
    </div>
    <div class="rm-view" id="view-cashflow" data-view="cashflow">
      <div class="rm-view-header"><h2>Cash-flow forecast</h2><p>When your outstanding balances are actually expected to land, based on each client's payment history — not just when they're due.</p></div>
      <div class="bs-panel" id="panel-cashflow">
        ${isGrowth ? `
        <div id="forecastStats" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px;"></div>
        <div style="position:relative; height:220px; margin-top:14px;"><canvas id="chartCashFlow"></canvas></div>
        <div id="forecastNote" style="font-size:0.72rem; opacity:0.55; margin-top:8px;"></div>
        ` : growthUpsellHtml('Cash-flow forecasting')}
      </div>
    </div>
    <div class="rm-view" id="view-team" data-view="team">
      <div class="rm-view-header"><h2>Team workload</h2><p>Who's carrying what across your team, and how they're recovering.</p></div>
      <div class="bs-panel" id="panel-team">
        <div id="workforceWrap">${isGrowth ? '' : growthUpsellHtml('Team workload')}</div>
      </div>
    </div>
    <div class="rm-view" id="view-aging" data-view="aging">
      <div class="rm-view-header"><h2>Aging summary</h2><p>Your outstanding balance broken down by how overdue it is.</p></div>
      <div class="bs-panel" id="panel-aging">
        <div class="aging-grid" id="agingGrid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px;"></div>
      </div>
    </div>
    <div class="rm-view" id="view-analytics" data-view="analytics">
      <div class="rm-view-header"><h2>Analytics</h2><p>Charts on aging, top debtors, collections, and DSO trend.</p></div>
      <div class="bs-panel" id="panel-analytics">
        ${isGrowth ? `
        <div id="analyticsEmpty" class="empty-note" style="display:none;">Add a few outstanding balances to see your analytics.</div>
        <div id="analyticsGrid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:20px;">
          <div style="position:relative; height:220px;">
            <div style="font-size:0.78rem; opacity:0.65; margin-bottom:6px;">Aging distribution</div>
            <canvas id="chartAging"></canvas>
          </div>
          <div style="position:relative; height:220px;">
            <div style="font-size:0.78rem; opacity:0.65; margin-bottom:6px;">Top 5 outstanding balances</div>
            <canvas id="chartTopDebtors"></canvas>
          </div>
          <div style="position:relative; height:220px;">
            <div style="font-size:0.78rem; opacity:0.65; margin-bottom:6px;">Collected vs. new balances (6 months)</div>
            <canvas id="chartMonthly"></canvas>
          </div>
          <div style="position:relative; height:220px;">
            <div style="font-size:0.78rem; opacity:0.65; margin-bottom:6px;">DSO trend (6 months)</div>
            <canvas id="chartDSOTrend"></canvas>
          </div>
        </div>
        ` : growthUpsellHtml('Analytics charts & graphs')}
      </div>
    </div>
    <div class="rm-view" id="view-ledger" data-view="ledger">
      <div class="rm-view-header"><h2>Outstanding by client</h2><p>Every client with a balance owed, plus a form to add a new one.</p></div>
      <div class="bs-panel" id="panel-addbalance">
        <strong style="font-size:0.9rem;">Add an outstanding balance</strong>
        <div id="entryForm" style="margin-top:12px;"></div>
      </div>
      <div class="bs-panel" id="panel-ledger">
        <div style="display:flex; justify-content:flex-end;">
          <select id="assigneeFilter" style="font-size:0.78rem; ${isGrowth ? '' : 'display:none;'}">
            <option value="">All accounts</option>
            <option value="__unassigned">Unassigned</option>
          </select>
        </div>
        <div id="ledgerWrap" style="margin-top:10px;"></div>
      </div>
    </div>
    <div class="rm-view" id="view-promises" data-view="promises">
      <div class="rm-view-header"><h2>Promises to pay</h2><p>Commitments clients have made, and whether they were kept.</p></div>
      <div class="bs-panel" id="panel-promises">
        <div id="promiseWrap"></div>
      </div>
    </div>
    <div class="rm-view" id="view-activity" data-view="activity">
      <div class="rm-view-header"><h2>Recent activity</h2><p>A running log of everything logged against your receivables.</p></div>
      <div class="bs-panel" id="panel-activity">
        <div id="activityWrap"></div>
      </div>
    </div>
    <div class="rm-view" id="view-reminders" data-view="reminders">
      <div class="rm-view-header"><h2>Automated reminders</h2><p>Sends an email automatically to any client with an email on file once their balance crosses a day threshold below. Checked once daily.</p></div>
      <div class="bs-panel" id="panel-reminders">
        <div id="reminderSettings"></div>
      </div>
    </div>
  `;

  const RM_VIEWS = ['overview', 'priorities', 'recon', 'cashflow', 'team', 'aging', 'analytics', 'ledger', 'promises', 'activity', 'reminders'];
  let rmDataLoaded = false; // becomes true once the initial data load completes — guards against
  // re-rendering Chart.js canvases before there's data, while still fixing
  // the zero-size-canvas issue when a chart's tab was hidden at draw time.
  function showRmView(key) {
    if (!RM_VIEWS.includes(key)) key = 'overview';
    RM_VIEWS.forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.classList.toggle('active', v === key);
    });
    document.querySelectorAll('.suite-nav .rm-anchor').forEach(a => {
      a.classList.toggle('suite-nav-active', a.dataset.view === key);
    });
    if (rmDataLoaded) {
      if (key === 'analytics') renderAnalytics();
      if (key === 'cashflow') renderCashFlowForecast();
    }
    window.scrollTo(0, 0);
  }
  function routeRmFromHash() {
    showRmView((window.location.hash || '#/overview').replace('#/', ''));
  }
  window.addEventListener('hashchange', routeRmFromHash);
  routeRmFromHash();

  area.addEventListener('click', (e) => {
    if (e.target.id === 'trialUpgradeBtn' || e.target.dataset.upsell !== undefined) {
      renderPlanPicker(ctx);
    }
  });

  let clients = [];
  let receivables = [];
  let promises = [];
  let notes = [];
  let activity = [];
  let disputes = [];
  let docRequests = [];
  let escalationActions = [];
  let teamMembers = [];
  let assignments = [];
  let byClient = {};
  let paymentEvents = [];
  let paymentBehaviour = {}; // client_id -> { avgDelay, count }
  const charts = {};

  // ---------- Payment prediction (deterministic, from paid history) ----------
  function computePaymentBehaviour() {
    const delaysByClient = {};
    paymentEvents.forEach(pe => {
      const rv = receivables.find(r => r.id === pe.receivable_id);
      if (!rv || !rv.due_date) return;
      const delay = daysBetween(rv.due_date, pe.paid_at);
      (delaysByClient[rv.client_id] ||= []).push(delay);
    });
    const result = {};
    Object.keys(delaysByClient).forEach(cid => {
      const arr = delaysByClient[cid];
      result[cid] = { avgDelay: arr.reduce((s, d) => s + d, 0) / arr.length, count: arr.length };
    });
    paymentBehaviour = result;
  }

  function predictedPaymentDate(rv) {
    if (!rv.due_date) return null;
    const stats = paymentBehaviour[rv.client_id];
    if (!stats) return null;
    return { date: addDays(rv.due_date, stats.avgDelay), count: stats.count, avgDelay: stats.avgDelay };
  }

  // ---------- Customer collection score (0-100, deterministic) ----------
  const BUCKET_PENALTY = { current: 0, b1: 8, b2: 18, b3: 30, b4: 45 };

  function computeCollectionScore(cid) {
    const row = byClient[cid];
    if (!row) return null;

    let score = 100;
    const reasons = [];

    const overduePenalty = BUCKET_PENALTY[row.worstBucket] || 0;
    score -= overduePenalty;
    if (overduePenalty > 0) reasons.push(`${BUCKET_LABEL[row.worstBucket].toLowerCase()} currently`);

    const behaviour = paymentBehaviour[cid];
    if (behaviour) {
      if (behaviour.avgDelay > 0) {
        const latePenalty = Math.min(behaviour.avgDelay, 60) / 60 * 25;
        score -= latePenalty;
        reasons.push(`pays ~${Math.round(behaviour.avgDelay)}d late on average`);
      } else if (behaviour.avgDelay < 0) {
        const earlyBonus = Math.min(-behaviour.avgDelay, 30) / 30 * 10;
        score += earlyBonus;
        reasons.push('typically pays early');
      } else {
        reasons.push('pays on the due date');
      }
    }

    const clientPromiseList = clientPromises(cid);
    if (clientPromiseList.length) {
      const brokenCount = clientPromiseList.filter(p => p.status === 'broken').length;
      const brokenRatio = brokenCount / clientPromiseList.length;
      if (brokenRatio > 0) {
        score -= brokenRatio * 25;
        reasons.push(`broke ${brokenCount} of ${clientPromiseList.length} promise${clientPromiseList.length > 1 ? 's' : ''} to pay`);
      }
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    let tier = 'Poor';
    if (score >= 85) tier = 'Excellent';
    else if (score >= 70) tier = 'Good';
    else if (score >= 50) tier = 'Fair';
    else if (score >= 30) tier = 'Watch';

    const limitedHistory = !behaviour && !clientPromiseList.length;
    return { score, tier, reasons, limitedHistory };
  }

  const SCORE_TIER_COLOR = {
    Excellent: '#2f8a4e', Good: '#4a8f3c', Fair: '#b3902e', Watch: '#c46a1f', Poor: '#b3402e'
  };

  // ---------- Escalation engine (deterministic ladder: reminder -> firm reminder -> formal notice -> collections/legal) ----------
  const ESCALATION_LABEL = {
    1: 'Friendly reminder',
    2: 'Firm reminder',
    3: 'Formal notice',
    4: 'Collections / legal referral'
  };
  const ESCALATION_COLOR = { 1: '#4a8f3c', 2: '#b3902e', 3: '#c46a1f', 4: '#b3402e' };

  function computeEscalationStage(cid) {
    const row = byClient[cid];
    if (!row) return null;

    const activeItems = row.items.filter(i => !i.dispute && !i.docRequest);
    if (!activeItems.length) return null; // nothing actionable — fully blocked by dispute/missing document, or nothing outstanding

    const days = activeItems.reduce((max, i) => (i.overdueDays !== null && (max === null || i.overdueDays > max)) ? i.overdueDays : max, null);
    const brokenCount = clientPromises(cid).filter(p => p.status === 'broken').length;

    let stage, reason;
    if ((days !== null && days > 90) || brokenCount >= 2) {
      stage = 4;
      reason = brokenCount >= 2 ? `${brokenCount} broken promises to pay on record` : `${days} days overdue with no resolution`;
    } else if ((days !== null && days > 45) || brokenCount >= 1) {
      stage = 3;
      reason = brokenCount >= 1 ? 'broke a promise to pay' : `${days} days overdue`;
    } else if (days !== null && days > 14) {
      stage = 2;
      reason = `${days} days overdue`;
    } else {
      stage = 1;
      reason = days === null ? 'not yet due' : `${days} day${days === 1 ? '' : 's'} overdue`;
    }

    return { stage, label: ESCALATION_LABEL[stage], reason, days, brokenCount };
  }

  function clientEscalationHistory(cid) {
    return escalationActions.filter(e => e.client_id === cid);
  }

  async function generateFormalNotice(cid) {
    const row = byClient[cid];
    const client = row.client;
    const escalation = computeEscalationStage(cid);

    const rows = row.items.filter(i => !i.dispute && !i.docRequest).map(rv => [
      rv.description || 'Balance',
      fmtDate(rv.due_date),
      naira(rv.balance)
    ]);
    const totalDue = row.items.filter(i => !i.dispute && !i.docRequest).reduce((s, i) => s + i.balance, 0);

    const bodyIntro = `This letter serves as formal notice that the amount of ${naira(totalDue)} remains outstanding on your account with ${business.name}${escalation && escalation.days !== null ? `, now ${escalation.days} days past the agreed due date` : ''}. A breakdown of the outstanding balance is set out below.\n\nWe request that this balance be settled within 7 days of the date of this notice. If payment has already been made, please disregard this notice and share proof of payment so we can update our records.\n\nShould the balance remain unpaid after this period, we may have no option but to refer this matter to a third party for further collection action.`;

    const doc = await window.KoboExport.buildLetterPdf({
      letterhead: business.name,
      dateLine: `${fmtDate(new Date().toISOString())}\n\nTo: ${client.name}${client.address ? '\n' + client.address : ''}`,
      bodyText: `FORMAL NOTICE OF OUTSTANDING BALANCE\n\n${bodyIntro}\n\n` +
        rows.map(r => `${r[0]} — due ${r[1]} — ${r[2]}`).join('\n') +
        `\n\nTotal outstanding: ${naira(totalDue)}\n\nRegards,\n${business.name}`
    });

    window.KoboExport.download(`Formal-Notice-${(client.name || 'customer').replace(/\s+/g, '-')}.pdf`, doc);

    await supabase.from('escalation_actions').insert({
      business_id: business.id, client_id: cid, stage: 3, action_type: 'formal_notice',
      created_by: session.user.id
    });
    await logActivity('formal_notice_generated', { balance: totalDue }, cid);
  }

  // ---------- Workforce management (assign accounts, track recovery per team member) ----------
  function computeTeamWorkload() {
    const since30 = new Date(); since30.setDate(since30.getDate() - 30);

    const byMember = {}; // user_id -> { member, accountCount, outstanding, collected30, scores: [] }
    let unassignedOutstanding = 0, unassignedCount = 0;

    Object.keys(byClient).forEach(cid => {
      const row = byClient[cid];
      const assignment = assignmentFor(cid);
      if (!assignment) {
        unassignedOutstanding += row.balance;
        unassignedCount++;
        return;
      }
      const uid = assignment.assigned_to;
      if (!byMember[uid]) byMember[uid] = { member: memberByUserId(uid), userId: uid, accountCount: 0, outstanding: 0, collected30: 0, scores: [] };
      byMember[uid].accountCount++;
      byMember[uid].outstanding += row.balance;
      const scoreInfo = computeCollectionScore(cid);
      if (scoreInfo) byMember[uid].scores.push(scoreInfo.score);

      const clientReceivableIds = new Set(receivables.filter(rv => rv.client_id === cid).map(rv => rv.id));
      const collected30 = paymentEvents
        .filter(p => clientReceivableIds.has(p.receivable_id) && new Date(p.paid_at) >= since30)
        .reduce((s, p) => s + Number(p.amount), 0);
      byMember[uid].collected30 += collected30;
    });

    const rows = Object.values(byMember).map(m => ({
      ...m,
      avgScore: m.scores.length ? Math.round(m.scores.reduce((s, v) => s + v, 0) / m.scores.length) : null
    })).sort((a, b) => b.outstanding - a.outstanding);

    return { rows, unassignedOutstanding, unassignedCount };
  }

  function renderTeamWorkload() {
    if (!isGrowth) return;
    const wrap = document.getElementById('workforceWrap');
    if (!teamMembers.length) {
      wrap.innerHTML = '<div class="empty-note">No team members yet — invite staff from your business settings to assign accounts.</div>';
      return;
    }

    const { rows, unassignedOutstanding, unassignedCount } = computeTeamWorkload();

    if (!rows.length) {
      wrap.innerHTML = `<div class="empty-note">No accounts assigned yet. Open a client and use "Assign to" to split up the book.${unassignedCount ? ` ${unassignedCount} account${unassignedCount > 1 ? 's' : ''} (${naira(unassignedOutstanding)}) unassigned.` : ''}</div>`;
      return;
    }

    wrap.innerHTML = `
      <table style="width:100%; font-size:0.85rem;">
        <thead><tr>
          <th style="text-align:left;">Team member</th>
          <th style="text-align:left;">Accounts</th>
          <th style="text-align:left;">Outstanding</th>
          <th style="text-align:left;">Collected (30d)</th>
          <th style="text-align:left;">Avg. book score</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${escapeHtml(memberLabel(r.member))}</td>
              <td>${r.accountCount}</td>
              <td>${naira(r.outstanding)}</td>
              <td style="color:#2f8a4e;">${naira(r.collected30)}</td>
              <td>${r.avgScore === null ? '—' : `<span style="color:${SCORE_TIER_COLOR[r.avgScore >= 85 ? 'Excellent' : r.avgScore >= 70 ? 'Good' : r.avgScore >= 50 ? 'Fair' : r.avgScore >= 30 ? 'Watch' : 'Poor']};">${r.avgScore}</span>`}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${unassignedCount ? `<div style="font-size:0.78rem; opacity:0.65; margin-top:10px;">${unassignedCount} account${unassignedCount > 1 ? 's' : ''} unassigned — ${naira(unassignedOutstanding)} outstanding.</div>` : ''}
    `;
  }

  function populateAssigneeFilter() {
    const select = document.getElementById('assigneeFilter');
    const current = select.value;
    const existingOptions = new Set(['', '__unassigned']);
    teamMembers.forEach(m => {
      if (existingOptions.has(m.user_id)) return;
      existingOptions.add(m.user_id);
      const opt = document.createElement('option');
      opt.value = m.user_id;
      opt.textContent = memberLabel(m);
      select.appendChild(opt);
    });
    select.value = current;
  }

  // ---------- Cash-flow forecast (deterministic, from expected payment dates) ----------
  function forecastBucket(days) {
    if (days <= 7) return '0-7';
    if (days <= 30) return '8-30';
    if (days <= 90) return '31-90';
    return '90+';
  }

  function computeCashFlowForecast() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const buckets = { '0-7': 0, '8-30': 0, '31-90': 0, '90+': 0 };
    let blockedTotal = 0;
    let noDateTotal = 0;

    receivables.filter(rv => rv.payment_status !== 'paid').forEach(rv => {
      const balance = Number(rv.amount) - Number(rv.amount_paid || 0);
      if (balance <= 0) return;
      if (openDisputeFor(rv.id) || openDocRequestFor(rv.id)) { blockedTotal += balance; return; }

      const predicted = predictedPaymentDate(rv);
      const expectedDateStr = predicted ? predicted.date : rv.due_date;
      if (!expectedDateStr) { noDateTotal += balance; return; }

      const days = Math.max(0, daysBetween(todayStr, expectedDateStr));
      buckets[forecastBucket(days)] += balance;
    });

    return { buckets, blockedTotal, noDateTotal };
  }

  function renderCashFlowForecast() {
    if (!isGrowth) return;
    const { buckets, blockedTotal, noDateTotal } = computeCashFlowForecast();
    const within7 = buckets['0-7'];
    const within30 = within7 + buckets['8-30'];
    const within90 = within30 + buckets['31-90'];

    document.getElementById('forecastStats').innerHTML = `
      <div style="border:1px solid var(--line); border-radius:8px; padding:10px; text-align:center;">
        <div style="font-size:0.72rem; opacity:0.65;">Next 7 days</div>
        <div class="pr-amount" style="margin-top:4px;">${naira(within7)}</div>
      </div>
      <div style="border:1px solid var(--line); border-radius:8px; padding:10px; text-align:center;">
        <div style="font-size:0.72rem; opacity:0.65;">Next 30 days</div>
        <div class="pr-amount" style="margin-top:4px;">${naira(within30)}</div>
      </div>
      <div style="border:1px solid var(--line); border-radius:8px; padding:10px; text-align:center;">
        <div style="font-size:0.72rem; opacity:0.65;">Next 90 days</div>
        <div class="pr-amount" style="margin-top:4px;">${naira(within90)}</div>
      </div>
    `;

    drawChart('chartCashFlow', {
      type: 'bar',
      data: {
        labels: ['0-7 days', '8-30 days', '31-90 days', '90+ days'],
        datasets: [{ data: [buckets['0-7'], buckets['8-30'], buckets['31-90'], buckets['90+']], backgroundColor: CHART_COLORS.inkGreenDeep, borderRadius: 4 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => naira(ctx.raw) } } },
        scales: { y: { ticks: { callback: (v) => '\u20a6' + Number(v).toLocaleString('en-NG') } } }
      }
    });

    const notes = [];
    if (blockedTotal > 0) notes.push(`${naira(blockedTotal)} excluded \u2014 dispute or missing document pending`);
    if (noDateTotal > 0) notes.push(`${naira(noDateTotal)} has no due date on file, so it isn't placed on the timeline`);
    document.getElementById('forecastNote').textContent = notes.join(' \u00b7 ') || 'Every outstanding balance is accounted for above.';
  }

  async function logPaymentForReceivable(receivableId, amountNum, clientId, paidAtIso) {
    const item = receivables.find(i => i.id === receivableId);
    if (!item) return { error: 'Receivable not found' };

    const newAmountPaid = Number(item.amount_paid || 0) + amountNum;
    const newStatus = newAmountPaid >= Number(item.amount) ? 'paid' : 'partial';

    const { error } = await supabase.from('receivables')
      .update({ amount_paid: newAmountPaid, payment_status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', receivableId);
    if (error) return { error: error.message };

    // Best-effort: if this receivable came from a Business Suite invoice
    // (document_id set), keep the invoice's own amount_paid/payment_status
    // in sync too — so the invoice list and this dashboard never disagree.
    if (item.document_id) {
      try {
        await supabase.from('documents')
          .update({ amount_paid: newAmountPaid, payment_status: newStatus })
          .eq('id', item.document_id);
      } catch (e) { /* invoice may have been deleted — fine, receivable still updated */ }
    }

    const paymentRow = { receivable_id: receivableId, business_id: business.id, amount: amountNum, created_by: session.user.id };
    if (paidAtIso) paymentRow.paid_at = paidAtIso;
    await supabase.from('receivable_payments').insert(paymentRow);

    await logActivity('payment_logged', { amount: amountNum }, clientId);
    return { error: null };
  }

  async function loadAll() {
    const [c, r, p, n, a, pe, d, dr, ea, tm, asg] = await Promise.all([
      supabase.from('clients').select('id, name, phone, email, credit_limit, address').eq('business_id', business.id).order('name', { ascending: true }),
      supabase.from('receivables').select('id, client_id, description, amount, amount_paid, due_date, payment_status, source, document_id, created_at').eq('business_id', business.id).order('due_date', { ascending: true }),
      supabase.from('promise_to_pay').select('id, client_id, promised_date, promised_amount, note, status, created_at').eq('business_id', business.id).order('promised_date', { ascending: true }),
      supabase.from('collection_notes').select('id, client_id, note, created_at').eq('business_id', business.id).order('created_at', { ascending: false }),
      supabase.from('credit_audit_log').select('id, client_id, action, details, created_at, clients(name)').eq('business_id', business.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('receivable_payments').select('id, receivable_id, amount, paid_at').eq('business_id', business.id).order('paid_at', { ascending: true }),
      supabase.from('receivable_disputes').select('id, receivable_id, client_id, reason, description, status, resolution_note, created_at, resolved_at').eq('business_id', business.id).order('created_at', { ascending: false }),
      supabase.from('receivable_document_requests').select('id, receivable_id, client_id, doc_type, description, status, requested_at, received_at').eq('business_id', business.id).order('requested_at', { ascending: false }),
      supabase.from('escalation_actions').select('id, client_id, stage, action_type, note, created_at').eq('business_id', business.id).order('created_at', { ascending: false }),
      supabase.from('business_members').select('id, user_id, role, member_name, member_email').eq('business_id', business.id),
      supabase.from('receivable_assignments').select('id, client_id, assigned_to, created_at').eq('business_id', business.id)
    ]);
    clients = c.data || [];
    receivables = r.data || [];
    promises = p.data || [];
    notes = n.data || [];
    activity = a.data || [];
    paymentEvents = pe.data || [];
    disputes = d.data || [];
    docRequests = dr.data || [];
    escalationActions = ea.data || [];
    teamMembers = tm.data || [];
    assignments = asg.data || [];
  }

  function memberLabel(member) {
    if (!member) return 'Unknown';
    return member.member_name || member.member_email || 'Team member';
  }

  function memberByUserId(userId) {
    return teamMembers.find(m => m.user_id === userId) || null;
  }

  function assignmentFor(cid) {
    return assignments.find(a => a.client_id === cid) || null;
  }

  const DISPUTE_REASON_LABEL = {
    missing_po: 'Missing PO',
    quality_issue: 'Quality issue',
    pricing_disagreement: 'Pricing disagreement',
    goods_not_received: 'Goods not received',
    duplicate_billing: 'Duplicate billing',
    already_paid_claim: 'Client claims already paid',
    other: 'Other'
  };

  const DOC_TYPE_LABEL = {
    purchase_order: 'Purchase order',
    delivery_note: 'Delivery note',
    tax_invoice: 'Tax invoice',
    goods_received_note: 'Goods received note',
    contract: 'Signed contract',
    other: 'Other document'
  };

  function openDisputeFor(receivableId) {
    return disputes.find(d => d.receivable_id === receivableId && d.status === 'open') || null;
  }

  function openDocRequestFor(receivableId) {
    return docRequests.find(d => d.receivable_id === receivableId && d.status === 'pending') || null;
  }

  function clientById(id) { return clients.find(c => c.id === id) || { name: 'Unknown client' }; }

  function outstandingAsOf(asOfDate, clientId) {
    const created = receivables.filter(rv => new Date(rv.created_at) <= asOfDate && (!clientId || rv.client_id === clientId));
    const totalCreated = created.reduce((s, rv) => s + Number(rv.amount), 0);
    const createdIds = new Set(created.map(rv => rv.id));
    const paid = paymentEvents
      .filter(p => new Date(p.paid_at) <= asOfDate && createdIds.has(p.receivable_id))
      .reduce((s, p) => s + Number(p.amount), 0);
    return totalCreated - paid;
  }

  function recentSalesAsOf(asOfDate) {
    const since = new Date(asOfDate); since.setDate(since.getDate() - 90);
    return receivables
      .filter(rv => new Date(rv.created_at) <= asOfDate && new Date(rv.created_at) >= since)
      .reduce((s, rv) => s + Number(rv.amount), 0);
  }

  // ---------- DSO intelligence: what's driving the DSO number, not just the number ----------
  function computeDSOIntelligence() {
    const now = new Date();
    const ago30 = new Date(now); ago30.setDate(ago30.getDate() - 30);

    const outstandingNow = outstandingAsOf(now);
    const outstanding30 = outstandingAsOf(ago30);
    const salesNow = recentSalesAsOf(now);
    const sales30 = recentSalesAsOf(ago30);
    const dsoNow = salesNow > 0 ? Math.round((outstandingNow / salesNow) * 90) : null;
    const dso30 = sales30 > 0 ? Math.round((outstanding30 / sales30) * 90) : null;
    const delta = (dsoNow !== null && dso30 !== null) ? dsoNow - dso30 : null;

    const clientIds = new Set(receivables.map(rv => rv.client_id).filter(Boolean));
    const clientDeltas = [...clientIds].map(cid => {
      const nowBal = outstandingAsOf(now, cid);
      const agoBal = outstandingAsOf(ago30, cid);
      return { clientId: cid, name: clientById(cid).name, delta: nowBal - agoBal, now: nowBal };
    }).filter(c => Math.abs(c.delta) >= 1);

    const worsened = clientDeltas.filter(c => c.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
    const improved = clientDeltas.filter(c => c.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);

    return { dsoNow, dso30, delta, worsened, improved };
  }

  function computeDSO() {
    const intel = computeDSOIntelligence();
    const { dsoNow, dso30, delta, worsened, improved } = intel;

    const deltaLabel = delta === null ? ''
      : delta === 0 ? '<span style="opacity:0.6; font-size:0.78rem;">no change vs 30 days ago</span>'
      : delta > 0 ? `<span style="color:#b3402e; font-size:0.78rem;">▲ ${delta}d worse vs 30 days ago</span>`
      : `<span style="color:#2f8a4e; font-size:0.78rem;">▼ ${Math.abs(delta)}d better vs 30 days ago</span>`;

    const driverList = (items, tone) => items.map(c =>
      `<div style="display:flex; justify-content:space-between; font-size:0.78rem; padding:4px 0;">
        <span>${escapeHtml(c.name)}</span>
        <span style="color:${tone};">${c.delta > 0 ? '+' : ''}${naira(c.delta)}</span>
      </div>`
    ).join('') || '<div class="empty-note" style="font-size:0.75rem;">None</div>';

    document.getElementById('dsoPanel').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <strong style="font-size:0.9rem;">Days Sales Outstanding</strong>
          <p style="font-size:0.78rem; opacity:0.65; margin-top:2px;">Based on the last 90 days of activity.</p>
        </div>
        <div style="text-align:right;">
          <div class="pr-amount" style="font-size:1.4rem;">${dsoNow === null ? '—' : dsoNow + ' days'}</div>
          <div style="margin-top:2px;">${deltaLabel}</div>
        </div>
      </div>
      ${isGrowth && (worsened.length || improved.length) ? `
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; margin-top:14px; padding-top:12px; border-top:1px dashed var(--line);">
        <div>
          <div style="font-size:0.72rem; opacity:0.65; margin-bottom:4px;">Pushing DSO up (new/growing balances, last 30 days)</div>
          ${driverList(worsened, '#b3402e')}
        </div>
        <div>
          <div style="font-size:0.72rem; opacity:0.65; margin-bottom:4px;">Helping DSO (paid down, last 30 days)</div>
          ${driverList(improved, '#2f8a4e')}
        </div>
      </div>` : !isGrowth ? `<div style="margin-top:12px;">${growthUpsellHtml('DSO driver breakdown')}</div>` : ''}
    `;
  }

  function renderAging() {
    const outstanding = receivables
      .filter(rv => rv.payment_status !== 'paid')
      .map(rv => ({ ...rv, overdueDays: daysOverdue(rv.due_date), balance: Number(rv.amount) - Number(rv.amount_paid || 0) }));

    const buckets = { current: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
    outstanding.forEach(rv => { buckets[agingBucket(rv.overdueDays)] += rv.balance; });

    const grid = document.getElementById('agingGrid');
    grid.innerHTML = Object.keys(BUCKET_LABEL).map(key => `
      <div style="border:1px solid var(--line); border-radius:8px; padding:10px; text-align:center;">
        <div style="font-size:0.72rem; opacity:0.65;">${BUCKET_LABEL[key]}</div>
        <div class="pr-amount" style="margin-top:4px;">${naira(buckets[key])}</div>
      </div>
    `).join('');

    byClient = {};
    outstanding.forEach(rv => {
      if (!rv.client_id) return;
      const dispute = openDisputeFor(rv.id);
      const docRequest = openDocRequestFor(rv.id);
      rv.dispute = dispute;
      rv.docRequest = docRequest;
      if (!byClient[rv.client_id]) byClient[rv.client_id] = { client: clientById(rv.client_id), items: [], balance: 0, worstBucket: 'current', hasOpenDispute: false, hasOpenDocRequest: false };
      byClient[rv.client_id].items.push(rv);
      byClient[rv.client_id].balance += rv.balance;
      if (dispute) byClient[rv.client_id].hasOpenDispute = true;
      if (docRequest) byClient[rv.client_id].hasOpenDocRequest = true;
      if (dispute || docRequest) return; // blocked items (dispute or missing document) don't count toward "how bad is this client's aging" severity
      const order = ['current', 'b1', 'b2', 'b3', 'b4'];
      const bucket = agingBucket(rv.overdueDays);
      if (order.indexOf(bucket) > order.indexOf(byClient[rv.client_id].worstBucket)) {
        byClient[rv.client_id].worstBucket = bucket;
      }
    });
  }

  // ---------- Today's priorities (AI-assisted, deterministically scored) ----------
  function isToday(iso) {
    if (!iso) return false;
    const d = new Date(iso), now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }

  function renderPriorityList(priorities, meta) {
    const wrap = document.getElementById('priorityWrap');
    const metaEl = document.getElementById('priorityMeta');

    metaEl.textContent = meta?.generatedAt
      ? `Last generated ${fmtDateTime(meta.generatedAt)}${meta.provider ? ` · ${meta.provider}` : ''}`
      : '';

    if (!priorities || !priorities.length) {
      wrap.innerHTML = '<div class="empty-note">Nothing overdue right now — every account is settled or current.</div>';
      return;
    }

    wrap.innerHTML = priorities.map(p => {
      const client = clientById(p.client_id);
      return `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:10px 0; border-bottom:1px dashed var(--line);">
          <div style="flex:1; min-width:0;">
            <div class="pr-name">${p.rank}. ${escapeHtml(p.client_name)}
              <span style="font-size:0.68rem; opacity:0.65; font-weight:400; margin-left:6px;">${p.bucket}${p.broken_promise ? ' · broke a promise' : ''}</span>
            </div>
            <div style="font-size:0.82rem; opacity:0.75; margin-top:3px;">${escapeHtml(p.suggested_action)}</div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div class="pr-amount">${naira(p.balance)}</div>
            ${client.phone ? `<button data-priority-remind="${p.client_id}" class="btn small" style="margin-top:6px;">WhatsApp</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    wrap.querySelectorAll('[data-priority-remind]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.priorityRemind;
        const client = clientById(cid);
        const row = byClient[cid];
        const balance = naira(row ? row.balance : 0);
        const message = `Hello ${client.name}, this is a reminder that your outstanding balance with ${business.name} is ${balance}. Please let us know when we can expect payment. Thank you.`;
        window.open(`https://wa.me/${client.phone.replace(/[^\d+]/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
        logActivity('reminder_sent', { channel: 'whatsapp', balance: row ? row.balance : 0, source: 'priorities' }, cid);
      });
    });
  }

  async function generatePriorities() {
    if (!isGrowth) return;
    const btn = document.getElementById('priorityRefreshBtn');
    const wrap = document.getElementById('priorityWrap');
    btn.disabled = true;
    btn.textContent = 'Generating…';
    wrap.innerHTML = '<div class="empty-note">Scoring accounts and drafting today\u2019s priorities…</div>';

    try {
      const { data, error } = await supabase.functions.invoke('collection-priorities', {
        body: { business_id: business.id }
      });
      if (error || data?.error) {
        toast('Could not generate priorities: ' + (data?.error || error.message));
        renderPriorityList([], null);
        return;
      }
      renderPriorityList(data.priorities, { generatedAt: data.generated_at, provider: data.provider });
    } catch (err) {
      toast('Could not generate priorities: ' + err.message);
      renderPriorityList([], null);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Refresh';
    }
  }

  async function loadAndRenderPriorities() {
    if (!isGrowth) return;
    const { data: lastRun } = await supabase
      .from('collection_priority_runs')
      .select('priorities, provider, created_at')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastRun && isToday(lastRun.created_at)) {
      renderPriorityList(lastRun.priorities, { generatedAt: lastRun.created_at, provider: lastRun.provider });
    } else {
      await generatePriorities();
    }
  }

  if (isGrowth) document.getElementById('priorityRefreshBtn').addEventListener('click', generatePriorities);

  // ---------- Bank/payment reconciliation (deterministic matching, no AI) ----------
  let reconRows = [];              // parsed + matched transactions from the uploaded CSV
  let reconciledKeys = new Set();  // already-processed transactions, loaded from db

  function txKey(dateStr, amount, description) {
    return `${dateStr}|${Number(amount).toFixed(2)}|${(description || '').trim().toLowerCase()}`;
  }

  async function loadReconciledKeys() {
    const { data } = await supabase
      .from('reconciled_transactions')
      .select('tx_date, amount, description')
      .eq('business_id', business.id);
    reconciledKeys = new Set((data || []).map(r => txKey(r.tx_date, r.amount, r.description)));
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function detectColumns(headerRow) {
    const norm = headerRow.map(h => h.trim().toLowerCase());
    const find = (candidates) => norm.findIndex(h => candidates.some(c => h.includes(c)));
    return {
      date: find(['date']),
      description: find(['narration', 'description', 'details', 'remark', 'particular']),
      credit: find(['credit', 'cr amount']),
      amount: find(['amount'])
    };
  }

  function parseAmount(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    const cleaned = String(raw).replace(/[₦, ]/g, '').replace(/\((.*)\)/, '-$1');
    const n = Number(cleaned);
    return isNaN(n) ? null : n;
  }

  function parseDate(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = '20' + y;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  function matchTransaction(description, amount) {
    const desc = (description || '').toLowerCase();
    let best = null;
    Object.keys(byClient).forEach(cid => {
      const clientRow = byClient[cid];
      const tokens = clientRow.client.name.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      const hits = tokens.filter(t => desc.includes(t)).length;
      const nameScore = tokens.length ? hits / tokens.length : 0;

      clientRow.items.forEach(item => {
        const diff = Math.abs(item.balance - amount);
        const amountScore = diff < 1 ? 1 : diff <= item.balance * 0.02 ? 0.85 : 0;
        if (amountScore === 0 && nameScore === 0) return;
        const score = nameScore * 0.6 + amountScore * 0.4;
        if (!best || score > best.score) {
          best = { clientId: cid, receivableId: item.id, score };
        }
      });
    });
    return best;
  }

  function confidenceLabel(score) {
    if (score >= 0.75) return 'Strong match';
    if (score >= 0.4) return 'Possible match';
    return 'No confident match';
  }

  function renderRecon() {
    const wrap = document.getElementById('reconWrap');
    const summary = document.getElementById('reconSummary');
    const confirmAllBtn = document.getElementById('reconConfirmAllBtn');

    if (!reconRows.length) { wrap.innerHTML = ''; summary.textContent = ''; confirmAllBtn.style.display = 'none'; return; }

    const actionable = reconRows.filter(r => !r.done);
    const strongCount = actionable.filter(r => r.match && r.match.score >= 0.75).length;
    const alreadyCount = reconRows.length - actionable.length;
    summary.textContent = `${reconRows.length} transaction${reconRows.length > 1 ? 's' : ''} found` +
      (alreadyCount ? ` · ${alreadyCount} already reconciled` : '') +
      (actionable.length ? ` · ${actionable.length} need review` : ' · all handled');
    confirmAllBtn.style.display = strongCount > 0 ? 'inline-block' : 'none';
    confirmAllBtn.textContent = `Confirm all strong matches (${strongCount})`;

    wrap.innerHTML = actionable.map((r) => {
      const idx = reconRows.indexOf(r);
      const confLabel = r.match ? confidenceLabel(r.match.score) : 'No confident match';
      const options = [];
      Object.keys(byClient).forEach(cid => {
        byClient[cid].items.forEach(item => {
          const selected = r.match && r.match.receivableId === item.id ? 'selected' : '';
          options.push(`<option value="${cid}::${item.id}" ${selected}>${escapeHtml(byClient[cid].client.name)} — ${escapeHtml(item.description || 'balance')} (${naira(item.balance)})</option>`);
        });
      });
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 0; border-bottom:1px dashed var(--line); flex-wrap:wrap;">
          <div style="flex:1; min-width:220px;">
            <div style="font-size:0.82rem;">${escapeHtml(r.description || '(no narration)')}</div>
            <div style="font-size:0.72rem; opacity:0.6; margin-top:2px;">${r.date || 'unknown date'} · ${naira(r.amount)} · ${confLabel}</div>
          </div>
          <select data-recon-select="${idx}" style="min-width:200px; max-width:280px;">
            <option value="">— ignore this transaction —</option>
            ${options.join('')}
          </select>
          <button data-recon-confirm="${idx}" class="btn small">Confirm</button>
        </div>
      `;
    }).join('');

    wrap.querySelectorAll('[data-recon-confirm]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.reconConfirm);
        const select = wrap.querySelector(`[data-recon-select="${idx}"]`);
        await confirmReconRow(idx, select.value);
      });
    });
  }

  async function confirmReconRow(idx, selectedValue) {
    const r = reconRows[idx];
    if (!r || r.done) return;

    if (!selectedValue) {
      await supabase.from('reconciled_transactions').insert({
        business_id: business.id, tx_date: r.date, description: r.description, amount: r.amount,
        status: 'ignored', created_by: session.user.id
      });
      r.done = true;
      renderRecon();
      return;
    }

    const [clientId, receivableId] = selectedValue.split('::');
    const paidAtIso = r.date ? new Date(r.date).toISOString() : null;
    const { error } = await logPaymentForReceivable(receivableId, r.amount, clientId, paidAtIso);
    if (error) { toast('Could not log payment: ' + error); return; }

    await supabase.from('reconciled_transactions').insert({
      business_id: business.id, tx_date: r.date, description: r.description, amount: r.amount,
      status: 'matched', matched_receivable_id: receivableId, matched_client_id: clientId, created_by: session.user.id
    });

    r.done = true;
    await loadAll();
    computePaymentBehaviour();
    renderAging();
    renderLedger();
    computeDSO();
    renderAnalytics();
    renderCashFlowForecast();
    renderTeamWorkload();
    renderRecon();
    toast('Payment matched and logged.');
  }

  async function handleReconFile(file) {
    const text = await file.text();
    const rows = parseCSV(text).filter(r => r.some(cell => cell.trim() !== ''));
    if (rows.length < 2) { toast('No transactions found in that file.'); return; }

    const cols = detectColumns(rows[0]);
    if (cols.date === -1 || cols.description === -1) {
      toast('Could not find date/description columns. Expected headers like Date, Narration/Description, Amount.');
      return;
    }

    await loadReconciledKeys();

    reconRows = [];
    for (let i = 1; i < rows.length; i++) {
      const raw = rows[i];
      const date = parseDate(raw[cols.date]);
      const description = (raw[cols.description] || '').trim();
      let amount = null;
      if (cols.credit !== -1) amount = parseAmount(raw[cols.credit]);
      else if (cols.amount !== -1) {
        const a = parseAmount(raw[cols.amount]);
        amount = a !== null && a > 0 ? a : null; // only treat positive values as an incoming credit
      }
      if (!date || amount === null || amount <= 0) continue;

      const key = txKey(date, amount, description);
      const alreadyDone = reconciledKeys.has(key);
      reconRows.push({
        date, description, amount, done: alreadyDone,
        match: alreadyDone ? null : matchTransaction(description, amount)
      });
    }

    if (!reconRows.length) { toast('No incoming (credit) transactions found in that file.'); return; }
    renderRecon();
  }

  document.getElementById('reconFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleReconFile(file);
  });

  document.getElementById('reconConfirmAllBtn').addEventListener('click', async () => {
    const strongOnes = reconRows.filter(r => !r.done && r.match && r.match.score >= 0.75);
    for (const r of strongOnes) {
      const idx = reconRows.indexOf(r);
      await confirmReconRow(idx, `${r.match.clientId}::${r.match.receivableId}`);
    }
  });

  function renderLedger() {
    const wrap = document.getElementById('ledgerWrap');
    const filterVal = document.getElementById('assigneeFilter').value;
    let clientIds = Object.keys(byClient).sort((a, b) => byClient[b].balance - byClient[a].balance);
    if (filterVal === '__unassigned') {
      clientIds = clientIds.filter(cid => !assignmentFor(cid));
    } else if (filterVal) {
      clientIds = clientIds.filter(cid => assignmentFor(cid)?.assigned_to === filterVal);
    }

    if (!clientIds.length) {
      wrap.innerHTML = '<div class="empty-note">Nothing outstanding here.</div>';
      return;
    }

    wrap.innerHTML = clientIds.map(cid => {
      const row = byClient[cid];
      const client = row.client;
      const overLimit = client.credit_limit && row.balance > Number(client.credit_limit);
      const scoreInfo = computeCollectionScore(cid);
      const escalation = computeEscalationStage(cid);
      const assignment = assignmentFor(cid);
      return `
        <div class="pr-row" data-toggle="${cid}" style="cursor:pointer; display:block;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div class="pr-name">${escapeHtml(client.name)}
                <span class="bucket-tag ${row.worstBucket}" style="font-size:0.68rem; margin-left:6px; opacity:0.75;">${BUCKET_LABEL[row.worstBucket]}</span>
                ${scoreInfo ? `<span style="font-size:0.68rem; margin-left:6px; color:${SCORE_TIER_COLOR[scoreInfo.tier]};">${scoreInfo.tier} (${scoreInfo.score})</span>` : ''}
                ${overLimit ? `<span style="color:#b3402e; font-size:0.68rem; margin-left:6px;">Over ${naira(client.credit_limit)} limit</span>` : ''}
                ${row.hasOpenDispute ? `<span style="color:#8a5a00; font-size:0.68rem; margin-left:6px;">⚠ Dispute open</span>` : ''}
                ${row.hasOpenDocRequest ? `<span style="color:#2f5f8a; font-size:0.68rem; margin-left:6px;">📄 Doc pending</span>` : ''}
                ${escalation && escalation.stage >= 3 && isGrowth ? `<span style="color:${ESCALATION_COLOR[escalation.stage]}; font-size:0.68rem; margin-left:6px;">${escalation.label}</span>` : ''}
                ${assignment && isGrowth ? `<span style="opacity:0.6; font-size:0.68rem; margin-left:6px;">→ ${escapeHtml(memberLabel(memberByUserId(assignment.assigned_to)))}</span>` : ''}
              </div>
              <div class="pr-meta">${row.items.length} open item${row.items.length > 1 ? 's' : ''}${(() => {
                const preds = row.items.map(predictedPaymentDate).filter(Boolean);
                if (!preds.length) return '';
                const earliest = preds.reduce((a, b) => (a.date < b.date ? a : b));
                return ` · expected ~${fmtDate(earliest.date)}`;
              })()}</div>
            </div>
            <div class="pr-amount">${naira(row.balance)}</div>
          </div>
          <div id="detail-${cid}" style="display:none; margin-top:12px;"></div>
        </div>
      `;
    }).join('');

    wrap.querySelectorAll('[data-toggle]').forEach(rowEl => {
      rowEl.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input') || e.target.closest('textarea')) return;
        const cid = rowEl.dataset.toggle;
        const detail = document.getElementById(`detail-${cid}`);
        const isOpen = detail.style.display !== 'none';
        wrap.querySelectorAll('[id^="detail-"]').forEach(d => d.style.display = 'none');
        if (!isOpen) {
          renderClientDetail(cid);
          detail.style.display = 'block';
        }
      });
    });
  }

  function clientPromises(cid) { return promises.filter(p => p.client_id === cid); }
  function clientNotes(cid) { return notes.filter(n => n.client_id === cid); }

  function renderClientDetail(cid) {
    const row = byClient[cid];
    const client = row.client;
    const detail = document.getElementById(`detail-${cid}`);

    const itemRows = row.items.map(rv => {
      const predicted = predictedPaymentDate(rv);
      const expectedCell = predicted
        ? `${fmtDate(predicted.date)} <span style="opacity:0.55;">(${predicted.count} past pmt${predicted.count > 1 ? 's' : ''})</span>`
        : '<span style="opacity:0.5;">—</span>';
      const dispute = rv.dispute;
      const docRequest = rv.docRequest;
      let actionCell;
      if (dispute) {
        actionCell = `<span style="color:#8a5a00; font-size:0.75rem;">⚠ ${escapeHtml(DISPUTE_REASON_LABEL[dispute.reason] || 'Disputed')}</span>
           <button data-resolve-dispute="${dispute.id}" data-receivable="${rv.id}" class="btn small" style="margin-left:6px;">Resolve</button>`;
      } else if (docRequest) {
        actionCell = `<span style="color:#2f5f8a; font-size:0.75rem;">📄 Awaiting ${escapeHtml(DOC_TYPE_LABEL[docRequest.doc_type] || 'document')}</span>
           <button data-received-doc="${docRequest.id}" class="btn small" style="margin-left:6px;">Received</button>
           ${row.client.phone ? `<button data-chase-doc="${docRequest.id}" data-receivable="${rv.id}" class="btn small" style="margin-left:6px;">WhatsApp</button>` : ''}`;
      } else {
        actionCell = `<button data-pay="${rv.id}" class="btn small">Log payment</button>` +
          (isGrowth ? `
           <button data-flag-dispute="${rv.id}" class="btn small">Flag dispute</button>
           <button data-request-doc="${rv.id}" class="btn small">Request document</button>` : '');
      }
      return `
      <tr>
        <td>${escapeHtml(rv.description || 'Balance')}</td>
        <td>${fmtDate(rv.due_date)}</td>
        <td>${expectedCell}</td>
        <td>${naira(rv.balance)}</td>
        <td style="white-space:nowrap;">${actionCell}</td>
      </tr>
    `;
    }).join('');

    const behaviour = paymentBehaviour[cid];
    const behaviourNote = behaviour
      ? (behaviour.avgDelay > 0.5
          ? `Based on ${behaviour.count} past payment${behaviour.count > 1 ? 's' : ''}, this client typically pays ~${Math.round(behaviour.avgDelay)} day${Math.round(behaviour.avgDelay) === 1 ? '' : 's'} after the due date.`
          : behaviour.avgDelay < -0.5
          ? `Based on ${behaviour.count} past payment${behaviour.count > 1 ? 's' : ''}, this client typically pays ~${Math.round(Math.abs(behaviour.avgDelay))} day${Math.round(Math.abs(behaviour.avgDelay)) === 1 ? '' : 's'} before the due date.`
          : `Based on ${behaviour.count} past payment${behaviour.count > 1 ? 's' : ''}, this client typically pays on the due date.`)
      : 'No payment history yet — predictions will appear once this client has paid at least once with a due date on file.';

    const pList = clientPromises(cid);
    const nList = clientNotes(cid);
    const scoreInfo = computeCollectionScore(cid);
    const escalation = computeEscalationStage(cid);
    const escalationHistory = clientEscalationHistory(cid);

    detail.innerHTML = `
      ${scoreInfo ? `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px; padding:8px 10px; border:1px solid var(--line); border-radius:8px;">
        <div class="pr-amount" style="color:${SCORE_TIER_COLOR[scoreInfo.tier]}; font-size:1.1rem;">${scoreInfo.score}</div>
        <div style="font-size:0.78rem;">
          <strong style="color:${SCORE_TIER_COLOR[scoreInfo.tier]};">${scoreInfo.tier} collection score</strong>
          <div style="opacity:0.65; margin-top:2px;">${scoreInfo.reasons.length ? scoreInfo.reasons.join(', ') : 'No negative factors on record.'}${scoreInfo.limitedHistory ? ' · limited history' : ''}</div>
        </div>
      </div>` : ''}
      ${escalation && isGrowth ? `
      <div style="margin-bottom:10px; padding:8px 10px; border:1px solid var(--line); border-radius:8px;">
        <div style="font-size:0.78rem;">
          <strong style="color:${ESCALATION_COLOR[escalation.stage]};">Escalation stage ${escalation.stage} — ${escalation.label}</strong>
          <div style="opacity:0.65; margin-top:2px;">${escalation.reason}</div>
        </div>
        ${escalationHistory.length ? `
        <div style="margin-top:6px; font-size:0.72rem; opacity:0.55;">
          ${escalationHistory.slice(0, 3).map(e => `${e.action_type === 'formal_notice' ? 'Formal notice' : 'Referred to collections'} — ${fmtDate(e.created_at)}`).join(' · ')}
        </div>` : ''}
      </div>` : ''}
      ${teamMembers.length && isGrowth ? `
      <div style="margin-bottom:10px; padding:8px 10px; border:1px solid var(--line); border-radius:8px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span style="font-size:0.78rem; opacity:0.65;">Assigned to</span>
        <select id="assignSelect-${cid}" style="font-size:0.78rem;">
          <option value="">— unassigned —</option>
          ${teamMembers.map(m => `<option value="${m.user_id}" ${assignmentFor(cid)?.assigned_to === m.user_id ? 'selected' : ''}>${escapeHtml(memberLabel(m))}</option>`).join('')}
        </select>
        <button data-save-assignment="${cid}" class="btn small">Save</button>
      </div>` : ''}
      <p style="font-size:0.78rem; opacity:0.65; margin-bottom:10px;">${behaviourNote}</p>
      <table style="width:100%; font-size:0.85rem; margin-bottom:8px;">
        <thead><tr><th style="text-align:left;">Item</th><th style="text-align:left;">Due</th><th style="text-align:left;">Expected</th><th style="text-align:left;">Balance</th><th></th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div id="disputeForm-${cid}" style="display:none; margin-bottom:12px;"></div>
      <div id="docRequestForm-${cid}" style="display:none; margin-bottom:12px;"></div>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        <button data-statement="${cid}" class="btn small">Download statement (PDF)</button>
        ${client.phone ? `<button data-remind="${cid}" class="btn small">WhatsApp reminder</button>` : ''}
        ${isGrowth ? `<button data-draft-negotiation="${cid}" class="btn small">Draft AI negotiation message</button>` : ''}
        ${isGrowth && escalation && escalation.stage >= 3 ? `<button data-formal-notice="${cid}" class="btn small">Generate formal notice (PDF)</button>` : ''}
        ${isGrowth && escalation && escalation.stage >= 4 ? `<button data-collections-referral="${cid}" class="btn small">Flag for collections/legal referral</button>` : ''}
      </div>
      ${!isGrowth ? growthUpsellHtml('AI negotiation drafting & escalation tools') : ''}
      <div id="negotiationDraft-${cid}" style="margin-bottom:14px;"></div>
      <div id="collectionsReferralForm-${cid}" style="display:none; margin-bottom:14px;"></div>

      <strong style="font-size:0.82rem;">Promises to pay</strong>
      <div style="margin:6px 0 10px;">
        ${pList.length ? pList.map(p => `
          <div style="font-size:0.82rem; padding:6px 0; border-bottom:1px dashed var(--line);">
            ${fmtDate(p.promised_date)} — ${naira(p.promised_amount)}
            <span style="opacity:0.7;"> (${p.status})</span>
            ${p.note ? `<div style="opacity:0.7;">${escapeHtml(p.note)}</div>` : ''}
            ${p.status === 'pending' ? `
              <div style="margin-top:4px;">
                <button data-resolve="${p.id}" data-outcome="kept" class="btn small">Mark kept</button>
                <button data-resolve="${p.id}" data-outcome="broken" class="btn small">Mark broken</button>
              </div>` : ''}
          </div>
        `).join('') : '<div class="empty-note" style="padding:8px 0;">No promises logged yet.</div>'}
      </div>
      <div class="pr-form" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
        <div><label>Promised date</label><input type="date" id="pDate-${cid}"></div>
        <div><label>Amount</label><input type="number" id="pAmount-${cid}" placeholder="0" style="width:120px;"></div>
        <div style="flex:1; min-width:160px;"><label>Note (optional)</label><input type="text" id="pNote-${cid}" placeholder="e.g. will pay after month-end"></div>
        <button data-add-promise="${cid}" class="btn primary small">Log promise</button>
      </div>

      <strong style="font-size:0.82rem; display:block; margin-top:16px;">Collection notes</strong>
      <div style="margin:6px 0 10px;">
        ${nList.length ? nList.map(n => `
          <div style="font-size:0.82rem; padding:6px 0; border-bottom:1px dashed var(--line);"><span style="opacity:0.6;">${fmtDateTime(n.created_at)}</span><div>${escapeHtml(n.note)}</div></div>
        `).join('') : '<div class="empty-note" style="padding:8px 0;">No notes yet.</div>'}
      </div>
      <div class="pr-form" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
        <div style="flex:1; min-width:200px;"><label>Add a note</label><textarea id="noteText-${cid}" placeholder="Spoke with client, they confirmed receipt of goods…" style="width:100%;"></textarea></div>
        <button data-add-note="${cid}" class="btn primary small">Save note</button>
      </div>
    `;

    detail.querySelector(`[data-statement="${cid}"]`).addEventListener('click', async () => {
      await downloadStatement(cid);
    });

    const remindBtn = detail.querySelector(`[data-remind="${cid}"]`);
    if (remindBtn) {
      remindBtn.addEventListener('click', async () => {
        const balance = naira(row.balance);
        const message = `Hello ${client.name}, this is a reminder that your outstanding balance with ${business.name} is ${balance}. Please let us know when we can expect payment. Thank you.`;
        window.open(`https://wa.me/${client.phone.replace(/[^\d+]/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
        logActivity('reminder_sent', { channel: 'whatsapp', balance: row.balance }, cid);
      });
    }

    const draftBtn = detail.querySelector(`[data-draft-negotiation="${cid}"]`);
    const draftWrap = detail.querySelector(`#negotiationDraft-${cid}`);
    async function generateDraft() {
      draftBtn.disabled = true;
      draftBtn.textContent = 'Drafting…';
      draftWrap.innerHTML = '<div class="empty-note">Writing a personalized message from this client\u2019s balance and history…</div>';
      try {
        const { data, error } = await supabase.functions.invoke('draft-negotiation-message', {
          body: { business_id: business.id, client_id: cid }
        });
        if (error || data?.error) {
          draftWrap.innerHTML = '';
          toast('Could not draft message: ' + (data?.error || error.message));
          return;
        }
        draftWrap.innerHTML = `
          <textarea id="negotiationText-${cid}" style="width:100%; min-height:100px; font-size:0.85rem;">${escapeHtml(data.message)}</textarea>
          <div style="font-size:0.68rem; opacity:0.55; margin-top:4px;">AI-drafted${data.provider ? ` (${data.provider})` : ''} — review and edit before sending.</div>
          <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
            ${client.phone ? `<button data-send-negotiation="${cid}" class="btn primary small">Send via WhatsApp</button>` : ''}
            <button data-copy-negotiation="${cid}" class="btn small">Copy</button>
            <button data-regen-negotiation="${cid}" class="btn small">Regenerate</button>
          </div>
        `;
        draftWrap.querySelector(`[data-send-negotiation="${cid}"]`)?.addEventListener('click', () => {
          const text = draftWrap.querySelector(`#negotiationText-${cid}`).value;
          window.open(`https://wa.me/${client.phone.replace(/[^\d+]/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
          logActivity('reminder_sent', { channel: 'whatsapp', method: 'ai_negotiation', balance: row.balance }, cid);
        });
        draftWrap.querySelector(`[data-copy-negotiation="${cid}"]`)?.addEventListener('click', async () => {
          const text = draftWrap.querySelector(`#negotiationText-${cid}`).value;
          await navigator.clipboard.writeText(text);
          toast('Copied to clipboard.');
        });
        draftWrap.querySelector(`[data-regen-negotiation="${cid}"]`)?.addEventListener('click', generateDraft);
      } finally {
        draftBtn.disabled = false;
        draftBtn.textContent = 'Draft AI negotiation message';
      }
    }
    draftBtn?.addEventListener('click', generateDraft);

    const formalNoticeBtn = detail.querySelector(`[data-formal-notice="${cid}"]`);
    if (formalNoticeBtn) {
      formalNoticeBtn.addEventListener('click', async () => {
        formalNoticeBtn.disabled = true;
        formalNoticeBtn.textContent = 'Generating…';
        try {
          await generateFormalNotice(cid);
          toast('Formal notice downloaded and logged.');
          await loadAll();
          renderActivity();
        } catch (err) {
          toast('Could not generate formal notice: ' + err.message);
        } finally {
          formalNoticeBtn.disabled = false;
          formalNoticeBtn.textContent = 'Generate formal notice (PDF)';
        }
      });
    }

    const referralBtn = detail.querySelector(`[data-collections-referral="${cid}"]`);
    const referralFormEl = detail.querySelector(`#collectionsReferralForm-${cid}`);
    if (referralBtn) {
      referralBtn.addEventListener('click', () => {
        referralFormEl.innerHTML = `
          <div class="pr-form" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; border:1px solid var(--line); border-radius:8px; padding:10px;">
            <div style="flex:1; min-width:220px;"><label>Note (optional) — who/where this is being referred to</label><input type="text" id="referralNote-${cid}" placeholder="e.g. handed to ABC Collections Agency"></div>
            <button data-save-referral class="btn primary small">Log referral</button>
            <button data-cancel-referral class="btn small">Cancel</button>
          </div>
        `;
        referralFormEl.style.display = 'block';

        referralFormEl.querySelector('[data-cancel-referral]').addEventListener('click', () => {
          referralFormEl.style.display = 'none';
          referralFormEl.innerHTML = '';
        });

        referralFormEl.querySelector('[data-save-referral]').addEventListener('click', async () => {
          const note = document.getElementById(`referralNote-${cid}`).value.trim() || null;
          const { error } = await supabase.from('escalation_actions').insert({
            business_id: business.id, client_id: cid, stage: 4, action_type: 'collections_referral',
            note, created_by: session.user.id
          });
          if (error) { toast('Could not log referral: ' + error.message); return; }

          await logActivity('collections_referral', { note }, cid);
          toast('Referral logged.');
          await loadAll();
          renderActivity();
          renderLedger();
        });
      });
    }

    const saveAssignmentBtn = detail.querySelector(`[data-save-assignment="${cid}"]`);
    if (saveAssignmentBtn) {
      saveAssignmentBtn.addEventListener('click', async () => {
        const uid = document.getElementById(`assignSelect-${cid}`).value;

        if (!uid) {
          const existing = assignmentFor(cid);
          if (existing) await supabase.from('receivable_assignments').delete().eq('id', existing.id);
          toast('Unassigned.');
        } else {
          const { error } = await supabase.from('receivable_assignments')
            .upsert({ business_id: business.id, client_id: cid, assigned_to: uid, assigned_by: session.user.id, updated_at: new Date().toISOString() }, { onConflict: 'business_id,client_id' });
          if (error) { toast('Could not save assignment: ' + error.message); return; }
          toast('Assigned.');
        }

        await loadAll();
        renderLedger();
        renderTeamWorkload();
      });
    }

    detail.querySelectorAll('[data-pay]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.pay;
        const item = row.items.find(i => i.id === id);
        const amountStr = prompt(`Amount received for "${item.description || 'this balance'}" (balance: ${naira(item.balance)}):`);
        if (!amountStr) return;
        const amountNum = Number(amountStr);
        if (!amountNum || amountNum <= 0) { toast('Enter a valid amount.'); return; }

        const { error } = await logPaymentForReceivable(id, amountNum, cid, null);
        if (error) { toast('Could not log payment: ' + error); return; }

        toast('Payment logged.');
        await loadAll();
        computePaymentBehaviour();
        renderAging();
        renderLedger();
        computeDSO();
        renderAnalytics();
        renderCashFlowForecast();
        renderTeamWorkload();
      });
    });

    const disputeFormEl = detail.querySelector(`#disputeForm-${cid}`);
    detail.querySelectorAll('[data-flag-dispute]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rvId = btn.dataset.flagDispute;
        const item = row.items.find(i => i.id === rvId);
        disputeFormEl.innerHTML = `
          <div class="pr-form" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; border:1px solid var(--line); border-radius:8px; padding:10px;">
            <div>
              <label>Reason — "${escapeHtml(item.description || 'this balance')}"</label>
              <select id="disputeReason-${cid}">
                ${Object.keys(DISPUTE_REASON_LABEL).map(k => `<option value="${k}">${DISPUTE_REASON_LABEL[k]}</option>`).join('')}
              </select>
            </div>
            <div style="flex:1; min-width:180px;"><label>Details (optional)</label><input type="text" id="disputeDesc-${cid}" placeholder="e.g. client says goods were short-shipped"></div>
            <button data-save-dispute="${rvId}" class="btn primary small">Save dispute</button>
            <button data-cancel-dispute class="btn small">Cancel</button>
          </div>
        `;
        disputeFormEl.style.display = 'block';

        disputeFormEl.querySelector('[data-cancel-dispute]').addEventListener('click', () => {
          disputeFormEl.style.display = 'none';
          disputeFormEl.innerHTML = '';
        });

        disputeFormEl.querySelector(`[data-save-dispute="${rvId}"]`).addEventListener('click', async () => {
          const reason = document.getElementById(`disputeReason-${cid}`).value;
          const description = document.getElementById(`disputeDesc-${cid}`).value.trim() || null;

          const { error } = await supabase.from('receivable_disputes').insert({
            business_id: business.id, receivable_id: rvId, client_id: cid,
            reason, description, raised_by: session.user.id
          });
          if (error) { toast('Could not save dispute: ' + error.message); return; }

          await logActivity('dispute_flagged', { reason }, cid);
          toast('Dispute flagged.');
          await loadAll();
          computePaymentBehaviour();
          renderAging();
          renderLedger();
          renderActivity();
          renderCashFlowForecast();
          renderTeamWorkload();
        });
      });
    });

    detail.querySelectorAll('[data-resolve-dispute]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const disputeId = btn.dataset.resolveDispute;
        const note = prompt('How was this resolved? (e.g. PO received, credit note issued, client paid)');
        if (note === null) return;

        const { error } = await supabase.from('receivable_disputes')
          .update({ status: 'resolved', resolution_note: note || null, resolved_at: new Date().toISOString() })
          .eq('id', disputeId);
        if (error) { toast('Could not resolve dispute: ' + error.message); return; }

        await logActivity('dispute_resolved', { note }, cid);
        toast('Dispute resolved.');
        await loadAll();
        computePaymentBehaviour();
        renderAging();
        renderLedger();
        renderActivity();
        renderCashFlowForecast();
        renderTeamWorkload();
      });
    });

    // ---------- Document chasing ----------
    const docFormEl = detail.querySelector(`#docRequestForm-${cid}`);
    detail.querySelectorAll('[data-request-doc]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rvId = btn.dataset.requestDoc;
        const item = row.items.find(i => i.id === rvId);
        docFormEl.innerHTML = `
          <div class="pr-form" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; border:1px solid var(--line); border-radius:8px; padding:10px;">
            <div>
              <label>Missing document — "${escapeHtml(item.description || 'this balance')}"</label>
              <select id="docType-${cid}">
                ${Object.keys(DOC_TYPE_LABEL).map(k => `<option value="${k}">${DOC_TYPE_LABEL[k]}</option>`).join('')}
              </select>
            </div>
            <div style="flex:1; min-width:180px;"><label>Details (optional)</label><input type="text" id="docDesc-${cid}" placeholder="e.g. need signed PO before payment can be raised"></div>
            <button data-save-doc="${rvId}" class="btn primary small">Save</button>
            <button data-cancel-doc class="btn small">Cancel</button>
          </div>
        `;
        docFormEl.style.display = 'block';

        docFormEl.querySelector('[data-cancel-doc]').addEventListener('click', () => {
          docFormEl.style.display = 'none';
          docFormEl.innerHTML = '';
        });

        docFormEl.querySelector(`[data-save-doc="${rvId}"]`).addEventListener('click', async () => {
          const docType = document.getElementById(`docType-${cid}`).value;
          const description = document.getElementById(`docDesc-${cid}`).value.trim() || null;

          const { error } = await supabase.from('receivable_document_requests').insert({
            business_id: business.id, receivable_id: rvId, client_id: cid,
            doc_type: docType, description, requested_by: session.user.id
          });
          if (error) { toast('Could not save document request: ' + error.message); return; }

          await logActivity('document_requested', { doc_type: docType }, cid);
          toast('Document request logged.');
          await loadAll();
          computePaymentBehaviour();
          renderAging();
          renderLedger();
          renderActivity();
          renderCashFlowForecast();
          renderTeamWorkload();
        });
      });
    });

    detail.querySelectorAll('[data-received-doc]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reqId = btn.dataset.receivedDoc;
        const { error } = await supabase.from('receivable_document_requests')
          .update({ status: 'received', received_at: new Date().toISOString() })
          .eq('id', reqId);
        if (error) { toast('Could not update document request: ' + error.message); return; }

        await logActivity('document_received', {}, cid);
        toast('Marked as received.');
        await loadAll();
        computePaymentBehaviour();
        renderAging();
        renderLedger();
        renderActivity();
        renderCashFlowForecast();
        renderTeamWorkload();
      });
    });

    detail.querySelectorAll('[data-chase-doc]').forEach(btn => {
      btn.addEventListener('click', () => {
        const reqId = btn.dataset.chaseDoc;
        const req = docRequests.find(d => d.id === reqId);
        const docLabel = DOC_TYPE_LABEL[req.doc_type] || 'document';
        const message = `Hello ${client.name}, we're still waiting on the ${docLabel.toLowerCase()} for your order with ${business.name} before we can process payment/next steps. Please could you send this over when you get a chance? Thank you.`;
        window.open(`https://wa.me/${client.phone.replace(/[^\d+]/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
        logActivity('document_chased', { channel: 'whatsapp', doc_type: req.doc_type }, cid);
      });
    });

    detail.querySelector(`[data-add-promise="${cid}"]`).addEventListener('click', async () => {
      const dateVal = document.getElementById(`pDate-${cid}`).value;
      const amountVal = document.getElementById(`pAmount-${cid}`).value;
      const noteVal = document.getElementById(`pNote-${cid}`).value.trim();
      if (!dateVal || !amountVal) { toast('Add a date and amount first.'); return; }

      const { data: created, error } = await supabase.from('promise_to_pay').insert({
        business_id: business.id,
        client_id: cid,
        promised_date: dateVal,
        promised_amount: Number(amountVal),
        note: noteVal || null,
        created_by: session.user.id
      }).select().single();

      if (error) { toast('Could not save promise: ' + error.message); return; }
      promises.push(created);
      await logActivity('promise_logged', { promised_date: dateVal, promised_amount: Number(amountVal) }, cid);
      toast('Promise to pay logged.');
      renderClientDetail(cid);
      renderPromiseList();
    });

    detail.querySelector(`[data-add-note="${cid}"]`).addEventListener('click', async () => {
      const text = document.getElementById(`noteText-${cid}`).value.trim();
      if (!text) { toast('Write a note first.'); return; }

      const { data: created, error } = await supabase.from('collection_notes').insert({
        business_id: business.id,
        client_id: cid,
        note: text,
        created_by: session.user.id
      }).select().single();

      if (error) { toast('Could not save note: ' + error.message); return; }
      notes.unshift(created);
      await logActivity('note_added', { note: text }, cid);
      toast('Note saved.');
      renderClientDetail(cid);
    });

    detail.querySelectorAll('[data-resolve]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.resolve;
        const outcome = btn.dataset.outcome;
        const { error } = await supabase.from('promise_to_pay')
          .update({ status: outcome, resolved_at: new Date().toISOString() })
          .eq('id', id);
        if (error) { toast('Could not update promise: ' + error.message); return; }
        const p = promises.find(p => p.id === id);
        if (p) p.status = outcome;
        await logActivity('promise_resolved', { outcome }, cid);
        toast(`Promise marked ${outcome}.`);
        renderClientDetail(cid);
        renderPromiseList();
      });
    });
  }

  async function downloadStatement(cid) {
    const row = byClient[cid];
    const client = row.client;

    const rows = row.items.map(rv => [
      rv.description || 'Balance',
      fmtDate(rv.due_date),
      naira(Number(rv.amount)),
      naira(Number(rv.amount_paid || 0)),
      naira(rv.balance)
    ]);

    const doc = await window.KoboExport.buildTablePdf({
      style: 'branded',
      docLabel: 'Statement',
      businessName: business.name,
      metaLines: [`Statement date: ${fmtDate(new Date().toISOString())}`],
      toLabel: 'Customer',
      toName: client.name,
      toSub: client.address || '',
      columns: ['Item', 'Due date', 'Amount', 'Paid', 'Balance'],
      rightAlignCols: [2, 3, 4],
      rows,
      totals: [{ label: 'Total outstanding', value: naira(row.balance), emphasis: true }],
      note: 'This statement reflects open balances only. Contact us if any balance here looks incorrect.'
    });

    window.KoboExport.download(`Statement-${(client.name || 'customer').replace(/\s+/g, '-')}.pdf`, doc);
    await logActivity('statement_generated', { balance: row.balance }, cid);
  }

  function renderPromiseList() {
    const wrap = document.getElementById('promiseWrap');
    const list = promises.slice().sort((a, b) => new Date(a.promised_date) - new Date(b.promised_date)).filter(p => p.status === 'pending');
    if (!list.length) {
      wrap.innerHTML = '<div class="empty-note">No promises logged yet.</div>';
      return;
    }
    wrap.innerHTML = list.map(p => {
      const client = clientById(p.client_id);
      return `
        <div style="font-size:0.85rem; padding:8px 0; border-bottom:1px dashed var(--line);">
          <strong>${escapeHtml(client.name)}</strong> — ${naira(p.promised_amount)} promised for ${fmtDate(p.promised_date)}
        </div>
      `;
    }).join('');
  }

  function renderActivity() {
    const wrap = document.getElementById('activityWrap');
    if (!activity.length) {
      wrap.innerHTML = '<div class="empty-note">No activity yet.</div>';
      return;
    }
    const ACTION_LABEL = {
      promise_logged: 'Promise to pay logged',
      promise_resolved: 'Promise resolved',
      note_added: 'Collection note added',
      reminder_sent: 'Reminder sent',
      statement_generated: 'Statement generated',
      payment_logged: 'Payment logged',
      receivable_added: 'Outstanding balance added',
      dispute_flagged: 'Dispute flagged',
      dispute_resolved: 'Dispute resolved',
      document_requested: 'Document requested',
      document_received: 'Document received',
      document_chased: 'Document chase sent',
      formal_notice_generated: 'Formal notice generated',
      collections_referral: 'Referred to collections/legal'
    };
    wrap.innerHTML = activity.map(a => `
      <div style="font-size:0.82rem; padding:6px 0; border-bottom:1px dashed var(--line);">
        <span style="opacity:0.6;">${fmtDateTime(a.created_at)}</span> —
        ${ACTION_LABEL[a.action] || a.action}${a.clients ? ` · ${escapeHtml(a.clients.name)}` : ''}
      </div>
    `).join('');
  }

  function renderEntryForm() {
    const wrap = document.getElementById('entryForm');
    wrap.innerHTML = `
      <div class="form-grid">
        <div>
          <label>Client</label>
          <select id="entryClientSelect">
            <option value="">— Select existing client —</option>
            ${clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
            <option value="__new">+ Add new client</option>
          </select>
        </div>
        <div id="newClientFields" style="display:none;">
          <label>New client name</label>
          <input type="text" id="newClientName" placeholder="Client or business name">
          <label>Phone (for WhatsApp reminders)</label>
          <input type="text" id="newClientPhone" placeholder="e.g. 08012345678">
        </div>
      </div>
      <div class="form-grid">
        <div>
          <label>Description</label>
          <input type="text" id="entryDescription" placeholder="e.g. Supply of office chairs, June">
        </div>
        <div>
          <label>Amount owed</label>
          <input type="number" id="entryAmount" placeholder="0">
        </div>
      </div>
      <div class="form-grid">
        <div>
          <label>Due date</label>
          <input type="date" id="entryDueDate">
        </div>
      </div>
      <button id="entrySubmit" class="btn primary">Add outstanding balance</button>
    `;

    const select = document.getElementById('entryClientSelect');
    select.addEventListener('change', () => {
      document.getElementById('newClientFields').style.display = select.value === '__new' ? 'block' : 'none';
    });

    document.getElementById('entrySubmit').addEventListener('click', async () => {
      let clientId = select.value;
      const description = document.getElementById('entryDescription').value.trim();
      const amount = Number(document.getElementById('entryAmount').value);
      const dueDate = document.getElementById('entryDueDate').value || null;

      if (!amount || amount <= 0) { toast('Enter a valid amount.'); return; }

      if (!clientId) { toast('Select or add a client first.'); return; }

      if (clientId === '__new') {
        const name = document.getElementById('newClientName').value.trim();
        const phone = document.getElementById('newClientPhone').value.trim();
        if (!name) { toast('Enter the new client\'s name.'); return; }

        const { data: newClient, error: clientErr } = await supabase.from('clients').insert({
          business_id: business.id,
          user_id: session.user.id,
          name,
          phone: phone || null
        }).select().single();

        if (clientErr) { toast('Could not add client: ' + clientErr.message); return; }
        clients.push(newClient);
        clientId = newClient.id;
      }

      const { error } = await supabase.from('receivables').insert({
        business_id: business.id,
        client_id: clientId,
        description: description || null,
        amount,
        amount_paid: 0,
        due_date: dueDate,
        payment_status: 'unpaid',
        source: 'manual',
        created_by: session.user.id
      });

      if (error) { toast('Could not add balance: ' + error.message); return; }

      await logActivity('receivable_added', { amount }, clientId);
      toast('Outstanding balance added.');
      await loadAll();
      renderAging();
      renderLedger();
      renderEntryForm();
      computeDSO();
      renderAnalytics();
    });
  }

  async function loadAndRenderReminderSettings() {
    const { data: rules } = await supabase
      .from('reminder_rules')
      .select('thresholds, email_reminders_enabled')
      .eq('business_id', business.id)
      .maybeSingle();

    const thresholds = (rules?.thresholds || [7, 30, 60]).join(', ');
    const enabled = rules ? rules.email_reminders_enabled : true;

    const wrap = document.getElementById('reminderSettings');
    wrap.innerHTML = `
      <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; margin-bottom:10px;">
        <input type="checkbox" id="remindersEnabled" ${enabled ? 'checked' : ''}>
        Send automated email reminders
      </label>
      <label style="font-size:0.78rem; opacity:0.7; display:block; margin-bottom:3px;">Remind at these days overdue (comma-separated)</label>
      <input type="text" id="remindersThresholds" value="${escapeHtml(thresholds)}" style="width:220px; padding:8px 10px; border:1px solid var(--line); border-radius:6px; font-family:inherit; font-size:0.9rem; margin-bottom:10px;">
      <div><button id="saveReminderRules" class="btn primary small">Save</button></div>
    `;

    document.getElementById('saveReminderRules').addEventListener('click', async () => {
      const enabledVal = document.getElementById('remindersEnabled').checked;
      const thresholdsVal = document.getElementById('remindersThresholds').value
        .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);

      const { error } = await supabase.from('reminder_rules').upsert({
        business_id: business.id,
        thresholds: thresholdsVal.length ? thresholdsVal : [7, 30, 60],
        email_reminders_enabled: enabledVal,
        updated_at: new Date().toISOString()
      }, { onConflict: 'business_id' });

      if (error) { toast('Could not save reminder settings: ' + error.message); return; }
      toast('Reminder settings saved.');
    });
  }

  // ---------- Analytics ----------
  const CHART_COLORS = {
    inkGreenDeep: '#0D2620', gold: '#C79A3C', red: '#A8342A',
    lineGrey: 'rgba(35,39,34,0.12)', textGrey: '#5c625b'
  };

  function lastNMonths(n) {
    const months = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleDateString('en-GB', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() });
    }
    return months;
  }
  function monthEnd(year, month) { return new Date(year, month + 1, 0, 23, 59, 59); }
  function monthStart(year, month) { return new Date(year, month, 1, 0, 0, 0); }

  function drawChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(canvas.getContext('2d'), config);
  }

  function renderAnalytics() {
    if (!isGrowth) return;
    const hasData = receivables.length > 0;
    document.getElementById('analyticsEmpty').style.display = hasData ? 'none' : 'block';
    document.getElementById('analyticsGrid').style.display = hasData ? 'grid' : 'none';
    if (!hasData) return;

    // --- Aging distribution ---
    const outstanding = receivables
      .filter(rv => rv.payment_status !== 'paid')
      .map(rv => ({ ...rv, overdueDays: daysOverdue(rv.due_date), balance: Number(rv.amount) - Number(rv.amount_paid || 0) }));
    const buckets = { current: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
    outstanding.forEach(rv => { buckets[agingBucket(rv.overdueDays)] += rv.balance; });

    drawChart('chartAging', {
      type: 'bar',
      data: {
        labels: Object.values(BUCKET_LABEL),
        datasets: [{ data: Object.keys(BUCKET_LABEL).map(k => buckets[k]), backgroundColor: CHART_COLORS.inkGreenDeep, borderRadius: 4 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => naira(ctx.raw) } } },
        scales: { y: { ticks: { callback: (v) => '\u20a6' + Number(v).toLocaleString('en-NG') } } }
      }
    });

    // --- Top 5 debtors ---
    const topDebtors = Object.values(byClient).sort((a, b) => b.balance - a.balance).slice(0, 5);
    drawChart('chartTopDebtors', {
      type: 'bar',
      data: {
        labels: topDebtors.map(d => d.client.name),
        datasets: [{ data: topDebtors.map(d => d.balance), backgroundColor: CHART_COLORS.gold, borderRadius: 4 }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => naira(ctx.raw) } } },
        scales: { x: { ticks: { callback: (v) => '\u20a6' + Number(v).toLocaleString('en-NG') } } }
      }
    });

    // --- Collected vs new balances, last 6 months ---
    const months = lastNMonths(6);
    const collectedByMonth = months.map(({ year, month }) => {
      const start = monthStart(year, month), end = monthEnd(year, month);
      return paymentEvents
        .filter(p => { const d = new Date(p.paid_at); return d >= start && d <= end; })
        .reduce((s, p) => s + Number(p.amount), 0);
    });
    const newByMonth = months.map(({ year, month }) => {
      const start = monthStart(year, month), end = monthEnd(year, month);
      return receivables
        .filter(rv => { const d = new Date(rv.created_at); return d >= start && d <= end; })
        .reduce((s, rv) => s + Number(rv.amount), 0);
    });

    drawChart('chartMonthly', {
      type: 'bar',
      data: {
        labels: months.map(m => m.label),
        datasets: [
          { label: 'New balances', data: newByMonth, backgroundColor: '#d8d4c8' },
          { label: 'Collected', data: collectedByMonth, backgroundColor: CHART_COLORS.inkGreenDeep }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${naira(ctx.raw)}` } } },
        scales: { y: { ticks: { callback: (v) => '\u20a6' + Number(v).toLocaleString('en-NG') } } }
      }
    });

    // --- DSO trend, last 6 months ---
    // Same formula as computeDSO(), evaluated as-of each month-end instead
    // of "now".
    const dsoByMonth = months.map(({ year, month }) => {
      const asOf = monthEnd(year, month);
      const outstandingAsOfMonth = outstandingAsOf(asOf);
      const recentTotal = recentSalesAsOf(asOf);
      return recentTotal > 0 ? Math.round((outstandingAsOfMonth / recentTotal) * 90) : null;
    });

    drawChart('chartDSOTrend', {
      type: 'line',
      data: {
        labels: months.map(m => m.label),
        datasets: [{ data: dsoByMonth, borderColor: CHART_COLORS.gold, backgroundColor: CHART_COLORS.gold, tension: 0.3, spanGaps: true }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.raw ?? '—'} days` } } },
        scales: { y: { ticks: { callback: (v) => v + 'd' } } }
      }
    });
  }

  await loadAll();
  computePaymentBehaviour();
  computeDSO();
  renderAging();
  populateAssigneeFilter();
  document.getElementById('assigneeFilter').addEventListener('change', renderLedger);
  renderLedger();
  renderEntryForm();
  renderPromiseList();
  renderActivity();
  renderAnalytics();
  renderCashFlowForecast();
  renderTeamWorkload();
  loadAndRenderReminderSettings();
  loadAndRenderPriorities();
  renderDailySummary();
  rmDataLoaded = true;
})();

async function renderDailySummary() {
  const wrap = document.getElementById('dailySummaryWrap');
  if (!wrap) return;

  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  async function periodStats(fromDate, toDate) {
    const from = fromDate.toISOString();
    const to = toDate.toISOString();

    const [{ data: added }, { data: payments }, { data: promises }] = await Promise.all([
      supabase.from('receivables').select('amount')
        .eq('business_id', business.id).gte('created_at', from).lt('created_at', to),
      supabase.from('receivable_payments').select('amount')
        .eq('business_id', business.id).gte('paid_at', from).lt('paid_at', to),
      supabase.from('promise_to_pay').select('promised_amount')
        .eq('business_id', business.id).gte('created_at', from).lt('created_at', to),
    ]);

    return {
      addedCount: (added || []).length,
      addedTotal: (added || []).reduce((s, r) => s + Number(r.amount || 0), 0),
      paymentCount: (payments || []).length,
      paymentTotal: (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0),
      promiseCount: (promises || []).length,
      promiseTotal: (promises || []).reduce((s, p) => s + Number(p.promised_amount || 0), 0),
    };
  }

  function describe(stats, label) {
    const parts = [];
    if (stats.addedCount > 0) {
      parts.push(`added ${stats.addedCount} new outstanding balance${stats.addedCount === 1 ? '' : 's'} worth ${naira(stats.addedTotal)}`);
    }
    if (stats.paymentCount > 0) {
      parts.push(`collected ${naira(stats.paymentTotal)} in payment${stats.paymentCount === 1 ? '' : 's'}`);
    }
    if (stats.promiseCount > 0) {
      parts.push(`got ${stats.promiseCount} new promise${stats.promiseCount === 1 ? '' : 's'} to pay worth ${naira(stats.promiseTotal)}`);
    }
    if (!parts.length) {
      return `<p>${label}, there was no recorded activity — no new balances, payments, or promises to pay.</p>`;
    }
    const sentence = parts.length === 1 ? parts[0]
      : parts.slice(0, -1).join(', ') + (parts.length > 2 ? ', and ' : ' and ') + parts[parts.length - 1];
    return `<p>${label}, you ${sentence}.</p>`;
  }

  try {
    const [todayStats, yesterdayStats] = await Promise.all([
      periodStats(startOfToday, now),
      periodStats(startOfYesterday, startOfToday),
    ]);
    wrap.innerHTML = describe(yesterdayStats, 'Yesterday') + describe(todayStats, 'So far today');
  } catch (err) {
    wrap.innerHTML = '<p class="empty-note">Could not load activity summary.</p>';
  }
}
