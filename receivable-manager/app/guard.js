// ---------- Receivable Manager app access guard ----------
// Standalone product — doesn't require a Business Suite subscription,
// just a logged-in user who owns a business record. Owners can have more
// than one business (see /business-suite/app/my-businesses/), so the
// lookup below is ordered + limited to 1 rather than a bare .maybeSingle()
// — that would throw once an owner has 2+ businesses, which used to send
// people here to a false "no active plan" page. Picks the oldest (first
// created) as the default; there's no business-switcher on this product
// yet, unlike Business Suite's ?business_id= param.
//
// Two paid tiers (Starter / Growth) plus a one-time 21-day trial of
// Growth for every new business: the very first time a business hits
// this guard with no receivable_subscriptions row at all, one is created
// here with status='trialing', plan='growth', expires_at = +21 days.
// Because the row's existence (not its status) is what prevents another
// trial, this only ever fires once per business — even after the trial
// lapses the row is still there, just expired.
window.ReceivableGuard = {
  async requireAccess() {
    await new Promise(r => {
      if (window.KoboAuth) return r();
      window.addEventListener('kobo-auth-ready', r, { once: true });
    });

    const session = await window.KoboAuth.getSession();
    if (!session) {
      window.location.href = '/account/?redirect=' + encodeURIComponent(window.location.pathname);
      return null;
    }

    const supabase = window.KoboAuth.supabase;

    const { data: business } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('owner_user_id', session.user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!business) {
      window.location.href = '/business-suite/';
      return null;
    }

    let { data: subscription } = await supabase
      .from('receivable_subscriptions')
      .select('*')
      .eq('business_id', business.id)
      .maybeSingle();

    if (!subscription) {
      const trialExpiry = new Date();
      trialExpiry.setDate(trialExpiry.getDate() + 21);
      const { data: created } = await supabase
        .from('receivable_subscriptions')
        .insert({
          business_id: business.id,
          plan: 'growth',
          status: 'trialing',
          billing_cycle: null,
          expires_at: trialExpiry.toISOString()
        })
        .select('*')
        .maybeSingle();
      subscription = created;
    }

    const isTrialing = subscription?.status === 'trialing' && subscription.expires_at && new Date(subscription.expires_at) > new Date();
    const isPaidActive = subscription?.status === 'active' && subscription.expires_at && new Date(subscription.expires_at) > new Date();
    const subActive = isTrialing || isPaidActive;

    // While trialing, the trial is of Growth — full access regardless of
    // what `plan` says. Once the trial lapses (or was never converted),
    // effectivePlan falls back to whatever the business actually pays for.
    const effectivePlan = isTrialing ? 'growth' : (subscription?.plan || 'starter');

    let trialDaysLeft = null;
    if (isTrialing) {
      trialDaysLeft = Math.max(0, Math.ceil((new Date(subscription.expires_at) - new Date()) / (1000 * 60 * 60 * 24)));
    }

    return { session, business, supabase, subscription, subActive, isTrialing, effectivePlan, trialDaysLeft };
  }
};
