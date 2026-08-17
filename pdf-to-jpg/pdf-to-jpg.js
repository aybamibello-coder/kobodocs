// KoboDocs — PDF to JPG/PNG
// Fully client-side: file never leaves the browser. pdf.js + JSZip loaded via CDN.
(function () {
  'use strict';

  var MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB
  var MAX_PAGES = 40;
  var RENDER_SCALE = 2.0; // ~144 DPI equivalent, good balance of quality/size/speed

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  var dropzone = document.getElementById('pdfDropzone');
  var fileInput = document.getElementById('pdfFileInput');
  var errorBox = document.getElementById('pdfErrorBox');
  var optionsBox = document.getElementById('pdfConvertOptions');
  var fileSummaryEl = document.getElementById('pdfFileSummary');
  var convertBtn = document.getElementById('pdfConvertBtn');
  var changeFileBtn = document.getElementById('pdfChangeFileBtn');
  var progressBox = document.getElementById('pdfProgressBox');
  var progressFill = document.getElementById('pdfProgressFill');
  var progressLabel = document.getElementById('pdfProgressLabel');
  var resultBox = document.getElementById('pdfResultBox');
  var resultTitle = document.getElementById('pdfResultTitle');
  var resultMeta = document.getElementById('pdfResultMeta');
  var downloadBtn = document.getElementById('pdfDownloadBtn');
  var convertAnotherBtn = document.getElementById('pdfConvertAnotherBtn');

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
  track('tool_view', { tool: 'pdf_to_jpg' });

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
      track('file_validation_failed', { reason: 'wrong_type', tool: 'pdf_to_jpg' });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showError('"' + file.name + '" is larger than the 25MB limit on the Free plan.');
      track('file_validation_failed', { reason: 'file_too_large', tool: 'pdf_to_jpg' });
      return;
    }
    readsAsPdfSignature(file).then(function (isPdf) {
      if (!isPdf) {
        showError('"' + file.name + '" doesn\'t look like a valid PDF file.');
        track('file_validation_failed', { reason: 'bad_signature', tool: 'pdf_to_jpg' });
        return;
      }
      return file.arrayBuffer().then(function (buf) {
        return window.pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise
          .then(function (pdf) {
            if (pdf.numPages > MAX_PAGES) {
              showError('This PDF has ' + pdf.numPages + ' pages, over the ' + MAX_PAGES + '-page Free plan limit.');
              track('file_validation_failed', { reason: 'too_many_pages', tool: 'pdf_to_jpg' });
              return;
            }
            current = { file: file, arrayBuffer: buf, name: file.name, pageCount: pdf.numPages };
            track('file_selected', { tool: 'pdf_to_jpg' });
            fileSummaryEl.textContent = current.name + ' · ' + current.pageCount + (current.pageCount === 1 ? ' page' : ' pages') + ' · ' + formatBytes(file.size);
            optionsBox.hidden = false;
            resultBox.hidden = true;
            progressBox.hidden = true;
          })
          .catch(function (err) {
            var msg = String(err && err.message || err && err.name || '');
            if (/password/i.test(msg)) {
              showError('This PDF is password protected. Remove the password and try again.');
              track('file_validation_failed', { reason: 'password_protected', tool: 'pdf_to_jpg' });
            } else {
              showError('This file appears to be corrupted or isn\'t a supported PDF.');
              track('file_validation_failed', { reason: 'corrupted', tool: 'pdf_to_jpg' });
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

  function getFormat() {
    var checked = document.querySelector('input[name="imgFormat"]:checked');
    return checked ? checked.value : 'jpeg';
  }

  convertBtn.addEventListener('click', function () {
    if (!current) return;
    clearError();
    var format = getFormat();
    var ext = format === 'png' ? 'png' : 'jpg';
    var mime = format === 'png' ? 'image/png' : 'image/jpeg';

    optionsBox.hidden = true;
    progressBox.hidden = false;
    progressFill.style.width = '10%';
    progressLabel.textContent = 'Rendering pages…';
    track('convert_started', { tool: 'pdf_to_jpg', format: format, page_count: current.pageCount });
    var startedAt = Date.now();

    window.pdfjsLib.getDocument({ data: new Uint8Array(current.arrayBuffer.slice(0)) }).promise.then(function (pdf) {
      var images = [];
      var chain = Promise.resolve();
      var total = pdf.numPages;
      var namePad = String(total).length;

      for (var i = 1; i <= total; i++) {
        (function (pageNum) {
          chain = chain.then(function () {
            return pdf.getPage(pageNum).then(function (page) {
              var viewport = page.getViewport({ scale: RENDER_SCALE });
              var canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              var ctx = canvas.getContext('2d');
              return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
                return new Promise(function (resolve) {
                  canvas.toBlob(function (blob) {
                    var num = String(pageNum).padStart(namePad, '0');
                    images.push({ name: 'page-' + num + '.' + ext, blob: blob });
                    progressFill.style.width = Math.round((pageNum / total) * 85) + '%';
                    resolve();
                  }, mime, format === 'jpeg' ? 0.88 : undefined);
                });
              });
            });
          });
        })(i);
      }

      return chain.then(function () { return images; });
    }).then(function (images) {
      if (images.length === 1) {
        progressFill.style.width = '100%';
        finishSuccess(images[0].blob, current.name.replace(/\.pdf$/i, '') + '.' + ext,
          '1 image · ' + formatBytes(images[0].blob.size), 'Your image is ready');
        track('convert_completed', { tool: 'pdf_to_jpg', format: format, page_count: 1, duration_ms: Date.now() - startedAt });
        return;
      }
      progressLabel.textContent = 'Building ZIP…';
      var zip = new JSZip();
      images.forEach(function (img) { zip.file(img.name, img.blob); });
      return zip.generateAsync({ type: 'blob' }).then(function (zipBlob) {
        progressFill.style.width = '100%';
        finishSuccess(zipBlob, current.name.replace(/\.pdf$/i, '') + '-images.zip',
          images.length + ' images · ' + formatBytes(zipBlob.size), 'Your images are ready');
        track('convert_completed', { tool: 'pdf_to_jpg', format: format, page_count: images.length, duration_ms: Date.now() - startedAt });
      });
    }).catch(function () {
      progressBox.hidden = true;
      optionsBox.hidden = false;
      showError('Something interrupted the conversion. Please try again — if it keeps happening, the file may be unsupported.');
      track('convert_failed', { tool: 'pdf_to_jpg' });
    });
  });

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

  convertAnotherBtn.addEventListener('click', function () {
    current = null;
    if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
    currentBlob = null;
    currentFilename = null;
    optionsBox.hidden = true;
    resultBox.hidden = true;
    progressBox.hidden = true;
    clearError();
  });

  downloadBtn.addEventListener('click', function () { track('download_clicked', { tool: 'pdf_to_jpg' }); });

  var shareWhatsAppBtn = document.getElementById('pdfShareWhatsAppBtn');
  if (shareWhatsAppBtn) {
    shareWhatsAppBtn.addEventListener('click', function () {
      if (!currentBlob || !currentFilename || !window.KoboExport) return;
      track('download_clicked', { tool: 'pdf_to_jpg', via: 'whatsapp' });
      window.KoboExport.shareWhatsAppBlob(currentFilename, 'Here\'s a file from KoboDocs.', currentBlob);
    });
  }

})();
