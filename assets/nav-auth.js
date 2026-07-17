// ---------- Shared nav auth state ----------
// Every page's nav has an <a id="navAccountLink" href="/account/">Account</a>.
// This script updates it to reflect whether the person is actually logged in,
// and — critically — turns it into a working "Sign out" control when they
// are, since previously sign-out only existed buried inside /account/ itself.
(async function () {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const link = document.getElementById('navAccountLink');
  if (!link) return;

  const session = await window.KoboAuth.getSession();
  if (!session) {
    link.textContent = 'Sign in';
    link.setAttribute('href', '/account/');
    return;
  }

  link.textContent = 'Sign out';
  link.setAttribute('href', '#');
  link.addEventListener('click', async (e) => {
    e.preventDefault();
    link.textContent = 'Signing out…';
    await window.KoboAuth.signOut();
    window.location.href = '/';
  });
})();
