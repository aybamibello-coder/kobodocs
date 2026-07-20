// ---------- QR Code Generator: free + Pro-gated features ----------
let qr = null;
let currentType = 'url';
let logoDataUrl = null;
let isPro = false;

const PRO_TYPES = ['vcard', 'wifi', 'payment'];

function buildContent(type) {
  switch (type) {
    case 'url':
      return document.getElementById('urlInput').value.trim() || 'https://kobodocs.com.ng';
    case 'text':
      return document.getElementById('textInput').value.trim() || 'Sample text';
    case 'whatsapp': {
      const digits = document.getElementById('waNumber').value.replace(/[^\d]/g, '');
      const message = document.getElementById('waMessage').value.trim();
      return `https://wa.me/${digits}${message ? '?text=' + encodeURIComponent(message) : ''}`;
    }
    case 'vcard': {
      const name = document.getElementById('vName').value.trim();
      const business = document.getElementById('vBusiness').value.trim();
      const phone = document.getElementById('vPhone').value.trim();
      const email = document.getElementById('vEmail').value.trim();
      return `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nORG:${business}\nTEL:${phone}\nEMAIL:${email}\nEND:VCARD`;
    }
    case 'wifi': {
      const ssid = document.getElementById('wifiSsid').value.trim();
      const password = document.getElementById('wifiPassword').value.trim();
      const enc = document.getElementById('wifiEncryption').value;
      return `WIFI:T:${enc};S:${ssid};P:${enc === 'nopass' ? '' : password};;`;
    }
    case 'payment': {
      const business = document.getElementById('payBusiness').value.trim();
      const amount = document.getElementById('payAmount').value.trim();
      const reference = document.getElementById('payReference').value.trim();
      return `Payment to ${business}\nAmount: ₦${amount}\n${reference ? 'Ref: ' + reference : ''}`.trim();
    }
    default:
      return '';
  }
}

function renderQR() {
  const wrap = document.getElementById('qrCanvasWrap');
  wrap.innerHTML = '';

  const fgColor = isPro ? document.getElementById('fgColor').value : '#000000';
  const bgColor = isPro ? document.getElementById('bgColor').value : '#ffffff';
  const hasLogo = isPro && logoDataUrl;

  qr = new QRCode(wrap, {
    text: buildContent(currentType),
    width: isPro ? 320 : 260,
    height: isPro ? 320 : 260,
    colorDark: fgColor,
    colorLight: bgColor,
    correctLevel: hasLogo ? QRCode.CorrectLevel.H : QRCode.CorrectLevel.M
  });

  if (hasLogo) {
    setTimeout(() => {
      const canvas = wrap.querySelector('canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const logoSize = canvas.width * 0.22;
      const x = (canvas.width - logoSize) / 2;
      const y = (canvas.height - logoSize) / 2;

      // White padding behind the logo so it stays scannable
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 6, y - 6, logoSize + 12, logoSize + 12);

      const img = new Image();
      img.onload = () => ctx.drawImage(img, x, y, logoSize, logoSize);
      img.src = logoDataUrl;
    }, 80);
  }
}

// ---------- Type tab switching ----------
document.getElementById('typeTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn || btn.disabled) return;
  currentType = btn.dataset.type;
  document.querySelectorAll('#typeTabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.qr-fields').forEach(f => f.classList.remove('active'));
  document.querySelector(`.qr-fields[data-fields="${currentType}"]`).classList.add('active');
  renderQR();
});

// ---------- Live regeneration on input ----------
document.querySelectorAll('.form-panel input, .form-panel textarea, .form-panel select').forEach(el => {
  el.addEventListener('input', renderQR);
  el.addEventListener('change', renderQR);
});

document.getElementById('logoUpload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) { logoDataUrl = null; renderQR(); return; }
  const reader = new FileReader();
  reader.onload = () => { logoDataUrl = reader.result; renderQR(); };
  reader.readAsDataURL(file);
});

// ---------- Downloads ----------
document.getElementById('downloadPngBtn').addEventListener('click', () => {
  const canvas = document.querySelector('#qrCanvasWrap canvas');
  if (!canvas) return;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'qr-code.png';
  a.click();
});

document.getElementById('waShareBtn').addEventListener('click', async () => {
  const btn = document.getElementById('waShareBtn');
  const original = btn.textContent;
  btn.textContent = 'Preparing…';
  btn.disabled = true;
  try {
    await KoboExport.shareWhatsApp('qr-code.png', 'Here\'s the QR code, made with KoboDocs.', 'qrPreviewCard');
  } catch (err) {
    if (err.name !== 'AbortError') console.error(err);
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
});

document.getElementById('downloadPdfBtn').addEventListener('click', async () => {
  const btn = document.getElementById('downloadPdfBtn');
  const original = btn.textContent;
  btn.textContent = 'Preparing PDF…';
  btn.disabled = true;
  try {
    await KoboExport.downloadPdf('qr-code.pdf', 'qrPreviewCard');
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
});

// ---------- Pro gating ----------
(async function checkPro() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  const profile = await window.KoboAuth.getProfile();
  const active = profile && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date();
  isPro = !!(profile && active && (profile.plan === 'pro' || profile.plan === 'business'));

  if (isPro) {
    document.getElementById('proLockBanner').style.display = 'none';
    document.getElementById('proFieldset').classList.add('unlocked');
    document.getElementById('downloadPdfBtn').style.display = 'inline-block';
    document.getElementById('qrWatermark').classList.add('hidden');
    PRO_TYPES.forEach(t => {
      document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`).disabled = false;
    });
  } else {
    PRO_TYPES.forEach(t => {
      const el = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`);
      el.disabled = true;
      el.title = 'Upgrade to Pro to unlock this';
    });
  }

  renderQR();
})();
