// ---------- PDF OS access + usage guard ----------
// Mirrors PdfToolkitGuard's pattern: subscription state is read from a
// table only ever written server-side after a verified Squad payment.
// PDF OS adds usage counters (agent runs / AI actions) on top, since its
// tiers are usage-based rather than pure feature-gates. Counters are
// incremented server-side, inside each edge function, atomically with
// the entitlement check — never trust a client-side decrement.
window.PdfOsGuard = {
  async checkAccess() {
    await new Promise(r => {
      if (window.KoboAuth) return r();
      window.addEventListener('kobo-auth-ready', r, { once: true });
    });

    const session = await window.KoboAuth.getSession();
    if (!session) {
      return {
        session: null,
        supabase: window.KoboAuth.supabase,
        plan: 'anonymous',
        canRunAgent: false,
        usage: null
      };
    }

    const supabase = window.KoboAuth.supabase;

    // subscriptions table is separate from pdf_toolkit_subscriptions —
    // a user can hold both independently (see product-and-pricing decision).
    const { data: subscription } = await supabase
      .from('pdf_os_subscriptions')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    const plan = (subscription && subscription.status === 'active' &&
      subscription.expires_at && new Date(subscription.expires_at) > new Date())
      ? subscription.plan   // 'free' | 'pro' | 'business'
      : 'free';

    // Usage is read for display only (e.g. "7/10 agent runs left this
    // month"). The real check-and-increment happens inside the edge
    // function that executes the run, to avoid a race between a client
    // read and a client-triggered spend.
    const { data: usage } = await supabase
      .from('pdf_os_usage_current_period')
      .select('agent_runs_used, ai_actions_used, period_end')
      .eq('user_id', session.user.id)
      .maybeSingle();

    return {
      session,
      supabase,
      plan,
      subscription,
      usage: usage || { agent_runs_used: 0, ai_actions_used: 0 }
    };
  }
};
