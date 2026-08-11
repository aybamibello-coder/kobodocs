// ---------- Payroll app access guard ----------
// Unlike Business Suite, Payroll doesn't require a Suite subscription —
// just a logged-in user who owns a business record. Subscription status
// (payroll_subscriptions) is checked separately by the page itself, since
// an unsubscribed owner should still see the "subscribe" screen rather
// than be redirected away.
//
// Owners can have more than one business (see /business-suite/app/my-businesses/),
// so this lookup is ordered + limited to 1 rather than a bare .maybeSingle()
// — that would throw once an owner has 2+ businesses, silently bouncing
// them to the marketing page instead of the app. Picks the oldest business.
window.PayrollGuard = {
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
      .from('payroll_subscriptions')
      .select('*')
      .eq('business_id', business.id)
      .maybeSingle();

    const subActive = subscription && subscription.status === 'active' &&
      subscription.expires_at && new Date(subscription.expires_at) > new Date();

    return { session, business, supabase, subscription, subActive };
  }
};
