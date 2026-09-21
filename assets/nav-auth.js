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

  // ---------- Incomplete-profile gate ----------
  // Older accounts (and a brief signup-form gap) could reach this point
  // with no full_name/business_name on file. Block further use with a
  // one-time, unclosable modal until both are filled in. Skipped on
  // /account/ itself, which has its own auth UI and shouldn't be
  // interrupted mid-flow.
  if (window.location.pathname.startsWith('/account/')) return;

  try {
    const profile = await window.KoboAuth.getProfile();
    if (!profile) return;
    if (profile.full_name && profile.business_name) return;

    const overlay = document.createElement('div');
    overlay.id = 'profileGateOverlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(13,38,32,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;';
    overlay.innerHTML = `
      <div style="background:#fdfaf3; border-radius:10px; padding:28px 26px; max-width:380px; width:100%; box-shadow:0 24px 60px -20px rgba(0,0,0,0.4);">
        <h2 style="font-family:'Fraunces',serif; font-size:1.2rem; margin:0 0 6px;">Finish setting up your account</h2>
        <p style="font-size:0.88rem; opacity:0.75; margin:0 0 18px; line-height:1.5;">We need a couple of details before you can continue.</p>
        <label style="font-size:0.82rem; font-weight:600; display:block; margin-bottom:4px;">Full name</label>
        <input type="text" id="profileGateFullName" placeholder="Ayobami Bello" style="width:100%; padding:9px 10px; border:1px solid #ddd; border-radius:6px; font-family:inherit; font-size:0.9rem; margin-bottom:14px; box-sizing:border-box;">
        <label style="font-size:0.82rem; font-weight:600; display:block; margin-bottom:4px;">Business name</label>
        <input type="text" id="profileGateBizName" placeholder="Adaeze Fabrics Co." style="width:100%; padding:9px 10px; border:1px solid #ddd; border-radius:6px; font-family:inherit; font-size:0.9rem; margin-bottom:16px; box-sizing:border-box;">
        <div id="profileGateMsg" style="font-size:0.8rem; color:#b3261e; margin-bottom:10px; display:none;"></div>
        <button id="profileGateSaveBtn" style="width:100%; padding:11px; border:none; border-radius:6px; background:#C79A3C; color:#14231d; font-weight:600; font-size:0.9rem; cursor:pointer;">Save and continue</button>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('profileGateFullName').value = profile.full_name || '';
    document.getElementById('profileGateBizName').value = profile.business_name || '';

    document.getElementById('profileGateSaveBtn').addEventListener('click', async () => {
      const fullName = document.getElementById('profileGateFullName').value.trim();
      const bizName = document.getElementById('profileGateBizName').value.trim();
      const msgEl = document.getElementById('profileGateMsg');
      if (!fullName || !bizName) {
        msgEl.textContent = 'Please fill in both fields.';
        msgEl.style.display = 'block';
        return;
      }
      const { error } = await window.KoboAuth.supabase
        .from('profiles')
        .update({ full_name: fullName, business_name: bizName })
        .eq('id', session.user.id);
      if (error) {
        msgEl.textContent = 'Could not save — please try again.';
        msgEl.style.display = 'block';
        return;
      }
      overlay.remove();
    });
  } catch (_e) {
    // Never let this gate break the page if the profile fetch fails.
  }
})();
