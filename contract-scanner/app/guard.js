// ---------- Contract Scanner app access guard ----------
// User-scoped, not business-scoped — freelancers without a registered
// business use this tool too. Access is PAYG credits only, no plans.
window.ContractScanGuard = {
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

    const { data: creditRow } = await supabase
      .from('contract_scan_credits')
      .select('credits_balance')
      .eq('user_id', session.user.id)
      .maybeSingle();

    const credits = creditRow?.credits_balance ?? 0;

    return { session, supabase, credits, canScan: credits > 0 };
  }
};
