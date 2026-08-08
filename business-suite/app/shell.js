// Marks the nav link matching the current page as active — one shared
// script instead of hand-editing "active" state into every module's
// nav copy. Matches by path prefix so /business-suite/app/credit/ and
// /business-suite/app/credit/new/ both highlight "Credit & Collections".
(function () {
  function markActive() {
    const links = document.querySelectorAll('.suite-nav .nav-links a[href^="/business-suite/app/"]');
    if (!links.length) return;
    const path = window.location.pathname;
    let best = null;
    links.forEach(link => {
      const href = new URL(link.href).pathname;
      if (path === href || (href !== '/business-suite/app/' && path.startsWith(href))) {
        if (!best || href.length > new URL(best.href).pathname.length) best = link;
      }
    });
    if (!best && path === '/business-suite/app/') {
      best = document.querySelector('.suite-nav .nav-links a[href="/business-suite/app/"]');
    }
    if (best) best.classList.add('suite-nav-active');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markActive);
  } else {
    markActive();
  }
})();
