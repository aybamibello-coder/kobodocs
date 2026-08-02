// ---------- Shared CAC compliance footer ----------
// Used by every Business Suite document generator (invoice, quote, etc).
// Renders the RC number + director disclosure into the exportable
// preview when set; otherwise shows a reminder banner on the FORM only
// (never inside the exportable preview — an unset business should never
// ship a document with a call-to-action baked into it).
window.renderCacFooter = function (business, footerElId, formPanelSelector) {
  const footerEl = document.getElementById(footerElId);
  if (!footerEl) return;

  const directors = Array.isArray(business.cac_directors) ? business.cac_directors : [];

  if (business.rc_number && directors.length) {
    const directorNames = directors.map(d => {
      let s = d.name;
      if (d.former_name) s += ` (formerly ${d.former_name})`;
      if (d.nationality) s += ` — ${d.nationality}`;
      return s;
    }).join('; ');
    footerEl.innerHTML = `${business.name} · RC ${business.rc_number} · Director(s): ${directorNames}`;
    footerEl.style.display = 'block';
    return;
  }

  const panel = document.querySelector(formPanelSelector);
  if (panel && !panel.querySelector('.cac-reminder-banner')) {
    const banner = document.createElement('div');
    banner.className = 'cac-reminder-banner';
    banner.style.cssText = 'background:rgba(199,154,60,0.1); border:1px solid rgba(199,154,60,0.3); border-radius:8px; padding:12px 16px; font-size:0.82rem; margin-bottom:16px;';
    banner.innerHTML = `Since 1 Aug 2026, CAC requires your RC number and director names on invoices/quotations. <a href="/business-suite/app/compliance/">Set this up once →</a>`;
    panel.prepend(banner);
  }
};
