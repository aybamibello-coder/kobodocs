// ---------- Shared Japa Pass access helper ----------
// Wraps the two relocation entitlement Edge Functions so all 3 tools call
// them consistently:
//   - getStatus(): read-only, safe to call on every page load/render.
//   - checkAndConsume(): the real gate — call ONLY when the user clicks
//     Download PDF or Share on WhatsApp. This is what actually increments
//     usage server-side; the client can't fake or bypass it.
window.RelocationAccess = (function () {
  const FUNCTIONS_URL = 'https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1';

  async function getSession() {
    await new Promise(r => {
      if (window.KoboAuth) return r();
      window.addEventListener('kobo-auth-ready', r, { once: true });
    });
    return window.KoboAuth.getSession();
  }

  async function getStatus() {
    const session = await getSession();
    if (!session) return { active: false };
    try {
      const res = await fetch(`${FUNCTIONS_URL}/get-relocation-status`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      return await res.json();
    } catch {
      return { active: false };
    }
  }

  async function checkAndConsume() {
    const session = await getSession();
    if (!session) return { allowed: false, reason: 'not_authenticated' };
    const res = await fetch(`${FUNCTIONS_URL}/check-relocation-usage`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    return await res.json();
  }

  return { getStatus, checkAndConsume };
})();
