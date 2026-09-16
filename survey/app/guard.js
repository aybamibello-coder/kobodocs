// ---------- KoboDocs Survey app access guard ----------
window.SurveyGuard = {
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
