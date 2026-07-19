// ---------- Shared Business Suite access guard ----------
// Used by every page under /business-suite/app/. Resolves the signed-in
// user's business (as owner, or as staff via business_members), checks
// trial/subscription is active, and redirects to the plan page if not.
window.BizSuiteGuard = {
  async requireAccess() {
    await new Promise(r => {
      if (window.KoboAuth) return r();
      window.addEventListener('kobo-auth-ready', r, { once: true });
    });

    const session = await window.KoboAuth.getSession();
    if (!session) {
      window.location.href = '/business-suite/';
      return null;
    }

    const supabase = window.KoboAuth.supabase;

    // Try as owner first
    let { data: business } = await supabase
      .from('businesses')
      .select('*')
      .eq('owner_user_id', session.user.id)
      .maybeSingle();

    let role = 'owner';

    // Fall back to staff membership
    if (!business) {
      const { data: membership } = await supabase
        .from('business_members')
        .select('business_id, role, businesses(*)')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (membership && membership.businesses) {
        business = membership.businesses;
        role = membership.role;
      }
    }

    const now = new Date();
    const trialActive = business && business.suite_status === 'trial' && new Date(business.suite_trial_ends_at) > now;
    const subActive = business && business.suite_status === 'active' && new Date(business.suite_expires_at) > now;

    if (!business || (!trialActive && !subActive)) {
      window.location.href = '/business-suite/';
      return null;
    }

    return {
      session,
      business,
      role,
      supabase,
      trialActive,
      daysLeft: trialActive
        ? Math.max(0, Math.ceil((new Date(business.suite_trial_ends_at) - now) / (1000 * 60 * 60 * 24)))
        : null
    };
  }
};
