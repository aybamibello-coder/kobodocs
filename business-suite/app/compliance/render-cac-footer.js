// ---------- Shared CAC compliance footer ----------
// Used by every Business Suite document generator (invoice, quote, etc).
// Renders the RC number + director disclosure into the exportable
// preview when set; otherwise shows a reminder banner on the FORM only
// (never inside the exportable preview — an unset business should never
// ship a document with a call-to-action baked into it).
window.renderCacFooter = function (business, footerElId, formPanelSelector, buyerTin) {
  const footerEl = document.getElementById(footerElId);
  if (!footerEl) return;

  const directors = Array.isArray(business.cac_directors) ? business.cac_directors : [];
  const hasCac = business.rc_number && directors.length;
  const hasTax = business.tin_number || business.vat_number;

  if (hasCac || hasTax) {
    const parts = [business.name];
    if (business.rc_number) parts.push(`RC ${business.rc_number}`);
    if (business.tin_number) parts.push(`TIN ${business.tin_number}`);
    if (business.vat_number) parts.push(`VAT ${business.vat_number}`);
    if (buyerTin) parts.push(`Buyer TIN ${buyerTin}`);

    let html = parts.join(' · ');
    if (directors.length) {
      const directorNames = directors.map(d => {
        let s = d.name;
        if (d.former_name) s += ` (formerly ${d.former_name})`;
        if (d.nationality) s += ` — ${d.nationality}`;
        return s;
      }).join('; ');
      html += ` · Director(s): ${directorNames}`;
    }
    footerEl.innerHTML = html;
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
