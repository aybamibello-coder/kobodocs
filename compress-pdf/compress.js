// KoboDocs — Compress PDF
// Fully client-side: file never leaves the browser. pdf-lib loaded via CDN in index.html.
// Honest scope: strips metadata and repacks the PDF's internal object structure (real,
// measurable reduction on text-based PDFs). Does NOT re-encode embedded images — that
// needs more processing than a browser can safely/reliably do. The page copy says so.
(function () {
  'use strict';

  var MAX_FILE_BYTES = 30 * 1024 * 1024; // 30MB

  var dropzone = document.getElementById('pdfDropzone');
  var fileInput = document.getElementById('pdfFileInput');
  var errorBox = document.getElementById('pdfErrorBox');
  var optionsBox = document.getElementById('pdfCompressOptions');
  var fileSummaryEl = document.getElementById('pdfFileSummary');
  var compressBtn = document.getElementById('pdfCompressBtn');
  var changeFileBtn = document.getElementById('pdfChangeFileBtn');
  var progressBox = document.getElementById('pdfProgressBox');
  var progressFill = document.getElementById('pdfProgressFill');
  var progressLabel = document.getElementById('pdfProgressLabel');
  var resultBox = document.getElementById('pdfResultBox');
  var resultTitle = document.getElementById('pdfResultTitle');
  var resultMeta = document.getElementById('pdfResultMeta');
  var downloadBtn = document.getElementById('pdfDownloadBtn');
  var compressAnotherBtn = document.getElementById('pdfCompressAnotherBtn');

  var current = null; // { file, arrayBuffer, name }
  var currentObjectUrl = null;

  function track(name, params) {
    if (window.KoboTrack) { window.KoboTrack(name, params); }
    else if (typeof gtag === 'function') {
      try { gtag('event', name, params || {}); } catch (e) { /* no-op */ }
    }
  }
  track('tool_view', { tool: 'compress_pdf' });

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
      track('file_validation_failed', { reason: 'wrong_type', tool: 'compress_pdf' });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showError('"' + file.name + '" is larger than the 30MB limit on the Free plan.');
      track('file_validation_failed', { reason: 'file_too_large', tool: 'compress_pdf' });
      return;
    }
    readsAsPdfSignature(file).then(function (isPdf) {
      if (!isPdf) {
        showError('"' + file.name + '" doesn\'t look like a valid PDF file.');
        track('file_validation_failed', { reason: 'bad_signature', tool: 'compress_pdf' });
        return;
      }
      return file.arrayBuffer().then(function (buf) {
        return window.PDFLib.PDFDocument.load(buf, { ignoreEncryption: false })
          .then(function () {
            current = { file: file, arrayBuffer: buf, name: file.name };
            track('file_selected', { tool: 'compress_pdf' });
            fileSummaryEl.textContent = current.name + ' · ' + formatBytes(file.size);
            optionsBox.hidden = false;
            resultBox.hidden = true;
            progressBox.hidden = true;
          })
          .catch(function (err) {
            var msg = String(err && err.message || '');
            if (/encrypt/i.test(msg)) {
              showError('This PDF is password protected. Remove the password and try again.');
              track('file_validation_failed', { reason: 'password_protected', tool: 'compress_pdf' });
            } else {
              showError('This file appears to be corrupted or isn\'t a supported PDF.');
              track('file_validation_failed', { reason: 'corrupted', tool: 'compress_pdf' });
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

  compressBtn.addEventListener('click', function () {
    if (!current) return;
    clearError();
    optionsBox.hidden = true;
    progressBox.hidden = false;
    progressFill.style.width = '20%';
    progressLabel.textContent = 'Compressing your PDF…';
    track('compress_started', { tool: 'compress_pdf' });
    var startedAt = Date.now();
    var originalSize = current.file.size;

    window.PDFLib.PDFDocument.load(current.arrayBuffer).then(function (doc) {
      progressFill.style.width = '55%';
      try {
        doc.setTitle(''); doc.setAuthor(''); doc.setSubject('');
        doc.setKeywords([]); doc.setProducer(''); doc.setCreator('');
      } catch (e) { /* metadata fields may not all exist; safe to ignore */ }
      progressFill.style.width = '75%';
      return doc.save({ useObjectStreams: true });
    }).then(function (bytes) {
      progressFill.style.width = '100%';
      var blob = new Blob([bytes], { type: 'application/pdf' });
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = URL.createObjectURL(blob);

      var newSize = blob.size;
      var savedPct = Math.max(0, Math.round((1 - newSize / originalSize) * 100));
      var filename = current.name.replace(/\.pdf$/i, '') + '-compressed.pdf';

      downloadBtn.href = currentObjectUrl;
      downloadBtn.setAttribute('download', filename);

      // A rounded "0% smaller" (or 1-2% on a large file) reads as broken, even
      // though it's technically true — this is common on scanned/image-heavy
      // PDFs where this tool's metadata/structure cleanup has little to work
      // with (see the honesty note above). Show the honest "little room left"
      // message instead of a misleadingly precise percentage in that case.
      if (savedPct < 3) {
        resultTitle.textContent = 'This PDF is already well-optimized';
        resultMeta.textContent = formatBytes(originalSize) + ' \u2192 ' + formatBytes(newSize) + ' — little to no room left to shrink it further with browser-based compression. This is common for scanned or image-heavy PDFs.';
      } else {
        resultTitle.textContent = 'Your compressed PDF is ready';
        resultMeta.textContent = formatBytes(originalSize) + ' \u2192 ' + formatBytes(newSize) + ' (' + savedPct + '% smaller)';
      }

      progressBox.hidden = true;
      resultBox.hidden = false;
      track('compress_completed', { tool: 'compress_pdf', saved_pct: savedPct, duration_ms: Date.now() - startedAt });
    }).catch(function () {
      progressBox.hidden = true;
      optionsBox.hidden = false;
      showError('Something interrupted the compression. Please try again — if it keeps happening, the file may be corrupted.');
      track('compress_failed', { tool: 'compress_pdf' });
    });
  });

  compressAnotherBtn.addEventListener('click', function () {
    current = null;
    if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
    optionsBox.hidden = true;
    resultBox.hidden = true;
    progressBox.hidden = true;
    clearError();
  });

  downloadBtn.addEventListener('click', function () { track('download_clicked', { tool: 'compress_pdf' }); });

})();
