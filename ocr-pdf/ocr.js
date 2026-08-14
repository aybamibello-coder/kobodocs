// KoboDocs — OCR PDF (PDF Toolkit Pro)
// Pages are rendered to images client-side (pdf.js, same technique as the
// free PDF-to-JPG tool), then sent to the ocr-pdf-pages edge function for
// text recognition -- that step genuinely needs a server (a real OCR/vision
// model), unlike every other PDF Toolkit tool. The edge function itself
// re-checks the Pro entitlement server-side before calling Gemini; this
// page's guard is a UI convenience, not the real enforcement.
(function () {
  'use strict';

  var MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
  var MAX_PAGES = 10;
  var RENDER_SCALE = 2.0;
  var FN_BASE = 'https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1';

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  var loadingState = document.getElementById('pdfLoadingState');
  var upgradeCard = document.getElementById('pdfUpgradeCard');
  var proTool = document.getElementById('pdfProTool');
  var upgradeMonthlyBtn = document.getElementById('pdfUpgradeMonthlyBtn');
  var upgradeYearlyBtn = document.getElementById('pdfUpgradeYearlyBtn');

  var dropzone = document.getElementById('pdfDropzone');
  var fileInput = document.getElementById('pdfFileInput');
  var errorBox = document.getElementById('pdfErrorBox');
  var optionsBox = document.getElementById('pdfOcrOptions');
  var fileSummaryEl = document.getElementById('pdfFileSummary');
  var ocrBtn = document.getElementById('pdfOcrBtn');
  var changeFileBtn = document.getElementById('pdfChangeFileBtn');
  var progressBox = document.getElementById('pdfProgressBox');
  var progressFill = document.getElementById('pdfProgressFill');
  var progressLabel = document.getElementById('pdfProgressLabel');
  var resultBox = document.getElementById('pdfResultBox');
  var resultMeta = document.getElementById('pdfResultMeta');
  var textarea = document.getElementById('pdfOcrTextarea');
  var copyBtn = document.getElementById('pdfCopyBtn');
  var downloadTxtBtn = document.getElementById('pdfDownloadTxtBtn');
  var downloadPdfBtn = document.getElementById('pdfDownloadPdfBtn');
  var ocrAnotherBtn = document.getElementById('pdfOcrAnotherBtn');

  var current = null;
  var sessionRef = null;

  function track(name, params) { if (typeof gtag === 'function') { try { gtag('event', name, params || {}); } catch (e) {} } }

  window.PdfToolkitGuard.checkAccess().then(function (access) {
    loadingState.hidden = true;
    sessionRef = access.session;

    var trialAvailable = !access.pro && !!access.session && !(access.subscription && access.subscription.ocr_free_trial_used_at);

    if (access.pro || trialAvailable) {
      proTool.hidden = false;
      document.getElementById('pdfFreeTrialBanner').hidden = access.pro; // only show the "one free scan" note when it's actually the trial
      track('tool_view', { tool: 'ocr_pdf', pro: access.pro, free_trial: trialAvailable });
      initTool();
    } else {
      upgradeCard.hidden = false;
      // Tailor the note: signed-in-but-trial-used vs never-signed-in.
      if (access.session) {
        document.getElementById('pdfUpgradeNote').innerHTML = '<strong>You\'ve used your free OCR scan.</strong> Upgrade to PDF Toolkit Pro for unlimited OCR — everything else in the toolkit stays free.';
        document.getElementById('pdfSignInForTrialNote').hidden = true;
        document.getElementById('pdfUpgradeSignInNote').hidden = true;
      } else {
        document.getElementById('pdfUpgradeSignInNote').hidden = true;
        document.getElementById('pdfSignInForTrialNote').hidden = false;
      }
      track('tool_view', { tool: 'ocr_pdf', pro: false });
      track('pricing_viewed', { tool: 'ocr_pdf' });
    }
  }).catch(function () {
    loadingState.hidden = true;
    upgradeCard.hidden = false;
  });

  upgradeMonthlyBtn.addEventListener('click', function () {
    track('checkout_started', { tool: 'ocr_pdf', billing_cycle: 'monthly' });
    window.KoboSubscribe.start('init-pdf-toolkit-payment', { billing_cycle: 'monthly' });
  });
  upgradeYearlyBtn.addEventListener('click', function () {
    track('checkout_started', { tool: 'ocr_pdf', billing_cycle: 'yearly' });
    window.KoboSubscribe.start('init-pdf-toolkit-payment', { billing_cycle: 'yearly' });
  });
  if (window.KoboSubscribe && window.KoboSubscribe.resumePendingIfAny) {
    window.KoboSubscribe.resumePendingIfAny();
  }

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
        track('file_validation_failed', { reason: 'wrong_type', tool: 'ocr_pdf' });
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        showError('"' + file.name + '" is larger than the 20MB limit.');
        track('file_validation_failed', { reason: 'file_too_large', tool: 'ocr_pdf' });
        return;
      }
      readsAsPdfSignature(file).then(function (isPdf) {
        if (!isPdf) {
          showError('"' + file.name + '" doesn\'t look like a valid PDF file.');
          track('file_validation_failed', { reason: 'bad_signature', tool: 'ocr_pdf' });
          return;
        }
        return file.arrayBuffer().then(function (buf) {
          return window.pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise
            .then(function (pdf) {
              if (pdf.numPages > MAX_PAGES) {
                showError('This PDF has ' + pdf.numPages + ' pages, over the ' + MAX_PAGES + '-page limit for OCR.');
                track('file_validation_failed', { reason: 'too_many_pages', tool: 'ocr_pdf' });
                return;
              }
              current = { file: file, arrayBuffer: buf, name: file.name, pageCount: pdf.numPages };
              track('file_selected', { tool: 'ocr_pdf' });
              fileSummaryEl.textContent = current.name + ' · ' + current.pageCount + (current.pageCount === 1 ? ' page' : ' pages') + ' · ' + formatBytes(file.size);
              optionsBox.hidden = false;
              resultBox.hidden = true;
              progressBox.hidden = true;
            })
            .catch(function (err) {
              var msg = String(err && err.message || err && err.name || '');
              if (/password/i.test(msg)) {
                showError('This PDF is password protected. Remove the password and try again.');
                track('file_validation_failed', { reason: 'password_protected', tool: 'ocr_pdf' });
              } else {
                showError('This file appears to be corrupted or isn\'t a supported PDF.');
                track('file_validation_failed', { reason: 'corrupted', tool: 'ocr_pdf' });
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

    function renderPageToBase64Jpeg(pdf, pageNum) {
      return pdf.getPage(pageNum).then(function (page) {
        var viewport = page.getViewport({ scale: RENDER_SCALE });
        var canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        var ctx = canvas.getContext('2d');
        return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
          var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          return dataUrl.split(',')[1]; // strip "data:image/jpeg;base64,"
        });
      });
    }

    ocrBtn.addEventListener('click', function () {
      if (!current || !sessionRef) return;
      clearError();
      optionsBox.hidden = true;
      progressBox.hidden = false;
      progressFill.style.width = '10%';
      progressLabel.textContent = 'Reading pages…';
      track('ocr_started', { tool: 'ocr_pdf', page_count: current.pageCount });
      var startedAt = Date.now();

      window.pdfjsLib.getDocument({ data: new Uint8Array(current.arrayBuffer.slice(0)) }).promise.then(function (pdf) {
        var images = [];
        var chain = Promise.resolve();
        var total = pdf.numPages;
        for (var i = 1; i <= total; i++) {
          (function (pageNum) {
            chain = chain.then(function () {
              return renderPageToBase64Jpeg(pdf, pageNum).then(function (b64) {
                images.push({ data: b64, mime_type: 'image/jpeg' });
                progressFill.style.width = Math.round((pageNum / total) * 40) + '%';
              });
            });
          })(i);
        }
        return chain.then(function () { return images; });
      }).then(function (images) {
        progressLabel.textContent = 'Extracting text…';
        progressFill.style.width = '55%';
        return fetch(FN_BASE + '/ocr-pdf-pages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sessionRef.access_token },
          body: JSON.stringify({ images: images }),
        }).then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok || data.error) {
              var err = new Error(data.error || 'OCR request failed');
              err.needUpgrade = !!data.need_upgrade;
              throw err;
            }
            return data;
          });
        });
      }).then(function (data) {
        progressFill.style.width = '100%';
        var pages = data.pages || [];
        var combined = pages.map(function (t, i) {
          return '--- Page ' + (i + 1) + ' ---\n' + (t || '(no readable text on this page)');
        }).join('\n\n');

        var totalChars = pages.join('').length;
        if (!totalChars) {
          progressBox.hidden = true;
          optionsBox.hidden = false;
          showError('No readable text was found in this document. It may be blank, or too low-quality to read.');
          track('ocr_completed', { tool: 'ocr_pdf', page_count: current.pageCount, chars: 0 });
          return;
        }

        textarea.value = combined;
        resultMeta.textContent = pages.length + (pages.length === 1 ? ' page' : ' pages') + ' · ' + totalChars.toLocaleString() + ' characters';
        progressBox.hidden = true;
        resultBox.hidden = false;
        track('ocr_completed', { tool: 'ocr_pdf', page_count: current.pageCount, chars: totalChars, duration_ms: Date.now() - startedAt });
      }).catch(function (err) {
        progressBox.hidden = true;
        if (err && err.needUpgrade) {
          proTool.hidden = true;
          upgradeCard.hidden = false;
          showError('Your Pro subscription isn\'t active. Please upgrade to continue using OCR.');
        } else {
          optionsBox.hidden = false;
          showError((err && err.message) || 'Something interrupted the text extraction. Please try again.');
        }
        track('ocr_failed', { tool: 'ocr_pdf' });
      });
    });

    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(textarea.value).then(function () {
        var original = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(function () { copyBtn.textContent = original; }, 1500);
      }).catch(function () {
        textarea.select();
        document.execCommand('copy');
      });
      track('copy_clicked', { tool: 'ocr_pdf' });
    });

    downloadTxtBtn.addEventListener('click', function () {
      var blob = new Blob([textarea.value], { type: 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (current ? current.name.replace(/\.pdf$/i, '') : 'extracted-text') + '.txt';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      track('download_clicked', { tool: 'ocr_pdf', format: 'txt' });
    });

    downloadPdfBtn.addEventListener('click', function () {
      track('download_clicked', { tool: 'ocr_pdf', format: 'pdf' });
      buildTextPdf(textarea.value).then(function (bytes) {
        var blob = new Blob([bytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (current ? current.name.replace(/\.pdf$/i, '') : 'extracted-text') + '-text.pdf';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
    });

    // Simple paragraph-block layout: same wrap/paginate approach as Word-to-PDF,
    // splitting on blank lines rather than parsing document structure.
    function buildTextPdf(text) {
      var PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 56;
      var MAX_WIDTH = PAGE_W - MARGIN * 2;

      function wrapText(str, font, size, maxWidth) {
        var words = str.split(/\s+/).filter(Boolean);
        var lines = [];
        var line = '';
        for (var i = 0; i < words.length; i++) {
          var test = line ? line + ' ' + words[i] : words[i];
          if (font.widthOfTextAtSize(test, size) > maxWidth && line) { lines.push(line); line = words[i]; }
          else line = test;
        }
        if (line) lines.push(line);
        return lines;
      }

      return window.PDFLib.PDFDocument.create().then(function (doc) {
        return doc.embedFont(window.PDFLib.StandardFonts.Helvetica).then(function (font) {
          var page = doc.addPage([PAGE_W, PAGE_H]);
          var y = PAGE_H - MARGIN;
          var size = 11, lineHeight = 15;

          function ensureSpace(h) {
            if (y - h < MARGIN) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
          }

          var paragraphs = text.split(/\n\s*\n/);
          paragraphs.forEach(function (para) {
            var lines = wrapText(para.trim(), font, size, MAX_WIDTH);
            lines.forEach(function (line) {
              ensureSpace(lineHeight);
              y -= lineHeight;
              page.drawText(line, { x: MARGIN, y: y, size: size, font: font, color: window.PDFLib.rgb(0.1, 0.1, 0.1) });
            });
            y -= 10;
          });

          return doc.save();
        });
      });
    }

    ocrAnotherBtn.addEventListener('click', function () {
      current = null;
      optionsBox.hidden = true;
      resultBox.hidden = true;
      progressBox.hidden = true;
      textarea.value = '';
      clearError();
    });
  }

})();
