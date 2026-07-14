const naira = (n) => '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function buildSchedule() {
  const principal = parseFloat(document.getElementById('loanAmount').value) || 0;
  const annualRate = parseFloat(document.getElementById('loanRate').value) || 0;
  const months = Math.max(parseInt(document.getElementById('loanMonths').value, 10) || 1, 1);
  const startRaw = document.getElementById('loanStart').value;
  const startDate = startRaw ? new Date(startRaw + 'T00:00:00') : new Date();

  const monthlyRate = annualRate / 100 / 12;
  // Standard amortized payment formula (reducing balance)
  const payment = monthlyRate === 0
    ? principal / months
    : principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);

  let balance = principal;
  const rows = [];
  for (let i = 1; i <= months; i++) {
    const interest = balance * monthlyRate;
    let principalPaid = payment - interest;
    if (i === months) principalPaid = balance; // clean up rounding on final row
    const actualPayment = interest + principalPaid;
    balance = Math.max(balance - principalPaid, 0);
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + (i - 1));
    rows.push({
      month: i,
      dateLabel: date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      payment: actualPayment,
      interest,
      principal: principalPaid,
      balance
    });
  }

  const totalPaid = rows.reduce((s, r) => s + r.payment, 0);
  const totalInterest = totalPaid - principal;

  return { principal, annualRate, months, payment, rows, totalPaid, totalInterest };
}

function renderPreview() {
  const lenderName = document.getElementById('lenderName').value || 'Lender name';
  const borrowerName = document.getElementById('borrowerName').value || 'Borrower name';
  document.getElementById('pLender').textContent = lenderName;
  document.getElementById('pBorrower').textContent = `Loan to ${borrowerName}`;

  const d = buildSchedule();

  if (window.KoboStorage) KoboStorage.save('loan', collectFormState());

  document.getElementById('pSummary').innerHTML = `
    <div class="row"><span>Loan amount</span><span>${naira(d.principal)}</span></div>
    <div class="row"><span>Monthly payment</span><span>${naira(d.payment)}</span></div>
    <div class="row"><span>Total interest</span><span>${naira(d.totalInterest)}</span></div>
  `;

  document.getElementById('pSchedule').innerHTML = d.rows.map(r => `
    <tr>
      <td>${r.month}. ${r.dateLabel}</td>
      <td>${naira(r.payment)}</td>
      <td>${naira(r.interest)}</td>
      <td>${naira(r.principal)}</td>
      <td>${naira(r.balance)}</td>
    </tr>
  `).join('');

  return { lenderName, borrowerName, ...d };
}

function collectFormState() {
  return {
    lenderName: document.getElementById('lenderName').value,
    borrowerName: document.getElementById('borrowerName').value,
    loanAmount: document.getElementById('loanAmount').value,
    loanRate: document.getElementById('loanRate').value,
    loanMonths: document.getElementById('loanMonths').value,
    loanStart: document.getElementById('loanStart').value
  };
}

function applyFormState(state) {
  document.getElementById('lenderName').value = state.lenderName || '';
  document.getElementById('borrowerName').value = state.borrowerName || '';
  document.getElementById('loanAmount').value = state.loanAmount ?? 500000;
  document.getElementById('loanRate').value = state.loanRate ?? 18;
  document.getElementById('loanMonths').value = state.loanMonths ?? 6;
  document.getElementById('loanStart').value = state.loanStart || new Date().toISOString().split('T')[0];
}

['lenderName','borrowerName','loanAmount','loanRate','loanMonths','loanStart'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderPreview);
});

document.getElementById('clearFormBtn').addEventListener('click', () => {
  if (!confirm('Clear this form? This only affects this device.')) return;
  KoboStorage.clear('loan');
  applyFormState({});
  renderPreview();
});

const saved = window.KoboStorage ? KoboStorage.load('loan') : null;
applyFormState(saved || {});
renderPreview();

// The schedule table is scrollable on screen (max-height + overflow) so long
// loans don't take over the page — but for export we need the FULL table
// visible, or html2canvas only captures whatever's in the scrolled window.
function withFullScheduleVisible(fn) {
  const scrollEl = document.querySelector('.schedule-scroll');
  const prevMaxHeight = scrollEl.style.maxHeight;
  const prevOverflowY = scrollEl.style.overflowY;
  scrollEl.style.maxHeight = 'none';
  scrollEl.style.overflowY = 'visible';
  return Promise.resolve().then(fn).finally(() => {
    scrollEl.style.maxHeight = prevMaxHeight;
    scrollEl.style.overflowY = prevOverflowY;
  });
}

document.getElementById('downloadBtn').addEventListener('click', async () => {
  const d = renderPreview();
  const btn = document.getElementById('downloadBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Preparing PDF…';
  btn.disabled = true;
  try {
    await withFullScheduleVisible(() =>
      KoboExport.downloadPdf(`loan-schedule-${(d.borrowerName || 'borrower').replace(/\s+/g, '-')}.pdf`)
    );
  } catch (err) {
    alert('Could not generate PDF: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

document.getElementById('waBtn').addEventListener('click', async () => {
  const d = renderPreview();
  const btn = document.getElementById('waBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Preparing image…';
  btn.disabled = true;

  const caption = [
    `*Loan schedule — ${d.lenderName}*`,
    `Borrower: ${d.borrowerName}`,
    `Principal: ${naira(d.principal)} at ${d.annualRate}% p.a. over ${d.months} months`,
    `Monthly payment: *${naira(d.payment)}*`,
    `Total interest: ${naira(d.totalInterest)}`
  ].join('\n');

  try {
    const result = await withFullScheduleVisible(() =>
      KoboExport.shareWhatsApp(`loan-schedule-${(d.borrowerName || 'borrower').replace(/\s+/g, '-')}.png`, caption)
    );
    if (result === 'downloaded') {
      alert('Image downloaded — attach it in WhatsApp. Opening WhatsApp with the caption now.');
    }
  } catch (err) {
    if (err.name !== 'AbortError') alert('Could not prepare the image: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

// ---------- White-label branding (Pro feature) ----------
// Free users always see the default KoboDocs premium template with the
// "Made with KoboDocs" mark. Pro users who've uploaded a logo/color in
// /account/ see their own branding instead — no watermark, their logo in
// place of the stamp, their brand color driving every accent in the document.
(async function applyBranding() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener("kobo-auth-ready", r, { once: true });
  });
  const session = await window.KoboAuth.getSession();
  if (!session) return;

  const profile = await window.KoboAuth.getProfile();
  const planActive = profile && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date();
  if (!profile || !planActive || (profile.plan !== "pro" && profile.plan !== "business")) return;

  const hasBranding = profile.brand_logo_url || profile.brand_color;
  if (hasBranding) document.getElementById("pWatermark").classList.add("hidden");

  if (profile.brand_logo_url) {
    const logo = document.getElementById("pBrandLogo");
    logo.src = profile.brand_logo_url;
    logo.classList.remove("hidden");
    document.getElementById("pStamp").classList.add("hidden");
  }
  if (profile.brand_color) {
    document.getElementById("docPreview").style.setProperty("--stamp-gold", profile.brand_color);
  }
})();

