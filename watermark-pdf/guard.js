// ---------- PDF Toolkit Pro access guard ----------
// User-scoped, not business-scoped — individuals, students and freelancers
// use PDF Toolkit without a registered business. Subscription status is
// read directly from pdf_toolkit_subscriptions, which is RLS-locked to the
// owning user for SELECT and only ever written by the squad-webhook edge
// function (service role) after a verified payment — so this is a real
// server-enforced check, not a frontend flag the client could fake.
window.PdfToolkitGuard = {
  async checkAccess() {
    await new Promise(r => {
      if (window.KoboAuth) return r();
      window.addEventListener('kobo-auth-ready', r, { once: true });
    });

    const session = await window.KoboAuth.getSession();
    if (!session) {
      return { session: null, supabase: window.KoboAuth.supabase, pro: false, subscription: null };
    }

    const supabase = window.KoboAuth.supabase;
    const { data: subscription } = await supabase
      .from('pdf_toolkit_subscriptions')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    const pro = !!subscription && subscription.plan === 'pro' && subscription.status === 'active' &&
      subscription.expires_at && new Date(subscription.expires_at) > new Date();

    return { session, supabase, pro, subscription };
  }
};
