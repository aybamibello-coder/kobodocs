// ---------- Shared Business Suite access guard ----------
// Used by every page under /business-suite/app/. Resolves the signed-in
// user's business (as owner, or as staff via business_members), checks
// trial/subscription is active, and redirects to the plan page if not.
//
// A ?business_id=<uuid> query param lets a multi-business user (e.g. an
// accountant who's a member of several client businesses) tell any page
// which business to load, instead of always getting whichever business
// happens to match first. Without the param, behavior is unchanged from
// before — single-business users are unaffected.
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
    const requestedId = new URLSearchParams(window.location.search).get('business_id');

    let business = null;
    let role = null;

    if (requestedId) {
      // Explicit business requested: verify the caller is its owner or a member.
      const { data: ownedBiz } = await supabase
        .from('businesses').select('*').eq('id', requestedId).eq('owner_user_id', session.user.id).maybeSingle();
      if (ownedBiz) {
        business = ownedBiz;
        role = 'owner';
      } else {
        const { data: membership } = await supabase
          .from('business_members')
          .select('role, businesses(*)')
          .eq('business_id', requestedId)
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (membership && membership.businesses) {
          business = membership.businesses;
          role = membership.role;
        }
      }
    } else {
      // Default (no ?business_id): owner match first, else first membership
      // row. Ordered + limited to 1 — a bare .maybeSingle() here throws the
      // moment an owner has 2+ businesses (see /my-businesses/), which used
      // to silently bounce multi-business owners to the marketing page.
      const { data: ownedBiz } = await supabase
        .from('businesses').select('*').eq('owner_user_id', session.user.id)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (ownedBiz) {
        business = ownedBiz;
        role = 'owner';
      } else {
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
  },

  // Same as requireAccess, but also requires the Growth tier (Credit &
  // Collections Manager, Quotation & Proposal Studio). A Starter business
  // with an otherwise-valid trial/subscription gets bounced to the pricing
  // section with an upgrade prompt rather than being treated as logged out.
  async requireGrowthAccess() {
    const ctx = await this.requireAccess();
    if (!ctx) return null;

    if (ctx.business.suite_tier !== 'growth') {
      window.location.href = '/business-suite/#growth-upgrade';
      return null;
    }

    return ctx;
  },

  // Lists every business the signed-in user can access, as owner or member
  // (any role) — regardless of which one requireAccess() would pick by
  // default. Used by the My Businesses / multi-client dashboard. Does NOT
  // redirect on its own; callers should handle an empty result themselves.
  async listMyBusinesses() {
    await new Promise(r => {
      if (window.KoboAuth) return r();
      window.addEventListener('kobo-auth-ready', r, { once: true });
    });
    const session = await window.KoboAuth.getSession();
    if (!session) return { session: null, businesses: [] };

    const supabase = window.KoboAuth.supabase;
    const [{ data: owned }, { data: memberships }] = await Promise.all([
      supabase.from('businesses').select('*').eq('owner_user_id', session.user.id),
      supabase.from('business_members').select('role, businesses(*)').eq('user_id', session.user.id),
    ]);

    // A DB trigger auto-adds an 'owner'-role business_members row whenever a
    // business is created, alongside owner_user_id on businesses itself —
    // so owned businesses would otherwise appear twice (once from each
    // query). Exclude role:'owner' memberships here; the `owned` query
    // above is already the source of truth for those.
    const businesses = [
      ...(owned || []).map(b => ({ ...b, myRole: 'owner' })),
      ...(memberships || []).filter(m => m.businesses && m.role !== 'owner').map(m => ({ ...m.businesses, myRole: m.role })),
    ];

    return { session, supabase, businesses };
  }
};
