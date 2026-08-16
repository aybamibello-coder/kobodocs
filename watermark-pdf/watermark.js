// KoboDocs — Watermark PDF (PDF Toolkit Pro)
// Access is checked server-side via PdfToolkitGuard (RLS-scoped table read,
// only ever written by squad-webhook after a verified payment). Once access
// is confirmed, watermarking itself runs fully client-side with pdf-lib.
(function () {
  'use strict';

  var MAX_FILE_BYTES = 30 * 1024 * 1024; // 30MB

  var loadingState = document.getElementById('pdfLoadingState');
  var upgradeCard = document.getElementById('pdfUpgradeCard');
  var proTool = document.getElementById('pdfProTool');
  var upgradeMonthlyBtn = document.getElementById('pdfUpgradeMonthlyBtn');
  var upgradeYearlyBtn = document.getElementById('pdfUpgradeYearlyBtn');

  var dropzone = document.getElementById('pdfDropzone');
  var fileInput = document.getElementById('pdfFileInput');
  var errorBox = document.getElementById('pdfErrorBox');
  var optionsBox = document.getElementById('pdfWatermarkOptions');
  var fileSummaryEl = document.getElementById('pdfFileSummary');
  var watermarkTextInput = document.getElementById('pdfWatermarkText');
  var opacityInput = document.getElementById('pdfWmOpacity');
  var rotationInput = document.getElementById('pdfWmRotation');
  var watermarkBtn = document.getElementById('pdfWatermarkBtn');
  var changeFileBtn = document.getElementById('pdfChangeFileBtn');
  var progressBox = document.getElementById('pdfProgressBox');
  var progressFill = document.getElementById('pdfProgressFill');
  var progressLabel = document.getElementById('pdfProgressLabel');
  var resultBox = document.getElementById('pdfResultBox');
  var resultMeta = document.getElementById('pdfResultMeta');
  var downloadBtn = document.getElementById('pdfDownloadBtn');
  var watermarkAnotherBtn = document.getElementById('pdfWatermarkAnotherBtn');

  var current = null;
  var currentObjectUrl = null;
  var currentIsPro = false;

  var FREE_USED_KEY = 'kobo_watermark_free_used';
  var freeUsed = !!localStorage.getItem(FREE_USED_KEY);

  function track(name, params) {
    if (window.KoboTrack) { window.KoboTrack(name, params); }
    else if (typeof gtag === 'function') {
      try { gtag('event', name, params || {}); } catch (e) { /* no-op */ }
    }
  }

  // ---------- Access check ----------
  window.PdfToolkitGuard.checkAccess().then(function (access) {
    loadingState.hidden = true;
    currentIsPro = access.pro;

    // Watermarking is entirely client-side (no server cost), so the free
    // trial doesn't need an account -- same zero-friction pattern as
    // guarantor-form's first-document-free. Unlike OCR, this is a UI-only
    // gate; there's no marginal cost to protect against a cleared localStorage.
    var trialAvailable = !access.pro && !freeUsed;

    if (access.pro || trialAvailable) {
      proTool.hidden = false;
      document.getElementById('pdfFreeTrialBanner').hidden = access.pro;
      track('tool_view', { tool: 'watermark_pdf', pro: access.pro, free_trial: trialAvailable });
      initTool();
    } else {
      upgradeCard.hidden = false;
      document.getElementById('pdfUpgradeNote').innerHTML = '<strong>You\'ve used your free watermark.</strong> Upgrade to PDF Toolkit Pro for unlimited use — everything else in the toolkit stays free.';
      track('tool_view', { tool: 'watermark_pdf', pro: false });
      track('pricing_viewed', { tool: 'watermark_pdf' });
    }
  }).catch(function () {
    loadingState.hidden = true;
    upgradeCard.hidden = false;
  });

  upgradeMonthlyBtn.addEventListener('click', function () {
    track('checkout_started', { tool: 'watermark_pdf', billing_cycle: 'monthly' });
    window.KoboSubscribe.start('init-pdf-toolkit-payment', { billing_cycle: 'monthly' });
  });
  upgradeYearlyBtn.addEventListener('click', function () {
    track('checkout_started', { tool: 'watermark_pdf', billing_cycle: 'yearly' });
    window.KoboSubscribe.start('init-pdf-toolkit-payment', { billing_cycle: 'yearly' });
  });

  // If bounced through login mid-purchase, resume automatically once signed in.
  if (window.KoboSubscribe && window.KoboSubscribe.resumePendingIfAny) {
    window.KoboSubscribe.resumePendingIfAny();
  }

  // ---------- Tool logic (only wired once access is confirmed) ----------
  function initTool() {
    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    function showError(msg) { errorBox.textContent = msg; errorBox.hidden = false; }
    function clearError() { errorBox.hidden = true; errorBox.textContent = ''; }

    function readsAsPdfSignature(file) {
      return file.slice(0, 5).arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf);
        return String.fromCharCode.apply(null, bytes) === '%PDF-';
      }).catch(function () { return false; });
    }

    function handleFile(file) {
      clearError();
      if (!file) return;
      var lowerName = (file.name || '').toLowerCase();
      if (!lowerName.endsWith('.pdf') && file.type !== 'application/pdf') {
        showError('"' + file.name + '" isn\'t a PDF file.');
        track('file_validation_failed', { reason: 'wrong_type', tool: 'watermark_pdf' });
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        showError('"' + file.name + '" is larger than the 30MB limit.');
        track('file_validation_failed', { reason: 'file_too_large', tool: 'watermark_pdf' });
        return;
      }
      readsAsPdfSignature(file).then(function (isPdf) {
        if (!isPdf) {
          showError('"' + file.name + '" doesn\'t look like a valid PDF file.');
          track('file_validation_failed', { reason: 'bad_signature', tool: 'watermark_pdf' });
          return;
        }
        return file.arrayBuffer().then(function (buf) {
          return window.PDFLib.PDFDocument.load(buf, { ignoreEncryption: false })
            .then(function (doc) {
              current = { file: file, arrayBuffer: buf, name: file.name, pageCount: doc.getPageCount() };
              track('file_selected', { tool: 'watermark_pdf' });
              fileSummaryEl.textContent = current.name + ' · ' + current.pageCount + (current.pageCount === 1 ? ' page' : ' pages') + ' · ' + formatBytes(file.size);
              optionsBox.hidden = false;
              resultBox.hidden = true;
              progressBox.hidden = true;
            })
            .catch(function (err) {
              var msg = String(err && err.message || '');
              if (/encrypt/i.test(msg)) {
                showError('This PDF is password protected. Remove the password and try again.');
                track('file_validation_failed', { reason: 'password_protected', tool: 'watermark_pdf' });
              } else {
                showError('This file appears to be corrupted or isn\'t a supported PDF.');
                track('file_validation_failed', { reason: 'corrupted', tool: 'watermark_pdf' });
              }
            });
        });
      });
    }

    dropzone.addEventListener('click', function () { fileInput.click(); });
    dropzone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', function (e) { handleFile(e.target.files[0]); fileInput.value = ''; });
    changeFileBtn.addEventListener('click', function () { fileInput.click(); });

    ['dragenter', 'dragover'].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) { e.preventDefault(); dropzone.classList.add('pdf-dropzone-active'); });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) { e.preventDefault(); dropzone.classList.remove('pdf-dropzone-active'); });
    });
    dropzone.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    watermarkBtn.addEventListener('click', function () {
      if (!current) return;
      var text = (watermarkTextInput.value || '').trim();
      if (!text) { showError('Enter the watermark text you want to use.'); return; }
      clearError();

      optionsBox.hidden = true;
      progressBox.hidden = false;
      progressFill.style.width = '20%';
      progressLabel.textContent = 'Adding watermark…';
      track('watermark_started', { tool: 'watermark_pdf' });
      var startedAt = Date.now();

      var opacity = Math.max(10, Math.min(80, Number(opacityInput.value) || 30)) / 100;
      var rotation = Math.max(0, Math.min(90, Number(rotationInput.value) || 45));

      window.PDFLib.PDFDocument.load(current.arrayBuffer).then(function (doc) {
        return doc.embedFont(window.PDFLib.StandardFonts.HelveticaBold).then(function (font) {
          var pages = doc.getPages();
          pages.forEach(function (page, idx) {
            var size = page.getSize();
            var fontSize = Math.max(24, Math.min(size.width, size.height) / 8);
            var textWidth = font.widthOfTextAtSize(text, fontSize);
            page.drawText(text, {
              x: (size.width - textWidth) / 2,
              y: size.height / 2,
              size: fontSize,
              font: font,
              color: window.PDFLib.rgb(0.5, 0.5, 0.5),
              opacity: opacity,
              rotate: window.PDFLib.degrees(rotation),
            });
            progressFill.style.width = Math.round(((idx + 1) / pages.length) * 80) + '%';
          });
          return doc.save();
        });
      }).then(function (bytes) {
        progressFill.style.width = '100%';
        var blob = new Blob([bytes], { type: 'application/pdf' });
        if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = URL.createObjectURL(blob);
        downloadBtn.href = currentObjectUrl;
        downloadBtn.setAttribute('download', current.name.replace(/\.pdf$/i, '') + '-watermarked.pdf');
        resultMeta.textContent = current.pageCount + (current.pageCount === 1 ? ' page' : ' pages') + ' · ' + formatBytes(blob.size);
        progressBox.hidden = true;
        resultBox.hidden = false;
        if (!currentIsPro && !freeUsed) {
          localStorage.setItem(FREE_USED_KEY, '1');
          freeUsed = true;
        }
        track('watermark_completed', { tool: 'watermark_pdf', page_count: current.pageCount, duration_ms: Date.now() - startedAt });
      }).catch(function () {
        progressBox.hidden = true;
        optionsBox.hidden = false;
        showError('Something interrupted the watermarking. Please try again — if it keeps happening, the file may be corrupted.');
        track('watermark_failed', { tool: 'watermark_pdf' });
      });
    });

    watermarkAnotherBtn.addEventListener('click', function () {
      current = null;
      if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
      optionsBox.hidden = true;
      resultBox.hidden = true;
      progressBox.hidden = true;
      clearError();

      // Trial was just consumed by the run that got them here -- if they're
      // still not Pro, re-gate to the upgrade card instead of letting them
      // keep watermarking for free.
      if (!currentIsPro && freeUsed) {
        proTool.hidden = true;
        upgradeCard.hidden = false;
        document.getElementById('pdfUpgradeNote').innerHTML = '<strong>You\'ve used your free watermark.</strong> Upgrade to PDF Toolkit Pro for unlimited use — everything else in the toolkit stays free.';
      }
    });

    downloadBtn.addEventListener('click', function () { track('download_clicked', { tool: 'watermark_pdf' }); });
  }

})();
