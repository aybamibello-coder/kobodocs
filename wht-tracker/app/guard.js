// ---------- WHT Tracker app access guard ----------
// Like Payroll, doesn't require a Suite subscription — just a logged-in
// user who owns a business record. Access itself (payg credits OR an
// active plan allowance) is checked by the page, since a business with
// zero credits should still see the picker screen rather than be bounced.
window.WhtGuard = {
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

    const { data: subscription } = await supabase
      .from('wht_subscriptions')
      .select('*')
      .eq('business_id', business.id)
      .maybeSingle();

    const subActive = !!subscription && subscription.status === 'active' &&
      subscription.expires_at && new Date(subscription.expires_at) > new Date();
    const allowanceLeft = subActive && (subscription.records_used_this_period || 0) < (subscription.record_allowance || 0);
    const hasCredits = !!subscription && subscription.plan === 'payg' && (subscription.credits_balance || 0) > 0;

    return { session, business, supabase, subscription, subActive, allowanceLeft, hasCredits, canRecord: allowanceLeft || hasCredits };
  }
};
