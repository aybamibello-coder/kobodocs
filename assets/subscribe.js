// ---------- KoboDocs shared subscribe/checkout helper ----------
// Used by every "Upgrade" / "Subscribe" button across the site. It keeps the
// login detour and checkout request resilient: a failed auth/CDN request must
// leave the current tool usable and a malformed server response must not cause
// an unhandled promise rejection.
window.KoboSubscribe = {
  FN_BASE: 'https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1',
  PENDING_KEY: 'kobo_pending_subscribe',
  PENDING_MAX_AGE_MS: 30 * 60 * 1000,
  _checkoutInFlight: false,

  async waitForAuth(timeoutMs = 10000) {
    if (window.KoboAuth) return window.KoboAuth;

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener('kobo-auth-ready', onReady);
        reject(new Error('Sign-in is taking longer than expected. Please check your connection and try again.'));
      }, timeoutMs);
      const onReady = () => {
        window.clearTimeout(timer);
        resolve(window.KoboAuth);
      };
      window.addEventListener('kobo-auth-ready', onReady, { once: true });
    });
  },

  _readPending() {
    try {
      const raw = sessionStorage.getItem(this.PENDING_KEY);
      if (!raw) return null;
      const pending = JSON.parse(raw);
      if (!pending || typeof pending.initFunction !== 'string' || typeof pending.createdAt !== 'number' ||
          Date.now() - pending.createdAt > this.PENDING_MAX_AGE_MS) {
        sessionStorage.removeItem(this.PENDING_KEY);
        return null;
      }
      return pending;
    } catch {
      // Storage can be unavailable in private browsing, or an older malformed
      // value may be present. Treat both as no pending checkout.
      return null;
    }
  },

  _savePending(initFunction, payload) {
    try {
      sessionStorage.setItem(this.PENDING_KEY, JSON.stringify({ initFunction, payload, createdAt: Date.now() }));
    } catch {
      // Login still works without restoring checkout intent automatically.
    }
  },

  async start(initFunction, payload = {}) {
    if (this._checkoutInFlight) return false;
    let auth;
    let session;
    try {
      auth = await this.waitForAuth();
      session = await auth.getSession();
    } catch (err) {
      alert('Checkout failed: ' + (err.message || 'Please try again.'));
      throw err;
    }
    if (!session) {
      this._savePending(initFunction, payload);
      const currentUrl = window.location.pathname + window.location.search;
      window.location.href = `/account/?redirect=${encodeURIComponent(currentUrl)}`;
      return true;
    }

    return this._init(session, initFunction, payload);
  },

  // Use from click handlers that intentionally do not await checkout. This
  // prevents a rejected checkout request from becoming an unhandled promise.
  startSafely(initFunction, payload = {}) {
    return this.start(initFunction, payload).catch(() => false);
  },

  async _init(session, initFunction, payload) {
    if (!session || !session.access_token) throw new Error('Your sign-in session has expired. Please sign in again.');
    if (this._checkoutInFlight) return false;
    this._checkoutInFlight = true;
    try {
      const res = await fetch(`${this.FN_BASE}/${encodeURIComponent(initFunction)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.authorization_url !== 'string' || !data.authorization_url) {
        throw new Error(data.error || 'Could not start checkout. Please try again.');
      }
      window.location.assign(data.authorization_url);
      return true;
    } catch (err) {
      alert('Checkout failed: ' + (err.message || 'Please try again.'));
      throw err;
    } finally {
      this._checkoutInFlight = false;
    }
  },

  // Call on a page with a Subscribe button. Retain the intent until a checkout
  // URL is successfully created so a temporary network failure does not lose it.
  async resumePendingIfAny() {
    const pending = this._readPending();
    if (!pending) return false;
    try {
      const auth = await this.waitForAuth();
      const session = await auth.getSession();
      if (!session) return false;
      const started = await this._init(session, pending.initFunction, pending.payload || {});
      if (started) sessionStorage.removeItem(this.PENDING_KEY);
      return started;
    } catch (err) {
      // This runs during page load. Report the problem without rejecting and
      // crashing the page's feature initialization.
      console.warn('Could not resume checkout:', err);
      return false;
    }
  }
};
