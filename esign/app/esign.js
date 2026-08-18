// ---------- e-Signature app ----------
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2600);
}

const FN_BASE = 'https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1';

async function callFn(name, session, payload) {
  const res = await fetch(`${FN_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function statusTag(status) {
  return `<span class="status-tag ${status === 'completed' ? 'completed' : ''}">${status.replace('_',' ')}</span>`;
}

async function loadEnvelopes(ctx) {
  const { data } = await ctx.supabase
    .from('signature_envelopes')
    .select('id, title, status, created_at, signature_signers(id, name, email, status)')
    .eq('owner_user_id', ctx.session.user.id)
    .order('created_at', { ascending: false });
  return data || [];
}

function addSignerRow(container) {
  const row = document.createElement('div');
  row.className = 'signer-row';
  row.innerHTML = `
    <input placeholder="Signer name" class="signer-name" required>
    <input placeholder="Signer email" type="email" class="signer-email" required>
    <button type="button" class="btn small remove-signer">✕</button>
  `;
  row.querySelector('.remove-signer').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

async function renderApp(ctx) {
  const area = document.getElementById('mainArea');
  const envelopes = await loadEnvelopes(ctx);

  const buyOptions = `
    <div class="bs-panel">
      <p style="margin-bottom:14px;">${ctx.subscription ? 'Out of envelopes — top up or subscribe below.' : "You haven't bought any envelopes yet."}</p>
      <div class="plans-grid">
        <div class="plan-card">
          <h3>Pay as you go</h3>
          <div class="plan-price">₦500<span style="font-size:0.7rem;">/envelope</span></div>
          <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:12px;">
            <label for="paygQty" style="font-size:0.78rem; opacity:0.7;">Qty</label>
            <input type="number" id="paygQty" value="1" min="1" max="50" style="width:56px; padding:5px; border:1px solid var(--line); border-radius:6px; text-align:center;">
          </div>
          <button class="btn primary" id="buyPaygBtn">Buy for ₦500</button>
        </div>
        <div class="plan-card">
          <h3>Starter</h3>
          <div class="plan-price">₦3,500<span style="font-size:0.7rem;">/mo</span></div>
          <p style="font-size:0.8rem; opacity:0.7; margin-bottom:14px;">15 envelopes/mo</p>
          <button class="btn primary" data-plan="starter">Subscribe</button>
        </div>
        <div class="plan-card">
          <h3>Growth</h3>
          <div class="plan-price">₦9,000<span style="font-size:0.7rem;">/mo</span></div>
          <p style="font-size:0.8rem; opacity:0.7; margin-bottom:14px;">60 envelopes/mo</p>
          <button class="btn primary" data-plan="growth">Subscribe</button>
        </div>
      </div>
    </div>
  `;

  area.innerHTML = `
    <div class="bs-panel">
      <h3 style="font-size:1rem; margin-bottom:12px;">Your envelopes</h3>
      <div>${envelopes.length ? envelopes.map(e => `
        <div class="es-row">
          <div>
            <div class="es-name">${e.title}${statusTag(e.status)}</div>
            <div class="es-meta">${(e.signature_signers||[]).map(s => `${s.name} (${s.status})`).join(', ')}</div>
            ${(e.signature_signers||[]).filter(s => s.status === 'pending').length ? `
              <div class="es-resend-row">
                ${(e.signature_signers||[]).filter(s => s.status === 'pending').map(s => `
                  <button class="btn small resend-signer" data-envelope-id="${e.id}" data-signer-id="${s.id}">Resend to ${s.name}</button>
                `).join('')}
              </div>
            ` : ''}
          </div>
          ${e.status === 'completed' ? `<button class="btn small download-signed" data-id="${e.id}">Download signed PDF</button>` : ''}
        </div>
      `).join('') : `
        <div class="preview-label">What a completed envelope looks like</div>
        <div class="hero-doc mini">
          <div class="hero-doc-head">
            <div class="co">Service Agreement</div>
            <div class="no">2 signers<br>Sent 1 Aug 2026</div>
          </div>
          <div class="hero-doc-row"><span>Adaeze Fabrics Co. (you)</span><span>Signed ✓</span></div>
          <div class="hero-doc-row"><span>Tunde Bakare</span><span>Signed ✓</span></div>
          <div class="hero-doc-total"><span>Status</span><span>Completed</span></div>
        </div>
      `}</div>
    </div>

    ${ctx.canSend ? '' : buyOptions}

    <div class="bs-panel" ${ctx.canSend ? '' : 'style="opacity:0.5; pointer-events:none;"'}>
      <h3 style="font-size:1rem; margin-bottom:12px;">Send a document for signature</h3>
      <form id="createEnvForm" class="es-form">
        <label>Document title</label>
        <input name="title" required placeholder="e.g. Service Agreement — Acme Ltd">
        <label>Document URL (PDF)</label>
        <input name="source_pdf_url" required placeholder="https://... link to a PDF">
        <label style="margin-top:6px;">Signers</label>
        <div id="signersContainer"></div>
        <button type="button" class="btn small" id="addSignerBtn" style="margin-bottom:14px;">+ Add signer</button>
        <br>
        <button class="btn primary" type="submit">Send for signature</button>
      </form>
    </div>
  `;

  const signersContainer = document.getElementById('signersContainer');
  addSignerRow(signersContainer);
  document.getElementById('addSignerBtn').addEventListener('click', () => addSignerRow(signersContainer));

  document.getElementById('createEnvForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const signers = Array.from(signersContainer.querySelectorAll('.signer-row')).map(row => ({
      name: row.querySelector('.signer-name').value,
      email: row.querySelector('.signer-email').value,
    })).filter(s => s.name && s.email);

    if (!signers.length) { toast('Add at least one signer'); return; }

    try {
      const result = await callFn('create-envelope', ctx.session, {
        title: fd.get('title'),
        source_pdf_url: fd.get('source_pdf_url'),
        signers,
      });

      if (!result.email_configured) {
        toast('Sent, but email delivery isn\'t configured right now — share these links directly:');
        alert(result.signers.map(s => `${s.name}: ${s.signing_url}`).join('\n\n'));
      } else if (result.warning) {
        const failed = result.signers.filter(s => !s.email_sent);
        toast('Sent — but delivery failed for ' + failed.length + ' signer(s). Use Resend from the list below, or share their link directly:');
        alert(failed.map(s => `${s.name}: ${s.signing_url}`).join('\n\n'));
      } else {
        toast('Sent! Each signer has been emailed their signing link.');
      }
      renderApp(ctx);
    } catch (err) {
      toast(err.message);
    }
  });

  area.querySelectorAll('.download-signed').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const result = await callFn('get-envelope-pdf', ctx.session, { envelope_id: btn.dataset.id });
        window.open(result.signed_url, '_blank');
      } catch (err) {
        toast(err.message);
      }
    });
  });

  area.querySelectorAll('.resend-signer').forEach(btn => {
    btn.addEventListener('click', async () => {
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        const result = await callFn('resend-signer-email', ctx.session, {
          envelope_id: btn.dataset.envelopeId,
          signer_id: btn.dataset.signerId,
        });
        if (result.error) {
          alert('Could not resend: ' + result.error);
        } else {
          const first = result.results && result.results[0];
          const ok = first && first.sent;
          if (ok) {
            toast('Email resent.');
          } else {
            alert('Send failed for ' + (first ? first.email : 'this signer') + ':\n\n' + (first && first.error ? first.error : 'unknown error'));
          }
        }
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });

  const paygBtn = document.getElementById('buyPaygBtn');
  const paygQty = document.getElementById('paygQty');
  if (paygBtn && paygQty) {
    const updatePaygBtnText = () => {
      const qty = Math.max(1, Math.min(50, Number(paygQty.value) || 1));
      paygQty.value = qty;
      paygBtn.textContent = `Buy for ₦${(qty * 500).toLocaleString('en-NG')}`;
    };
    paygQty.addEventListener('input', updatePaygBtnText);
    updatePaygBtnText();
    paygBtn.addEventListener('click', () => {
      const qty = Math.max(1, Math.min(50, Number(paygQty.value) || 1));
      window.KoboSubscribe.start('init-esign-payment', { mode: 'payg', credit_count: qty });
    });
  }
  area.querySelectorAll('[data-plan]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.KoboSubscribe.start('init-esign-payment', { mode: 'subscription', plan: btn.dataset.plan });
    });
  });
}

(async function init() {
  const ctx = await window.EsignGuard.requireAccess();
  if (!ctx) return;
  renderApp(ctx);
})();
