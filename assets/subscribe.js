// ---------- KoboDocs shared subscribe/checkout helper ----------
// Used by every "Upgrade" / "Subscribe" button across the site. Handles the
// full journey: if not logged in, detour through /account/ (which redirects
// back here after auth), then call the right Paystack init function and
// send the browser to the hosted checkout page. Each init-* edge function
// decides its own post-payment callback_url server-side.
window.KoboSubscribe = {
  FN_BASE: 'https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1',

  async start(initFunction, payload = {}) {
    await new Promise(r => {
      if (window.KoboAuth) return r();
      window.addEventListener('kobo-auth-ready', r, { once: true });
    });

    const session = await window.KoboAuth.getSession();
    if (!session) {
      sessionStorage.setItem('kobo_pending_subscribe', JSON.stringify({ initFunction, payload }));
      const currentUrl = window.location.pathname + window.location.search;
      window.location.href = `/account/?redirect=${encodeURIComponent(currentUrl)}`;
      return;
    }

    return this._init(session, initFunction, payload);
  },

  async _init(session, initFunction, payload) {
    try {
      const res = await fetch(`${this.FN_BASE}/${initFunction}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.authorization_url) {
        throw new Error(data.error || 'Could not start checkout');
      }
      window.location.href = data.authorization_url;
    } catch (err) {
      alert('Checkout failed: ' + err.message);
      throw err;
    }
  },

  // Call this on load of any page with a Subscribe button. If the person
  // was bounced through login/signup mid-purchase, this fires the same
  // checkout automatically the moment they land back here signed in —
  // no second click needed.
  async resumePendingIfAny() {
    const pending = sessionStorage.getItem('kobo_pending_subscribe');
    if (!pending) return false;

    await new Promise(r => {
      if (window.KoboAuth) return r();
      window.addEventListener('kobo-auth-ready', r, { once: true });
    });
    const session = await window.KoboAuth.getSession();
    if (!session) return false;

    sessionStorage.removeItem('kobo_pending_subscribe');
    const { initFunction, payload } = JSON.parse(pending);
    await this._init(session, initFunction, payload);
    return true;
  }
};
