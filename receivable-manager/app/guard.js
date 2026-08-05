// ---------- Receivable Manager app access guard ----------
// Standalone product — doesn't require a Business Suite subscription,
// just a logged-in user who owns a business record. Subscription status
// (receivable_subscriptions) is checked separately by the page itself, since
// an unsubscribed owner should still see the "subscribe" screen rather
// than be redirected away.
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
      .maybeSingle();

    if (!business) {
      window.location.href = '/business-suite/';
      return null;
    }

    const { data: subscription } = await supabase
      .from('receivable_subscriptions')
      .select('*')
      .eq('business_id', business.id)
      .maybeSingle();

    const subActive = subscription && subscription.status === 'active' &&
      subscription.expires_at && new Date(subscription.expires_at) > new Date();

    return { session, business, supabase, subscription, subActive };
  }
};
