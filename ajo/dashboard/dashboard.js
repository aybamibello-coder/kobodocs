(async function init() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const session = await window.KoboAuth.getSession();
  if (!session) {
    document.getElementById('loggedOutNotice').classList.remove('hidden');
    return;
  }

  document.getElementById('circlesArea').classList.remove('hidden');
  await loadCircles();
})();

async function loadCircles() {
  const { data, error } = await window.KoboAuth.supabase
    .from('ajo_circles')
    .select('id, name, contribution_amount, frequency, plan, plan_expires_at, created_at')
    .order('created_at', { ascending: false });

  const listEl = document.getElementById('circleList');
  const emptyEl = document.getElementById('emptyState');

  if (error) {
    listEl.innerHTML = `<p class="auth-msg error">Could not load circles: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    emptyEl.classList.remove('hidden');
    listEl.innerHTML = '';
    return;
  }

  emptyEl.classList.add('hidden');
  const naira = (n) => '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');

  listEl.innerHTML = data.map(c => {
    const isCooperative = c.plan === 'cooperative' && c.plan_expires_at && new Date(c.plan_expires_at) > new Date();
    return `
      <div class="circle-list-card">
        <div>
          <h3>${c.name}</h3>
          <div class="meta">${naira(c.contribution_amount)} · ${c.frequency}</div>
        </div>
        <div class="circle-card-actions">
          <span class="circle-plan-tag ${isCooperative ? 'cooperative' : 'free'}">${isCooperative ? 'Cooperative' : 'Free'}</span>
          <a href="/ajo/circle/?id=${c.id}" class="btn btn-primary">Manage</a>
        </div>
      </div>
    `;
  }).join('');
}

document.getElementById('showFormBtn').addEventListener('click', () => {
  document.getElementById('newCircleForm').classList.toggle('open');
});

document.getElementById('createCircleBtn').addEventListener('click', async () => {
  const btn = document.getElementById('createCircleBtn');
  const msg = document.getElementById('createMsg');
  const originalText = btn.textContent;

  const name = document.getElementById('circleName').value.trim();
  const contributionAmount = parseFloat(document.getElementById('contributionAmount').value) || 0;
  const frequency = document.getElementById('frequency').value;
  const startDate = document.getElementById('startDate').value;

  if (!name || !contributionAmount || !startDate) {
    msg.className = 'auth-msg error';
    msg.textContent = 'Fill in a name, contribution amount, and start date.';
    return;
  }

  btn.textContent = 'Creating…';
  btn.disabled = true;

  try {
    const session = await window.KoboAuth.getSession();
    const { data, error } = await window.KoboAuth.supabase
      .from('ajo_circles')
      .insert({
        user_id: session.user.id,
        name,
        contribution_amount: contributionAmount,
        frequency,
        start_date: startDate
      })
      .select()
      .single();

    if (error) throw error;

    window.location.href = `/ajo/circle/?id=${data.id}`;
  } catch (err) {
    msg.className = 'auth-msg error';
    msg.textContent = 'Could not create circle: ' + err.message;
    btn.textContent = originalText;
    btn.disabled = false;
  }
});
