// ---------- Device-local autosave (no account, no cloud — this device only) ----------
window.KoboStorage = {
  save(key, data) {
    try { localStorage.setItem('kobodocs:' + key, JSON.stringify(data)); return true; }
    catch (e) { return false; }
  },
  load(key) {
    try {
      const raw = localStorage.getItem('kobodocs:' + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  clear(key) {
    try { localStorage.removeItem('kobodocs:' + key); return true; }
    catch (e) { return false; }
  }
};
const navLinks = document.getElementById('navLinks');
if (menuBtn && navLinks) {
  menuBtn.addEventListener('click', () => navLinks.classList.toggle('open'));
  navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));
}

  // Respect reduced-motion preference throughout
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reveal-on-scroll for all .reveal elements (section heads, cards, FAQ items, stats)
  const revealEls = document.querySelectorAll('.reveal');
  if (prefersReduced) {
    revealEls.forEach(el => el.classList.add('visible'));
  } else {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => revealObserver.observe(el));
  }

  // Count-up animation for stat numbers
  const counters = document.querySelectorAll('.count');
  const animateCount = (el) => {
    const target = parseInt(el.dataset.target, 10);
    if (prefersReduced || target === 0) {
      el.textContent = target;
      return;
    }
    const duration = 900;
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        countObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  counters.forEach(el => countObserver.observe(el));

  // Stamp "press" animation on the hero stamp when it first comes into view
  const heroStamp = document.querySelector('.hero-doc .stamp');
  if (heroStamp && !prefersReduced) {
    heroStamp.style.transform = 'rotate(9deg) scale(0)';
    heroStamp.style.transition = 'transform .45s cubic-bezier(.34,1.56,.64,1) .3s';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        heroStamp.style.transform = 'rotate(9deg) scale(1)';
      });
    });
  }
