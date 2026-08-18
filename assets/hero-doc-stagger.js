// Applies a staggered animation-delay to each .hero-doc-row on a page.
// CSS :nth-of-type can't reliably isolate same-class siblings when mixed
// among other <div> children -- .hero-doc's markup includes .stamp,
// .hero-doc-head, .hero-doc-total etc. as sibling divs too, at a
// different count on every page, so a structural CSS selector would
// silently miscount rows depending on each page's exact markup. This
// is correct regardless of what else is in the container.
(function () {
  document.querySelectorAll('.hero-doc-row').forEach(function (row, i) {
    row.style.animationDelay = (0.15 + i * 0.12) + 's';
  });
})();
