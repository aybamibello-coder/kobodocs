// KoboDocs — JPG/PNG to PDF
// Fully client-side: images never leave the browser. pdf-lib loaded via CDN in index.html.
(function () {
  'use strict';

  var MAX_FILES = 20;
  var MAX_FILE_BYTES = 15 * 1024 * 1024;   // 15MB per image
  var MAX_TOTAL_BYTES = 40 * 1024 * 1024;  // 40MB total
  var A4_WIDTH = 595.28, A4_HEIGHT = 841.89, MARGIN = 24;

  var dropzone = document.getElementById('pdfDropzone');
  var fileInput = document.getElementById('pdfFileInput');
  var errorBox = document.getElementById('pdfErrorBox');
  var listWrap = document.getElementById('pdfFileListWrap');
  var fileListEl = document.getElementById('pdfFileList');
  var fileCountEl = document.getElementById('pdfFileCount');
  var summaryLineEl = document.getElementById('pdfSummaryLine');
  var convertBtn = document.getElementById('pdfConvertBtn');
  var addMoreBtn = document.getElementById('pdfAddMoreBtn');
  var clearAllBtn = document.getElementById('pdfClearAll');
  var progressBox = document.getElementById('pdfProgressBox');
  var progressFill = document.getElementById('pdfProgressFill');
  var progressLabel = document.getElementById('pdfProgressLabel');
  var resultBox = document.getElementById('pdfResultBox');
  var resultMeta = document.getElementById('pdfResultMeta');
  var downloadBtn = document.getElementById('pdfDownloadBtn');
  var convertAnotherBtn = document.getElementById('pdfConvertAnotherBtn');

  var items = []; // { id, file, arrayBuffer, name, size, kind: 'jpg'|'png' }
  var idSeq = 0;
  var currentObjectUrl = null;
  var dragSrcId = null;

  function track(name, params) {
    if (typeof gtag === 'function') { try { gtag('event', name, params || {}); } catch (e) {} }
  }
  track('tool_view', { tool: 'jpg_to_pdf' });

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function showError(msg) { errorBox.textContent = msg; errorBox.hidden = false; }
  function clearError() { errorBox.hidden = true; errorBox.textContent = ''; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function detectImageKind(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpg';
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png';
    return null;
  }

  function totalBytes() { return items.reduce(function (s, it) { return s + it.size; }, 0); }

  function addFiles(fileList) {
    clearError();
    var incoming = Array.prototype.slice.call(fileList);
    if (!incoming.length) return;

    if (items.length + incoming.length > MAX_FILES) {
      showError('You can convert up to ' + MAX_FILES + ' images at a time.');
      track('file_validation_failed', { reason: 'too_many_files', tool: 'jpg_to_pdf' });
      incoming = incoming.slice(0, Math.max(0, MAX_FILES - items.length));
      if (!incoming.length) return;
    }

    var chain = Promise.resolve();
    var addedCount = 0;

    incoming.forEach(function (file) {
      chain = chain.then(function () {
        if (file.size > MAX_FILE_BYTES) {
          showError('"' + file.name + '" is larger than the 15MB per-image limit.');
          track('file_validation_failed', { reason: 'file_too_large', tool: 'jpg_to_pdf' });
          return;
        }
        if (totalBytes() + file.size > MAX_TOTAL_BYTES) {
          showError('Adding "' + file.name + '" would go over the 40MB total limit. Try converting in smaller batches.');
          track('file_validation_failed', { reason: 'total_too_large', tool: 'jpg_to_pdf' });
          return;
        }
        return file.arrayBuffer().then(function (buf) {
          var kind = detectImageKind(new Uint8Array(buf));
          if (!kind) {
            showError('"' + file.name + '" isn\'t a supported JPG or PNG file (HEIC and other formats aren\'t supported yet).');
            track('file_validation_failed', { reason: 'unsupported_format', tool: 'jpg_to_pdf' });
            return;
          }
          items.push({ id: ++idSeq, file: file, arrayBuffer: buf, name: file.name, size: file.size, kind: kind });
          addedCount++;
          track('file_selected', { tool: 'jpg_to_pdf' });
        });
      });
    });

    chain.then(function () {
      if (addedCount > 0) clearError();
      renderList();
    });
  }

  function renderList() {
    fileListEl.innerHTML = '';
    items.forEach(function (it, idx) {
      var li = document.createElement('li');
      li.className = 'pdf-file-card';
      li.draggable = true;
      li.dataset.id = it.id;
      li.setAttribute('aria-label', (idx + 1) + ' of ' + items.length + ': ' + it.name);
      li.innerHTML =
        '<svg class="pdf-file-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="1.5"/><path d="M3 16l5-5 4 4 3-3 6 6"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>' +
        '<div class="pdf-file-info">' +
          '<div class="pdf-file-name">' + (idx + 1) + '. ' + escapeHtml(it.name) + '</div>' +
          '<div class="pdf-file-meta">' + formatBytes(it.size) + ' · ' + it.kind.toUpperCase() + '</div>' +
        '</div>' +
        '<div class="pdf-file-controls">' +
          '<button type="button" class="pdf-file-btn pdf-move-up" aria-label="Move ' + escapeHtml(it.name) + ' up" ' + (idx === 0 ? 'disabled' : '') + '>&uarr;</button>' +
          '<button type="button" class="pdf-file-btn pdf-move-down" aria-label="Move ' + escapeHtml(it.name) + ' down" ' + (idx === items.length - 1 ? 'disabled' : '') + '>&darr;</button>' +
          '<button type="button" class="pdf-file-btn pdf-file-remove" aria-label="Remove ' + escapeHtml(it.name) + '">&times;</button>' +
        '</div>';
      fileListEl.appendChild(li);
    });

    fileCountEl.textContent = items.length + (items.length === 1 ? ' image selected' : ' images selected');
    summaryLineEl.textContent = items.length
      ? ('Estimated result: ' + items.length + (items.length === 1 ? ' page' : ' pages') + ', ' + formatBytes(totalBytes()) + ' total input')
      : '';
    listWrap.hidden = items.length === 0;
    convertBtn.disabled = items.length < 1;
  }

  function removeItem(id) { items = items.filter(function (it) { return it.id !== id; }); renderList(); }
  function moveItem(id, dir) {
    var idx = items.findIndex(function (it) { return it.id === id; });
    if (idx < 0) return;
    var n = idx + dir;
    if (n < 0 || n >= items.length) return;
    var t = items[idx]; items[idx] = items[n]; items[n] = t;
    renderList();
  }

  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('change', function (e) { addFiles(e.target.files); fileInput.value = ''; });
  addMoreBtn.addEventListener('click', function () { fileInput.click(); });

  ['dragenter', 'dragover'].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) { e.preventDefault(); dropzone.classList.add('pdf-dropzone-active'); });
  });
  ['dragleave', 'drop'].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) { e.preventDefault(); dropzone.classList.remove('pdf-dropzone-active'); });
  });
  dropzone.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  fileListEl.addEventListener('click', function (e) {
    var card = e.target.closest('.pdf-file-card');
    if (!card) return;
    var id = Number(card.dataset.id);
    if (e.target.closest('.pdf-file-remove')) removeItem(id);
    else if (e.target.closest('.pdf-move-up')) moveItem(id, -1);
    else if (e.target.closest('.pdf-move-down')) moveItem(id, 1);
  });
  fileListEl.addEventListener('dragstart', function (e) {
    var card = e.target.closest('.pdf-file-card');
    if (!card) return;
    dragSrcId = Number(card.dataset.id);
    card.classList.add('pdf-file-dragging');
  });
  fileListEl.addEventListener('dragend', function (e) {
    var card = e.target.closest('.pdf-file-card');
    if (card) card.classList.remove('pdf-file-dragging');
  });
  fileListEl.addEventListener('dragover', function (e) { e.preventDefault(); });
  fileListEl.addEventListener('drop', function (e) {
    e.preventDefault();
    var card = e.target.closest('.pdf-file-card');
    if (!card || dragSrcId === null) return;
    var targetId = Number(card.dataset.id);
    if (targetId === dragSrcId) return;
    var fromIdx = items.findIndex(function (it) { return it.id === dragSrcId; });
    var toIdx = items.findIndex(function (it) { return it.id === targetId; });
    if (fromIdx < 0 || toIdx < 0) return;
    var moved = items.splice(fromIdx, 1)[0];
    items.splice(toIdx, 0, moved);
    dragSrcId = null;
    renderList();
  });

  clearAllBtn.addEventListener('click', function () { items = []; renderList(); clearError(); });
  convertAnotherBtn.addEventListener('click', resetToStart);

  function resetToStart() {
    items = [];
    if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
    renderList();
    clearError();
    listWrap.hidden = true;
    resultBox.hidden = true;
    progressBox.hidden = true;
  }

  convertBtn.addEventListener('click', function () {
    if (items.length < 1 || convertBtn.disabled) return;
    convertBtn.disabled = true;
    listWrap.hidden = true;
    progressBox.hidden = false;
    progressFill.style.width = '5%';
    progressLabel.textContent = 'Building your PDF…';
    clearError();
    track('convert_started', { tool: 'jpg_to_pdf', file_count: items.length });
    var startedAt = Date.now();

    window.PDFLib.PDFDocument.create().then(function (doc) {
      var chain = Promise.resolve();
      items.forEach(function (it, idx) {
        chain = chain.then(function () {
          var embedPromise = it.kind === 'jpg' ? doc.embedJpg(it.arrayBuffer) : doc.embedPng(it.arrayBuffer);
          return embedPromise.then(function (img) {
            var page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
            var maxW = A4_WIDTH - MARGIN * 2, maxH = A4_HEIGHT - MARGIN * 2;
            var scale = Math.min(maxW / img.width, maxH / img.height, 1);
            // allow upscale of very small images to fill more of the page, capped reasonably
            if (scale < 1 && (img.width < maxW && img.height < maxH)) {
              scale = Math.min(maxW / img.width, maxH / img.height);
            }
            var w = img.width * scale, h = img.height * scale;
            page.drawImage(img, { x: (A4_WIDTH - w) / 2, y: (A4_HEIGHT - h) / 2, width: w, height: h });
            progressFill.style.width = Math.round(((idx + 1) / items.length) * 90) + '%';
          });
        });
      });
      return chain.then(function () { return doc.save(); });
    }).then(function (bytes) {
      progressFill.style.width = '100%';
      var blob = new Blob([bytes], { type: 'application/pdf' });
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = URL.createObjectURL(blob);
      var filename = 'images-to-pdf-' + items.length + '.pdf';
      downloadBtn.href = currentObjectUrl;
      downloadBtn.setAttribute('download', filename);
      resultMeta.textContent = items.length + (items.length === 1 ? ' page' : ' pages') + ' · ' + formatBytes(blob.size);
      progressBox.hidden = true;
      resultBox.hidden = false;
      track('convert_completed', { tool: 'jpg_to_pdf', file_count: items.length, duration_ms: Date.now() - startedAt });
    }).catch(function (err) {
      progressBox.hidden = true;
      listWrap.hidden = false;
      convertBtn.disabled = false;
      var msg = String(err && err.message || '');
      if (/memory|alloc/i.test(msg)) {
        showError('Your browser ran out of memory while building this PDF. Try fewer or smaller images.');
      } else {
        showError('Something interrupted the conversion. Please try again — if it keeps happening, one of the images may be unsupported.');
      }
      track('convert_failed', { tool: 'jpg_to_pdf', file_count: items.length });
    });
  });

  downloadBtn.addEventListener('click', function () { track('download_clicked', { tool: 'jpg_to_pdf' }); });

})();
