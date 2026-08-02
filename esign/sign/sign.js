// ---------- Public signing page ----------
const FN_BASE = 'https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1';

async function callFn(name, payload) {
  const res = await fetch(`${FN_BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function setupSignaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1a1a1a';

  let drawing = false;
  let hasDrawn = false;

  function pos(e) {
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function start(e) { drawing = true; hasDrawn = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(e) { if (!drawing) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }
  function end() { drawing = false; }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start);
  canvas.addEventListener('touchmove', move);
  canvas.addEventListener('touchend', end);

  return {
    clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); hasDrawn = false; },
    isEmpty() { return !hasDrawn; },
    toDataUrl() { return canvas.toDataURL('image/png'); }
  };
}

(async function init() {
  const area = document.getElementById('mainArea');
  const token = new URLSearchParams(window.location.search).get('token');

  if (!token) {
    area.innerHTML = '<div class="empty-note">Missing signing link.</div>';
    return;
  }

  let info;
  try {
    info = await callFn('get-envelope-for-signing', { token });
  } catch (err) {
    area.innerHTML = `<div class="empty-note">${err.message}</div>`;
    return;
  }

  if (info.signer_status === 'signed') {
    area.innerHTML = `<div class="bs-panel empty-note">You already signed "${info.envelope_title}" on ${new Date(info.signed_at).toLocaleString('en-GB')}. Thank you!</div>`;
    return;
  }
  if (info.signer_status === 'declined') {
    area.innerHTML = `<div class="bs-panel empty-note">You declined to sign "${info.envelope_title}".</div>`;
    return;
  }

  area.innerHTML = `
    <div class="bs-panel">
      <h1 style="font-size:1.3rem; margin-bottom:6px;">${info.envelope_title}</h1>
      <p style="font-size:0.85rem; opacity:0.7; margin-bottom:16px;">${info.sender_name || 'A KoboDocs user'} has sent you this document to review and sign, ${info.signer_name}.</p>
      <iframe id="pdfFrame" src="${info.source_pdf_url}"></iframe>
    </div>

    <div class="bs-panel">
      <h3 style="font-size:1rem; margin-bottom:10px;">Draw your signature</h3>
      <canvas id="sigPad"></canvas>
      <div class="sig-actions">
        <button class="btn" id="clearSigBtn">Clear</button>
        <button class="btn primary" id="signBtn">Sign document</button>
        <button class="btn danger" id="declineBtn" style="margin-left:auto;">Decline</button>
      </div>
    </div>
  `;

  const pad = setupSignaturePad(document.getElementById('sigPad'));
  document.getElementById('clearSigBtn').addEventListener('click', () => pad.clear());

  document.getElementById('signBtn').addEventListener('click', async () => {
    if (pad.isEmpty()) { alert('Please draw your signature first.'); return; }
    const btn = document.getElementById('signBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
      const result = await callFn('sign-envelope', { token, signature_image_data: pad.toDataUrl() });
      area.innerHTML = `<div class="bs-panel empty-note">Signed! ${result.envelope_status === 'completed' ? 'Everyone has now signed this document.' : 'Waiting on the other signer(s).'}</div>`;
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
      btn.textContent = 'Sign document';
    }
  });

  document.getElementById('declineBtn').addEventListener('click', async () => {
    if (!confirm('Decline to sign this document?')) return;
    try {
      await callFn('sign-envelope', { token, action: 'decline' });
      area.innerHTML = '<div class="bs-panel empty-note">You declined to sign this document.</div>';
    } catch (err) {
      alert(err.message);
    }
  });
})();
