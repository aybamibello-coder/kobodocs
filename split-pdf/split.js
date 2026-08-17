// KoboDocs — Split PDF
// Fully client-side: file never leaves the browser. pdf-lib + JSZip loaded via CDN in index.html.
(function () {
  'use strict';

  var MAX_FILE_BYTES = 30 * 1024 * 1024; // 30MB

  var dropzone = document.getElementById('pdfDropzone');
  var fileInput = document.getElementById('pdfFileInput');
  var errorBox = document.getElementById('pdfErrorBox');
  var optionsBox = document.getElementById('pdfSplitOptions');
  var fileSummaryEl = document.getElementById('pdfFileSummary');
  var rangeInputWrap = document.getElementById('pdfRangeInputWrap');
  var rangeInput = document.getElementById('pdfRangeInput');
  var rangeHint = document.getElementById('pdfRangeHint');
  var splitBtn = document.getElementById('pdfSplitBtn');
  var changeFileBtn = document.getElementById('pdfChangeFileBtn');
  var progressBox = document.getElementById('pdfProgressBox');
  var progressFill = document.getElementById('pdfProgressFill');
  var progressLabel = document.getElementById('pdfProgressLabel');
  var resultBox = document.getElementById('pdfResultBox');
  var resultTitle = document.getElementById('pdfResultTitle');
  var resultMeta = document.getElementById('pdfResultMeta');
  var downloadBtn = document.getElementById('pdfDownloadBtn');
  var splitAnotherBtn = document.getElementById('pdfSplitAnotherBtn');

  var current = null; // { file, arrayBuffer, name, pageCount }
  var currentObjectUrl = null;
  var currentBlob = null;
  var currentFilename = null;

  function track(name, params) {
    if (window.KoboTrack) { window.KoboTrack(name, params); }
    else if (typeof gtag === 'function') {
      try { gtag('event', name, params || {}); } catch (e) { /* no-op */ }
    }
  }
  track('tool_view', { tool: 'split_pdf' });

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
      track('file_validation_failed', { reason: 'wrong_type', tool: 'split_pdf' });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showError('"' + file.name + '" is larger than the 30MB limit on the Free plan.');
      track('file_validation_failed', { reason: 'file_too_large', tool: 'split_pdf' });
      return;
    }

    readsAsPdfSignature(file).then(function (isPdf) {
      if (!isPdf) {
        showError('"' + file.name + '" doesn\'t look like a valid PDF file.');
        track('file_validation_failed', { reason: 'bad_signature', tool: 'split_pdf' });
        return;
      }
      return file.arrayBuffer().then(function (buf) {
        return window.PDFLib.PDFDocument.load(buf, { ignoreEncryption: false })
          .then(function (doc) {
            current = { file: file, arrayBuffer: buf, name: file.name, pageCount: doc.getPageCount() };
            track('file_selected', { tool: 'split_pdf' });
            showOptions();
          })
          .catch(function (err) {
            var msg = String(err && err.message || '');
            if (/encrypt/i.test(msg)) {
              showError('This PDF is password protected. Remove the password and try again.');
              track('file_validation_failed', { reason: 'password_protected', tool: 'split_pdf' });
            } else {
              showError('This file appears to be corrupted or isn\'t a supported PDF.');
              track('file_validation_failed', { reason: 'corrupted', tool: 'split_pdf' });
            }
          });
      });
    });
  }

  function showOptions() {
    fileSummaryEl.textContent = current.name + ' · ' + current.pageCount + (current.pageCount === 1 ? ' page' : ' pages') + ' · ' + formatBytes(current.file.size);
    rangeInput.value = '';
    rangeHint.textContent = 'This PDF has ' + current.pageCount + ' page' + (current.pageCount === 1 ? '' : 's') + '.';
    optionsBox.hidden = false;
    resultBox.hidden = true;
    progressBox.hidden = true;
  }

  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', function (e) {
    handleFile(e.target.files[0]);
    fileInput.value = '';
  });
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

  document.querySelectorAll('input[name="splitMode"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      rangeInputWrap.style.display = (radio.value === 'range' && radio.checked) ? '' : 'none';
    });
  });

  // Parses "1-3, 5, 8-10" into a sorted, de-duplicated 0-based index array, validated against pageCount.
  function parseRange(str, pageCount) {
    var parts = str.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) return { error: 'Enter at least one page number or range.' };

    var indices = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      var m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        var start = parseInt(m[1], 10), end = parseInt(m[2], 10);
        if (start < 1 || end > pageCount || start > end) {
          return { error: '"' + part + '" is not a valid range for a ' + pageCount + '-page PDF.' };
        }
        for (var p = start; p <= end; p++) indices.push(p - 1);
      } else if (/^\d+$/.test(part)) {
        var n = parseInt(part, 10);
        if (n < 1 || n > pageCount) {
          return { error: 'Page ' + n + ' does not exist in this ' + pageCount + '-page PDF.' };
        }
        indices.push(n - 1);
      } else {
        return { error: '"' + part + '" isn\'t a valid page number or range.' };
      }
    }
    var unique = Array.from(new Set(indices)).sort(function (a, b) { return a - b; });
    return { indices: unique };
  }

  function getMode() {
    var checked = document.querySelector('input[name="splitMode"]:checked');
    return checked ? checked.value : 'range';
  }

  splitBtn.addEventListener('click', function () {
    if (!current) return;
    clearError();
    var mode = getMode();

    if (mode === 'range') {
      var parsed = parseRange(rangeInput.value, current.pageCount);
      if (parsed.error) { showError(parsed.error); return; }
      runExtractRange(parsed.indices);
    } else {
      runSplitAll();
    }
  });

  function runExtractRange(indices) {
    optionsBox.hidden = true;
    progressBox.hidden = false;
    progressFill.style.width = '20%';
    progressLabel.textContent = 'Extracting pages…';
    track('split_started', { tool: 'split_pdf', mode: 'range' });
    var startedAt = Date.now();

    window.PDFLib.PDFDocument.load(current.arrayBuffer).then(function (srcDoc) {
      return window.PDFLib.PDFDocument.create().then(function (outDoc) {
        return outDoc.copyPages(srcDoc, indices).then(function (pages) {
          pages.forEach(function (p) { outDoc.addPage(p); });
          progressFill.style.width = '80%';
          return outDoc.save();
        });
      });
    }).then(function (bytes) {
      progressFill.style.width = '100%';
      var blob = new Blob([bytes], { type: 'application/pdf' });
      finishSuccess(blob, current.name.replace(/\.pdf$/i, '') + '-extracted.pdf',
        indices.length + ' pages · ' + formatBytes(blob.size), 'Your extracted PDF is ready');
      track('split_completed', { tool: 'split_pdf', mode: 'range', page_count: indices.length, duration_ms: Date.now() - startedAt });
    }).catch(function () {
      failSplit();
    });
  }

  function runSplitAll() {
    optionsBox.hidden = true;
    progressBox.hidden = false;
    progressFill.style.width = '10%';
    progressLabel.textContent = 'Splitting pages…';
    track('split_started', { tool: 'split_pdf', mode: 'all' });
    var startedAt = Date.now();

    var srcDocPromise = window.PDFLib.PDFDocument.load(current.arrayBuffer);
    var zip = new JSZip();
    var total = current.pageCount;

    srcDocPromise.then(function (srcDoc) {
      var chain = Promise.resolve();
      var namePad = String(total).length;
      for (var i = 0; i < total; i++) {
        (function (pageIndex) {
          chain = chain.then(function () {
            return window.PDFLib.PDFDocument.create().then(function (outDoc) {
              return outDoc.copyPages(srcDoc, [pageIndex]).then(function (pages) {
                outDoc.addPage(pages[0]);
                return outDoc.save();
              }).then(function (bytes) {
                var pageNum = String(pageIndex + 1).padStart(namePad, '0');
                zip.file('page-' + pageNum + '.pdf', bytes);
                progressFill.style.width = Math.round(((pageIndex + 1) / total) * 85) + '%';
              });
            });
          });
        })(i);
      }
      return chain;
    }).then(function () {
      progressLabel.textContent = 'Building ZIP…';
      return zip.generateAsync({ type: 'blob' });
    }).then(function (zipBlob) {
      progressFill.style.width = '100%';
      finishSuccess(zipBlob, current.name.replace(/\.pdf$/i, '') + '-pages.zip',
        total + ' files · ' + formatBytes(zipBlob.size), 'Your split pages are ready');
      track('split_completed', { tool: 'split_pdf', mode: 'all', page_count: total, duration_ms: Date.now() - startedAt });
    }).catch(function () {
      failSplit();
    });
  }

  function finishSuccess(blob, filename, metaText, titleText) {
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(blob);
    currentBlob = blob;
    currentFilename = filename;
    downloadBtn.href = currentObjectUrl;
    downloadBtn.setAttribute('download', filename);
    resultTitle.textContent = titleText;
    resultMeta.textContent = metaText;
    progressBox.hidden = true;
    resultBox.hidden = false;
  }

  function failSplit() {
    progressBox.hidden = true;
    optionsBox.hidden = false;
    showError('Something interrupted the split. Please try again — if it keeps happening, the file may be corrupted.');
    track('split_failed', { tool: 'split_pdf' });
  }

  splitAnotherBtn.addEventListener('click', function () {
    current = null;
    if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
    currentBlob = null;
    currentFilename = null;
    optionsBox.hidden = true;
    resultBox.hidden = true;
    progressBox.hidden = true;
    clearError();
  });

  downloadBtn.addEventListener('click', function () {
    track('download_clicked', { tool: 'split_pdf' });
  });

  var shareWhatsAppBtn = document.getElementById('pdfShareWhatsAppBtn');
  if (shareWhatsAppBtn) {
    shareWhatsAppBtn.addEventListener('click', function () {
      if (!currentBlob || !currentFilename || !window.KoboExport) return;
      track('download_clicked', { tool: 'split_pdf', via: 'whatsapp' });
      window.KoboExport.shareWhatsAppBlob(currentFilename, 'Here\'s a file from KoboDocs.', currentBlob);
    });
  }

})();
