const naira = (n) => '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');
const FUNCTIONS_URL = 'https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1';

function getCircleId() {
  return new URLSearchParams(window.location.search).get('id');
}

let circle = null;
let members = [];
let session = null;
let isCooperativeActive = false;
let currentCycle = 1;

function daysBetween(a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function computeCurrentCycle(startDateStr, frequency) {
  const start = new Date(startDateStr);
  const today = new Date();
  if (today < start) return 1;
  if (frequency === 'weekly') {
    return Math.floor(daysBetween(start, today) / 7) + 1;
  }
  // monthly
  const months = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  return Math.max(1, months + 1);
}

function cycleDate(startDateStr, frequency, cycleNumber) {
  const start = new Date(startDateStr);
  if (frequency === 'weekly') {
    const d = new Date(start);
    d.setDate(d.getDate() + (cycleNumber - 1) * 7);
    return d;
  }
  const d = new Date(start);
  d.setMonth(d.getMonth() + (cycleNumber - 1));
  return d;
}

async function logAudit(action, details) {
  if (!isCooperativeActive) return;
  try {
    await window.KoboAuth.supabase.from('ajo_audit_log').insert({
      circle_id: circle.id,
      actor_user_id: session.user.id,
      action,
      details: details || {}
    });
  } catch { /* non-fatal — the UI action already succeeded */ }
}

(async function init() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  session = await window.KoboAuth.getSession();
  const circleId = getCircleId();
  if (!session || !circleId) {
    window.location.href = '/ajo/dashboard/';
    return;
  }

  const { data, error } = await window.KoboAuth.supabase
    .from('ajo_circles')
    .select('*')
    .eq('id', circleId)
    .maybeSingle();

  if (error || !data) {
    document.getElementById('loadError').classList.remove('hidden');
    document.getElementById('loadError').textContent = 'Circle not found, or you don\'t have access to it.';
    return;
  }

  circle = data;
  isCooperativeActive = circle.plan === 'cooperative' && circle.plan_expires_at && new Date(circle.plan_expires_at) > new Date();
  currentCycle = computeCurrentCycle(circle.start_date, circle.frequency);

  document.getElementById('circleContent').classList.remove('hidden');
  renderHeader();
  await loadMembers();
  await renderLedger();
  await renderAdmins();
  await renderAuditLog();
  await renderDisputes();
})();

function renderHeader() {
  document.getElementById('circleName').textContent = circle.name;
  document.getElementById('circleMeta').textContent = `${naira(circle.contribution_amount)} · ${circle.frequency} · started ${circle.start_date}`;
  const tag = document.getElementById('circlePlanTag');
  tag.textContent = isCooperativeActive ? 'Cooperative' : 'Free';
  tag.className = 'circle-plan-tag ' + (isCooperativeActive ? 'cooperative' : 'free');
  if (!isCooperativeActive) document.getElementById('upgradeCard').classList.remove('hidden');
}

// ---------- Members ----------
async function loadMembers() {
  const { data, error } = await window.KoboAuth.supabase
    .from('ajo_members')
    .select('*')
    .eq('circle_id', circle.id)
    .order('payout_position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (!error) members = data || [];
  renderMembers();
}

function renderMembers() {
  const el = document.getElementById('memberList');
  if (members.length === 0) {
    el.innerHTML = '<p style="opacity:0.6; font-size:0.9rem;">No members yet — add the first one below.</p>';
    return;
  }
  el.innerHTML = members.map((m, i) => `
    <div class="member-row">
      <span>${i + 1}. ${m.name}${m.phone ? ' · ' + m.phone : ''}</span>
      <button type="button" class="btn btn-ghost small-btn btn-remove" data-remove-member="${m.id}">Remove</button>
    </div>
  `).join('');

  el.querySelectorAll('[data-remove-member]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this member? Their contribution history stays on record.')) return;
      const id = btn.getAttribute('data-remove-member');
      await window.KoboAuth.supabase.from('ajo_members').delete().eq('id', id);
      await logAudit('member_removed', { member_id: id });
      await loadMembers();
      await renderLedger();
    });
  });
}

document.getElementById('addMemberBtn').addEventListener('click', async () => {
  const msg = document.getElementById('memberMsg');
  const name = document.getElementById('newMemberName').value.trim();
  const phone = document.getElementById('newMemberPhone').value.trim();
  if (!name) {
    msg.className = 'auth-msg error';
    msg.textContent = 'Enter a name.';
    return;
  }

  const { error } = await window.KoboAuth.supabase.from('ajo_members').insert({
    circle_id: circle.id,
    name,
    phone: phone || null,
    payout_position: members.length
  });

  if (error) {
    msg.className = 'auth-msg error';
    msg.textContent = error.message.includes('Free circles are limited')
      ? error.message
      : 'Could not add member: ' + error.message;
    return;
  }

  msg.className = 'auth-msg success';
  msg.textContent = 'Member added.';
  document.getElementById('newMemberName').value = '';
  document.getElementById('newMemberPhone').value = '';
  await logAudit('member_added', { name });
  await loadMembers();
  await renderLedger();
});

// ---------- Rotation & ledger ----------
async function renderLedger() {
  document.getElementById('cycleLabel').textContent =
    `Cycle ${currentCycle} — ${cycleDate(circle.start_date, circle.frequency, currentCycle).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const ledgerEl = document.getElementById('ledgerList');
  if (members.length === 0) {
    ledgerEl.innerHTML = '<p style="opacity:0.6; font-size:0.9rem;">Add members above to start tracking contributions.</p>';
    return;
  }

  const { data: contributions } = await window.KoboAuth.supabase
    .from('ajo_contributions')
    .select('*')
    .eq('circle_id', circle.id)
    .eq('cycle_number', currentCycle);

  const paidMap = {};
  (contributions || []).forEach(c => { paidMap[c.member_id] = c; });

  const collectorIndex = (currentCycle - 1) % members.length;

  ledgerEl.innerHTML = members.map((m, i) => {
    const contribution = paidMap[m.id];
    const isPaid = contribution && contribution.paid;
    const isCollector = i === collectorIndex;
    return `
      <div class="member-row">
        <span>${m.name} ${isCollector ? '<span class="status-tag collector">Collects this cycle</span>' : ''}</span>
        <span style="display:flex; align-items:center; gap:10px;">
          <span class="status-tag ${isPaid ? 'paid' : ''}">${isPaid ? 'Paid' : 'Pending'}</span>
          ${!isPaid ? `<button type="button" class="btn btn-primary small-btn" data-mark-paid="${m.id}">Mark paid</button>` : ''}
        </span>
      </div>
    `;
  }).join('');

  ledgerEl.querySelectorAll('[data-mark-paid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const memberId = btn.getAttribute('data-mark-paid');
      await window.KoboAuth.supabase.from('ajo_contributions').upsert({
        circle_id: circle.id,
        member_id: memberId,
        cycle_number: currentCycle,
        amount: circle.contribution_amount,
        paid: true,
        paid_at: new Date().toISOString()
      }, { onConflict: 'circle_id,member_id,cycle_number' });
      await logAudit('contribution_marked_paid', { member_id: memberId, cycle: currentCycle });
      await renderLedger();
    });
  });
}

document.getElementById('prevCycleBtn').addEventListener('click', async () => {
  if (currentCycle <= 1) return;
  currentCycle--;
  await renderLedger();
});
document.getElementById('nextCycleBtn').addEventListener('click', async () => {
  currentCycle++;
  await renderLedger();
});

// ---------- Admins (Cooperative only) ----------
async function renderAdmins() {
  const body = document.getElementById('adminsBody');
  if (!isCooperativeActive) {
    body.innerHTML = `<div class="locked-feature">Multiple admins require the Cooperative Plan. <a href="#upgradeCard">Upgrade this circle</a> to unlock.</div>`;
    return;
  }

  const { data } = await window.KoboAuth.supabase
    .from('ajo_circle_admins')
    .select('id, role, user_id')
    .eq('circle_id', circle.id);

  const listHtml = (data || []).map(a => `
    <div class="admin-row"><span>${a.role}</span><span style="opacity:0.6; font-size:0.85rem;">${a.user_id}</span></div>
  `).join('') || '<p style="opacity:0.6; font-size:0.9rem;">No additional admins yet — you\'re the only one.</p>';

  body.innerHTML = `
    ${listHtml}
    <div class="field-row field-row-spaced">
      <div class="field-group">
        <label for="newAdminEmail">Email (must already have a KoboDocs account)</label>
        <input type="email" id="newAdminEmail" placeholder="secretary@example.com">
      </div>
      <div class="field-group">
        <label for="newAdminRole">Role</label>
        <select id="newAdminRole">
          <option value="secretary">Secretary</option>
          <option value="treasurer">Treasurer</option>
          <option value="auditor">Auditor</option>
          <option value="chairman">Chairman</option>
        </select>
      </div>
    </div>
    <button type="button" class="btn btn-primary small-btn" id="addAdminBtn">+ Add admin</button>
    <p class="auth-msg" id="adminMsg"></p>
  `;

  document.getElementById('addAdminBtn').addEventListener('click', async () => {
    const msg = document.getElementById('adminMsg');
    const email = document.getElementById('newAdminEmail').value.trim();
    const role = document.getElementById('newAdminRole').value;
    if (!email) { msg.className = 'auth-msg error'; msg.textContent = 'Enter an email.'; return; }

    const btn = document.getElementById('addAdminBtn');
    btn.disabled = true;
    try {
      const res = await fetch(`${FUNCTIONS_URL}/add-circle-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ circle_id: circle.id, email, role })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Could not add admin');
      msg.className = 'auth-msg success';
      msg.textContent = 'Admin added.';
      await renderAdmins();
      await renderAuditLog();
    } catch (err) {
      msg.className = 'auth-msg error';
      msg.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- Audit log (Cooperative only) ----------
async function renderAuditLog() {
  const body = document.getElementById('auditBody');
  if (!isCooperativeActive) {
    body.innerHTML = `<div class="locked-feature">The audit log requires the Cooperative Plan. <a href="#upgradeCard">Upgrade this circle</a> to unlock.</div>`;
    return;
  }

  const { data } = await window.KoboAuth.supabase
    .from('ajo_audit_log')
    .select('*')
    .eq('circle_id', circle.id)
    .order('created_at', { ascending: false })
    .limit(30);

  body.innerHTML = (data || []).map(entry => `
    <div class="audit-row">
      <span>${entry.action.replace(/_/g, ' ')}</span>
      <span style="opacity:0.6; font-size:0.8rem; font-family:'Space Mono', monospace;">${new Date(entry.created_at).toLocaleString('en-GB')}</span>
    </div>
  `).join('') || '<p style="opacity:0.6; font-size:0.9rem;">No activity recorded yet.</p>';
}

// ---------- Disputes (Cooperative only) ----------
async function renderDisputes() {
  const body = document.getElementById('disputesPanel').querySelector('#disputesBody') || document.getElementById('disputesBody');
  if (!isCooperativeActive) {
    body.innerHTML = `<div class="locked-feature">The dispute log requires the Cooperative Plan. <a href="#upgradeCard">Upgrade this circle</a> to unlock.</div>`;
    return;
  }

  const { data } = await window.KoboAuth.supabase
    .from('ajo_disputes')
    .select('*')
    .eq('circle_id', circle.id)
    .order('created_at', { ascending: false });

  const memberName = (id) => (members.find(m => m.id === id) || {}).name || 'Unknown member';

  const listHtml = (data || []).map(d => `
    <div class="dispute-row">
      <span>${memberName(d.member_id)}: "${d.claim_text}"</span>
      <span class="status-tag ${d.status === 'resolved' ? 'paid' : ''}">${d.status}</span>
    </div>
  `).join('') || '<p style="opacity:0.6; font-size:0.9rem;">No disputes recorded.</p>';

  body.innerHTML = `
    ${listHtml}
    <div class="field-row field-row-spaced">
      <div class="field-group">
        <label for="disputeMember">Member</label>
        <select id="disputeMember">${members.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</select>
      </div>
      <div class="field-group">
        <label for="disputeClaim">Claim</label>
        <input type="text" id="disputeClaim" placeholder="e.g. Says they paid cycle 4 in cash">
      </div>
    </div>
    <button type="button" class="btn btn-primary small-btn" id="addDisputeBtn">+ Record dispute</button>
    <p class="auth-msg" id="disputeMsg"></p>
  `;

  document.getElementById('addDisputeBtn').addEventListener('click', async () => {
    const msg = document.getElementById('disputeMsg');
    const memberId = document.getElementById('disputeMember').value;
    const claim = document.getElementById('disputeClaim').value.trim();
    if (!claim || !memberId) { msg.className = 'auth-msg error'; msg.textContent = 'Select a member and describe the claim.'; return; }

    const { error } = await window.KoboAuth.supabase.from('ajo_disputes').insert({
      circle_id: circle.id,
      member_id: memberId,
      raised_by_user_id: session.user.id,
      claim_text: claim
    });
    if (error) { msg.className = 'auth-msg error'; msg.textContent = error.message; return; }

    msg.className = 'auth-msg success';
    msg.textContent = 'Dispute recorded.';
    await logAudit('dispute_raised', { member_id: memberId });
    await renderDisputes();
    await renderAuditLog();
  });
}

// ---------- Upgrade ----------
document.getElementById('upgradeBtn').addEventListener('click', async () => {
  const btn = document.getElementById('upgradeBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Redirecting…';
  btn.disabled = true;

  const billingCycle = document.getElementById('billingCycleSelect').value;

  try {
    const res = await fetch(`${FUNCTIONS_URL}/init-cooperative-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ circle_id: circle.id, billing_cycle: billingCycle })
    });
    const data = await res.json();
    if (!res.ok || !data.authorization_url) throw new Error(data.error || 'Could not start checkout');
    window.location.href = data.authorization_url;
  } catch (err) {
    alert('Checkout failed: ' + err.message);
    btn.textContent = originalText;
    btn.disabled = false;
  }
});
