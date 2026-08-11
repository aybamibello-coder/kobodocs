// ---------- Freelancer Tax & Invoicing app access guard ----------
// User-keyed, not business-keyed — this is a personal tool for individual
// freelancers/remote workers, not a registered-business feature (unlike
// Business Suite, Payroll, e-Signature's business flows, WHT Tracker).
// Free tier is permanently usable (capped at 5 lifetime ledger entries,
// enforced in app.js on insert) rather than a time-limited trial, so
// there's no trial-row creation here — just read-or-default.
window.FreelanceGuard = {
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

    const { data: subscription } = await supabase
      .from('freelance_subscriptions')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    const isPaidActive = subscription?.status === 'active' && subscription?.plan === 'pro'
      && subscription.expires_at && new Date(subscription.expires_at) > new Date();

    return { session, supabase, subscription, isPro: !!isPaidActive };
  }
};
