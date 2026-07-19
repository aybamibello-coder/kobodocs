// ---------- Business Suite: pricing toggle + 21-day trial gating ----------
const PRICE_MONTHLY = 15000;
const PRICE_YEARLY = 150000; // 2 months free vs 12 x monthly
const TRIAL_DAYS = 21;

const priceEl = document.getElementById('planPrice');
const monthlyBtn = document.getElementById('monthlyBtn');
const yearlyBtn = document.getElementById('yearlyBtn');
const startBtn = document.getElementById('startTrialBtn');
const msgEl = document.getElementById('trialMsg');

let billingCycle = 'monthly';

function renderPrice() {
  if (billingCycle === 'monthly') {
    priceEl.innerHTML = `₦${PRICE_MONTHLY.toLocaleString()} <small>/month</small>`;
    monthlyBtn.classList.add('active');
    yearlyBtn.classList.remove('active');
  } else {
    priceEl.innerHTML = `₦${PRICE_YEARLY.toLocaleString()} <small>/year</small>`;
    yearlyBtn.classList.add('active');
    monthlyBtn.classList.remove('active');
  }
}

monthlyBtn.addEventListener('click', () => { billingCycle = 'monthly'; renderPrice(); });
yearlyBtn.addEventListener('click', () => { billingCycle = 'yearly'; renderPrice(); });
renderPrice();

function showMsg(text, type) {
  msgEl.textContent = text;
  msgEl.className = type; // 'success' | 'error' | 'info'
}

function daysLeft(endDate) {
  const ms = new Date(endDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// ---------- Reflect existing trial/subscription state on load ----------
(async function checkExistingState() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const session = await window.KoboAuth.getSession();
  if (!session) return; // no account yet — leave the default "start trial" state

  const supabase = window.KoboAuth.supabase;
  const { data: business } = await supabase
    .from('businesses')
    .select('id, suite_status, suite_trial_ends_at, suite_expires_at')
    .eq('owner_user_id', session.user.id)
    .maybeSingle();

  if (!business) return; // no business yet — leave default state

  if (business.suite_status === 'trial' && new Date(business.suite_trial_ends_at) > new Date()) {
    startBtn.textContent = 'Continue to Business Suite';
    showMsg(`Your trial is active — ${daysLeft(business.suite_trial_ends_at)} day(s) left.`, 'info');
    startBtn.onclick = () => { window.location.href = '/business-suite/app/'; };
  } else if (business.suite_status === 'active' && new Date(business.suite_expires_at) > new Date()) {
    startBtn.textContent = 'Go to Business Suite';
    showMsg('You already have an active Business Suite subscription.', 'success');
    startBtn.onclick = () => { window.location.href = '/business-suite/app/'; };
  } else if (business.suite_status === 'trial' || business.suite_status === 'expired') {
    startBtn.textContent = 'Subscribe to continue';
    showMsg('Your free trial has ended. Payment integration is coming soon — check back shortly to subscribe.', 'error');
    startBtn.disabled = true;
  }
})();

// ---------- Start trial button (default flow, before any state override above) ----------
startBtn.addEventListener('click', async () => {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const session = await window.KoboAuth.getSession();
  if (!session) {
    showMsg('Create a free KoboDocs account first, then come back to start your trial.', 'error');
    setTimeout(() => { window.location.href = '/account/'; }, 1800);
    return;
  }

  startBtn.disabled = true;
  startBtn.textContent = 'Starting your trial…';

  const supabase = window.KoboAuth.supabase;
  const profile = await window.KoboAuth.getProfile();

  // Find or create this user's business row
  let { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_user_id', session.user.id)
    .maybeSingle();

  if (!business) {
    const { data: created, error: createErr } = await supabase
      .from('businesses')
      .insert({
        owner_user_id: session.user.id,
        name: (profile && profile.business_name) || 'My Business'
      })
      .select()
      .single();
    if (createErr) {
      showMsg('Something went wrong creating your business profile. Please try again.', 'error');
      startBtn.disabled = false;
      startBtn.textContent = 'Start your 21-day free trial';
      return;
    }
    business = created;
  }

  if (business.suite_status !== 'none') {
    showMsg('A trial or subscription already exists for this business.', 'error');
    startBtn.disabled = false;
    return;
  }

  const trialEnds = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: updateErr } = await supabase
    .from('businesses')
    .update({
      suite_status: 'trial',
      suite_trial_started_at: new Date().toISOString(),
      suite_trial_ends_at: trialEnds,
      suite_billing_cycle: billingCycle
    })
    .eq('id', business.id);

  if (updateErr) {
    showMsg('Could not start your trial. Please try again.', 'error');
    startBtn.disabled = false;
    startBtn.textContent = 'Start your 21-day free trial';
    return;
  }

  showMsg(`Trial started! You have ${TRIAL_DAYS} days of full access.`, 'success');
  setTimeout(() => { window.location.href = '/business-suite/app/'; }, 1200);
});
