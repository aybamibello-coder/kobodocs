// ---------- e-Signature app access guard ----------
window.EsignGuard = {
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
      .from('esign_subscriptions')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    const hasAllowance = subscription && subscription.status === 'active' &&
      subscription.expires_at && new Date(subscription.expires_at) > new Date() &&
      subscription.envelopes_used_this_period < subscription.envelope_allowance;
    const hasCredits = subscription && Number(subscription.credits_balance || 0) > 0;

    return { session, supabase, subscription, canSend: !!(hasAllowance || hasCredits) };
  }
};
