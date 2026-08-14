// ---------- Transcription Suite app access guard ----------
// User-centric (not businesses-table-centric) — this is a personal/team
// productivity product, not a business-invoicing one. Every logged-in
// user gets a permanent Free plan automatically on first visit (100
// min/month), no signup friction beyond having an account at all. Paid
// plans/PAYG packs layer on top via the same row (see
// transcription_subscriptions: minutes_balance = PAYG credits that never
// expire, minutes_allowance/minutes_used_this_period = the recurring
// plan's monthly bucket, which resets lazily here on access rather than
// needing a cron job — correct enough since the reset only matters the
// next time someone actually uses the product).
window.TranscribeGuard = {
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

    let { data: subscription } = await supabase
      .from('transcription_subscriptions')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (!subscription) {
      const periodReset = new Date();
      periodReset.setDate(periodReset.getDate() + 30);
      const { data: created } = await supabase
        .from('transcription_subscriptions')
        .insert({
          user_id: session.user.id,
          plan: 'free',
          minutes_balance: 0,
          minutes_allowance: 100,
          minutes_used_this_period: 0,
          period_reset_at: periodReset.toISOString(),
          status: 'active'
        })
        .select('*')
        .maybeSingle();
      subscription = created;
    } else if (subscription.period_reset_at && new Date(subscription.period_reset_at) <= new Date()) {
      // Lazy monthly reset: the period lapsed since their last visit.
      const nextReset = new Date();
      nextReset.setDate(nextReset.getDate() + 30);
      const { data: updated } = await supabase
        .from('transcription_subscriptions')
        .update({ minutes_used_this_period: 0, period_reset_at: nextReset.toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', session.user.id)
        .select('*')
        .maybeSingle();
      subscription = updated || subscription;
    }

    const allowanceRemaining = Math.max(0, Number(subscription.minutes_allowance) - Number(subscription.minutes_used_this_period));
    const remainingMinutes = allowanceRemaining + Number(subscription.minutes_balance);

    const { data: planConfig } = await supabase
      .from('transcription_plans')
      .select('*')
      .eq('key', subscription.plan)
      .maybeSingle();

    return { session, supabase, subscription, planConfig, remainingMinutes };
  },

  // Claims an anonymous trial session's usage onto a newly authenticated
  // account, so someone who tries the tool first and signs up after
  // doesn't lose (or double-dip) their trial usage. Called once after
  // sign-up if a kobo_anon_session_token is present in sessionStorage.
  async claimAnonymousSession(supabase, userId) {
    const token = sessionStorage.getItem('kobo_transcribe_anon_token');
    if (!token) return;
    await supabase.rpc('claim_transcription_anonymous_session', { p_token: token, p_user_id: userId }).catch(() => {});
    sessionStorage.removeItem('kobo_transcribe_anon_token');
  }
};
