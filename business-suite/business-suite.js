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
  // Ordered + limited to 1: an owner can have more than one business, and
  // a bare .maybeSingle() here throws once they do, which used to make
  // this page silently ignore an existing trial/subscription.
  const { data: business } = await supabase
    .from('businesses')
    .select('id, suite_status, suite_trial_ends_at, suite_expires_at')
    .eq('owner_user_id', session.user.id)
    .order('created_at', { ascending: true })
    .limit(1)
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
    startBtn.textContent = 'Subscribe now';
    showMsg('Your free trial has ended. Subscribe to keep using Business Suite.', 'error');
    startBtn.onclick = async () => {
      startBtn.disabled = true;
      startBtn.textContent = 'Redirecting…';
      try {
        await KoboSubscribe.start('init-suite-payment', { billing_cycle: billingCycle });
      } catch {
        startBtn.disabled = false;
        startBtn.textContent = 'Subscribe now';
      }
    };
  }
})();

KoboSubscribe.resumePendingIfAny();

// ---------- Start trial button (default flow, before any state override above) ----------
async function startTrial() {
  const session = await window.KoboAuth.getSession();
  if (!session) return; // shouldn't happen — callers only invoke this once a session exists

  startBtn.disabled = true;
  startBtn.textContent = 'Starting your trial…';

  const supabase = window.KoboAuth.supabase;
  const profile = await window.KoboAuth.getProfile();

  // Find or create this user's business row
  // Same multi-business-safe lookup as above.
  let { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_user_id', session.user.id)
    .order('created_at', { ascending: true })
    .limit(1)
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
}

startBtn.addEventListener('click', async () => {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const session = await window.KoboAuth.getSession();
  if (!session) {
    // Preserve intent across signup — same pattern KoboSubscribe uses for
    // paid checkouts — so the person lands back here and their trial starts
    // automatically, instead of landing on the generic account dashboard.
    sessionStorage.setItem('kobo_pending_trial_start', '1');
    showMsg('Create a free KoboDocs account first — you\'ll come straight back here to start your trial.', 'error');
    const currentUrl = window.location.pathname + window.location.search;
    setTimeout(() => { window.location.href = `/account/?redirect=${encodeURIComponent(currentUrl)}`; }, 1400);
    return;
  }

  await startTrial();
});

// If the person was bounced through signup/login mid-trial-start, resume
// automatically the moment they land back here signed in.
(async function resumePendingTrialIfAny() {
  if (!sessionStorage.getItem('kobo_pending_trial_start')) return;

  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });
  const session = await window.KoboAuth.getSession();
  if (!session) return;

  sessionStorage.removeItem('kobo_pending_trial_start');
  await startTrial();
})();

// ---------- Growth tier: pricing toggle + upgrade ----------
const GROWTH_PRICE_MONTHLY = 28000;
const GROWTH_PRICE_YEARLY = 280000; // 2 months free vs 12 x monthly

const growthPriceEl = document.getElementById('growthPlanPrice');
const growthMonthlyBtn = document.getElementById('growthMonthlyBtn');
const growthYearlyBtn = document.getElementById('growthYearlyBtn');
const growthBtn = document.getElementById('growthUpgradeBtn');
const growthMsgEl = document.getElementById('growthMsg');

let growthBillingCycle = 'monthly';

function renderGrowthPrice() {
  if (growthBillingCycle === 'monthly') {
    growthPriceEl.innerHTML = `₦${GROWTH_PRICE_MONTHLY.toLocaleString()} <small>/month</small>`;
    growthMonthlyBtn.classList.add('active');
    growthYearlyBtn.classList.remove('active');
  } else {
    growthPriceEl.innerHTML = `₦${GROWTH_PRICE_YEARLY.toLocaleString()} <small>/year</small>`;
    growthYearlyBtn.classList.add('active');
    growthMonthlyBtn.classList.remove('active');
  }
}

growthMonthlyBtn.addEventListener('click', () => { growthBillingCycle = 'monthly'; renderGrowthPrice(); });
growthYearlyBtn.addEventListener('click', () => { growthBillingCycle = 'yearly'; renderGrowthPrice(); });
renderGrowthPrice();

function showGrowthMsg(text, type) {
  growthMsgEl.textContent = text;
  growthMsgEl.className = type;
}

(async function checkGrowthState() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const session = await window.KoboAuth.getSession();
  if (!session) return;

  const supabase = window.KoboAuth.supabase;
  const { data: business } = await supabase
    .from('businesses')
    .select('id, suite_status, suite_tier, suite_trial_ends_at, suite_expires_at')
    .eq('owner_user_id', session.user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!business) return;

  const hasAccess = (business.suite_status === 'trial' && new Date(business.suite_trial_ends_at) > new Date())
    || (business.suite_status === 'active' && new Date(business.suite_expires_at) > new Date());

  if (business.suite_tier === 'growth' && hasAccess) {
    growthBtn.textContent = 'Go to Credit & Collections';
    showGrowthMsg('You already have Growth — enjoy the full Credit & Collections Manager.', 'success');
    growthBtn.onclick = () => { window.location.href = '/business-suite/app/credit/'; };
  }
})();

growthBtn.addEventListener('click', async () => {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const session = await window.KoboAuth.getSession();
  if (!session) {
    showGrowthMsg('Create a free KoboDocs account first, then come back to upgrade.', 'error');
    setTimeout(() => { window.location.href = '/account/'; }, 1800);
    return;
  }

  const supabase = window.KoboAuth.supabase;
  const { data: business } = await supabase
    .from('businesses')
    .select('id, suite_status')
    .eq('owner_user_id', session.user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!business || business.suite_status === 'none') {
    showGrowthMsg('Start your Starter trial first, then upgrade to Growth any time.', 'error');
    return;
  }

  growthBtn.disabled = true;
  growthBtn.textContent = 'Redirecting…';
  try {
    await KoboSubscribe.start('init-suite-growth-payment', { billing_cycle: growthBillingCycle });
  } catch {
    growthBtn.disabled = false;
    growthBtn.textContent = 'Upgrade to Growth';
  }
});
