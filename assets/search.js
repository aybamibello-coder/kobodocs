(function () {
  const TOOLS = window.KOBO_TOOLS_INDEX || [];
  let activeIndex = -1;
  let currentResults = [];

  function el(id) { return document.getElementById(id); }

  function openSearch() {
    const overlay = el('searchOverlay');
    if (!overlay) return;
    overlay.classList.add('open');
    const input = el('searchInput');
    input.value = '';
    renderResults(TOOLS.slice(0, 8));
    setTimeout(() => input.focus(), 0);
    document.body.style.overflow = 'hidden';
  }

  function closeSearch() {
    const overlay = el('searchOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  function scoreMatch(tool, query) {
    const q = query.toLowerCase();
    const name = tool.name.toLowerCase();
    const kw = tool.keywords.toLowerCase();
    if (name.startsWith(q)) return 3;
    if (name.includes(q)) return 2;
    if (kw.includes(q)) return 1;
    return 0;
  }

  function search(query) {
    if (!query.trim()) return TOOLS.slice(0, 8);
    const scored = TOOLS
      .map(t => ({ tool: t, score: scoreMatch(t, query) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map(r => r.tool);
  }

  function renderResults(results) {
    currentResults = results;
    activeIndex = -1;
    const container = el('searchResults');
    if (!results.length) {
      container.innerHTML = '<div class="search-empty">No tools match that — try a different word, or browse the full list in the nav menu.</div>';
      return;
    }
    container.innerHTML = results.map((t, i) => `
      <a href="${t.url}" data-idx="${i}">
        ${t.name}
        <span class="sr-kw">${t.url}</span>
      </a>
    `).join('');
  }

  function updateActive() {
    const links = document.querySelectorAll('#searchResults a');
    links.forEach((a, i) => a.classList.toggle('active', i === activeIndex));
    if (activeIndex >= 0 && links[activeIndex]) {
      links[activeIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#searchBtn');
    if (btn) { e.preventDefault(); openSearch(); return; }
    const closeBtn = e.target.closest('#searchClose');
    if (closeBtn) { closeSearch(); return; }
    if (e.target.id === 'searchOverlay') { closeSearch(); }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      openSearch();
      return;
    }
    const overlay = el('searchOverlay');
    if (!overlay || !overlay.classList.contains('open')) return;

    if (e.key === 'Escape') { closeSearch(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, currentResults.length - 1);
      updateActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActive();
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && currentResults[activeIndex]) {
        window.location.href = currentResults[activeIndex].url;
      } else if (currentResults.length) {
        window.location.href = currentResults[0].url;
      }
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id !== 'searchInput') return;
    renderResults(search(e.target.value));
  });
})();
