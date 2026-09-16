// ---------- KoboDocs Form app access guard ----------
// Just requires a logged-in user. Plan limits are enforced server-side
// (trigger on the forms table + get_form_plan_limits RPC).
window.FormsGuard = {
  async requireAccess() {
    await new Promise(r => {
      if (window.KoboAuth) return r();
      window.addEventListener('kobo-auth-ready', r, { once: true });
    });

    const session = await window.KoboAuth.getSession();
    if (!session) {
      window.location.href = '/account/?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
      return null;
    }

    return { session, supabase: window.KoboAuth.supabase };
  }
};
