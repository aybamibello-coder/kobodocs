// KoboDocs — Merge PDF
// Fully client-side: files never leave the browser. pdf-lib loaded via CDN in index.html.
(function () {
  'use strict';

  var MAX_FILES = 20;
  var MAX_FILE_BYTES = 20 * 1024 * 1024;   // 20MB per file
  var MAX_TOTAL_BYTES = 50 * 1024 * 1024;  // 50MB total

  var dropzone = document.getElementById('pdfDropzone');
  var fileInput = document.getElementById('pdfFileInput');
  var errorBox = document.getElementById('pdfErrorBox');
  var listWrap = document.getElementById('pdfFileListWrap');
  var fileListEl = document.getElementById('pdfFileList');
  var fileCountEl = document.getElementById('pdfFileCount');
  var summaryLineEl = document.getElementById('pdfSummaryLine');
  var mergeBtn = document.getElementById('pdfMergeBtn');
  var addMoreBtn = document.getElementById('pdfAddMoreBtn');
  var clearAllBtn = document.getElementById('pdfClearAll');
  var progressBox = document.getElementById('pdfProgressBox');
  var progressFill = document.getElementById('pdfProgressFill');
  var progressLabel = document.getElementById('pdfProgressLabel');
  var resultBox = document.getElementById('pdfResultBox');
  var resultMeta = document.getElementById('pdfResultMeta');
  var downloadBtn = document.getElementById('pdfDownloadBtn');
  var mergeAnotherBtn = document.getElementById('pdfMergeAnotherBtn');

  // state: array of { id, file, name, size, pages }
  var items = [];
  var idSeq = 0;
  var currentObjectUrl = null;
  var dragSrcId = null;

  function track(name, params) {
    if (typeof gtag === 'function') {
      try { gtag('event', name, params || {}); } catch (e) { /* no-op */ }
    }
  }

  track('tool_view', { tool: 'merge_pdf' });

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }
  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  // Verify actual file signature (%PDF-) rather than trusting extension/MIME.
  function readsAsPdfSignature(file) {
    return file.slice(0, 5).arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf);
      var sig = String.fromCharCode.apply(null, bytes);
      return sig === '%PDF-';
    }).catch(function () { return false; });
  }

  function totalBytes() {
    return items.reduce(function (sum, it) { return sum + it.size; }, 0);
  }

  function addFiles(fileList) {
    clearError();
    var incoming = Array.prototype.slice.call(fileList);
    if (!incoming.length) return;

    if (items.length + incoming.length > MAX_FILES) {
      showError('You can merge up to ' + MAX_FILES + ' files at a time. Remove some files or merge in two batches.');
      track('file_validation_failed', { reason: 'too_many_files' });
      incoming = incoming.slice(0, Math.max(0, MAX_FILES - items.length));
      if (!incoming.length) return;
    }

    var validationChain = Promise.resolve();
    var addedCount = 0;

    incoming.forEach(function (file) {
      validationChain = validationChain.then(function () {
        var lowerName = (file.name || '').toLowerCase();
        var looksLikePdf = lowerName.endsWith('.pdf') || file.type === 'application/pdf';

        if (!looksLikePdf) {
          showError('"' + file.name + '" isn\'t a PDF file. Only PDF files can be merged here.');
          track('file_validation_failed', { reason: 'wrong_type' });
          return;
        }
        if (file.size > MAX_FILE_BYTES) {
          showError('"' + file.name + '" is larger than the 20MB per-file limit on the Free plan.');
          track('file_validation_failed', { reason: 'file_too_large' });
          return;
        }
        if (totalBytes() + file.size > MAX_TOTAL_BYTES) {
          showError('Adding "' + file.name + '" would go over the 50MB total limit for a single merge. Try merging in smaller batches.');
          track('file_validation_failed', { reason: 'total_too_large' });
          return;
        }

        return readsAsPdfSignature(file).then(function (isPdf) {
          if (!isPdf) {
            showError('"' + file.name + '" doesn\'t look like a valid PDF file. It may be corrupted or renamed from a different format.');
            track('file_validation_failed', { reason: 'bad_signature' });
            return;
          }

          return file.arrayBuffer().then(function (buf) {
            return window.PDFLib.PDFDocument.load(buf, { ignoreEncryption: false })
              .then(function (doc) {
                items.push({
                  id: ++idSeq,
                  file: file,
                  arrayBuffer: buf,
                  name: file.name,
                  size: file.size,
                  pages: doc.getPageCount()
                });
                addedCount++;
                track('file_selected', { tool: 'merge_pdf' });
              })
              .catch(function (err) {
                var msg = String(err && err.message || '');
                if (/encrypt/i.test(msg)) {
                  showError('"' + file.name + '" is password protected. Remove the password on your device and try again.');
                  track('file_validation_failed', { reason: 'password_protected' });
                } else {
                  showError('"' + file.name + '" appears to be corrupted or isn\'t a supported PDF. Try opening it on your device first.');
                  track('file_validation_failed', { reason: 'corrupted' });
                }
              });
          });
        });
      });
    });

    validationChain.then(function () {
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
        '<svg class="pdf-file-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' +
        '<div class="pdf-file-info">' +
          '<div class="pdf-file-name">' + (idx + 1) + '. ' + escapeHtml(it.name) + '</div>' +
          '<div class="pdf-file-meta">' + formatBytes(it.size) + (it.pages ? ' · ' + it.pages + (it.pages === 1 ? ' page' : ' pages') : '') + '</div>' +
        '</div>' +
        '<div class="pdf-file-controls">' +
          '<button type="button" class="pdf-file-btn pdf-move-up" aria-label="Move ' + escapeHtml(it.name) + ' up" ' + (idx === 0 ? 'disabled' : '') + '>&uarr;</button>' +
          '<button type="button" class="pdf-file-btn pdf-move-down" aria-label="Move ' + escapeHtml(it.name) + ' down" ' + (idx === items.length - 1 ? 'disabled' : '') + '>&darr;</button>' +
          '<button type="button" class="pdf-file-btn pdf-file-remove" aria-label="Remove ' + escapeHtml(it.name) + '">&times;</button>' +
        '</div>';

      fileListEl.appendChild(li);
    });

    fileCountEl.textContent = items.length + (items.length === 1 ? ' file selected' : ' files selected');
    var pageTotal = items.reduce(function (s, it) { return s + (it.pages || 0); }, 0);
    summaryLineEl.textContent = items.length
      ? ('Estimated result: ' + pageTotal + ' pages, ' + formatBytes(totalBytes()) + ' total input')
      : '';

    listWrap.hidden = items.length === 0;
    mergeBtn.disabled = items.length < 2;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function removeItem(id) {
    items = items.filter(function (it) { return it.id !== id; });
    renderList();
  }

  function moveItem(id, direction) {
    var idx = items.findIndex(function (it) { return it.id === id; });
    if (idx < 0) return;
    var newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= items.length) return;
    var tmp = items[idx];
    items[idx] = items[newIdx];
    items[newIdx] = tmp;
    renderList();
  }

  // Click / keyboard on dropzone opens picker
  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', function (e) {
    addFiles(e.target.files);
    fileInput.value = '';
  });
  addMoreBtn.addEventListener('click', function () { fileInput.click(); });

  // Desktop drag-and-drop of files onto the dropzone
  ['dragenter', 'dragover'].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      dropzone.classList.add('pdf-dropzone-active');
    });
  });
  ['dragleave', 'drop'].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      dropzone.classList.remove('pdf-dropzone-active');
    });
  });
  dropzone.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  // List interactions: remove / move via buttons (works on touch); drag reorder for desktop
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

  clearAllBtn.addEventListener('click', function () {
    items = [];
    renderList();
    clearError();
  });

  mergeAnotherBtn.addEventListener('click', resetToStart);

  function resetToStart() {
    items = [];
    if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
    renderList();
    clearError();
    listWrap.hidden = true;
    resultBox.hidden = true;
    progressBox.hidden = true;
  }

  mergeBtn.addEventListener('click', function () {
    if (items.length < 2 || mergeBtn.disabled) return;
    mergeBtn.disabled = true;
    listWrap.hidden = true;
    progressBox.hidden = false;
    progressFill.style.width = '5%';
    progressLabel.textContent = 'Merging your PDFs…';
    clearError();

    track('merge_started', { tool: 'merge_pdf', file_count: items.length });

    var startedAt = Date.now();

    Promise.resolve().then(function () {
      return window.PDFLib.PDFDocument.create();
    }).then(function (mergedDoc) {
      var chain = Promise.resolve();
      items.forEach(function (it, idx) {
        chain = chain.then(function () {
          return window.PDFLib.PDFDocument.load(it.arrayBuffer).then(function (srcDoc) {
            return mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices()).then(function (copiedPages) {
              copiedPages.forEach(function (p) { mergedDoc.addPage(p); });
              progressFill.style.width = Math.round(((idx + 1) / items.length) * 90) + '%';
            });
          });
        });
      });
      return chain.then(function () { return mergedDoc; });
    }).then(function (mergedDoc) {
      progressLabel.textContent = 'Finishing up…';
      return mergedDoc.save();
    }).then(function (bytes) {
      progressFill.style.width = '100%';
      var blob = new Blob([bytes], { type: 'application/pdf' });
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = URL.createObjectURL(blob);

      var pageTotal = items.reduce(function (s, it) { return s + (it.pages || 0); }, 0);
      var filename = 'merged-' + items.length + '-files.pdf';

      downloadBtn.href = currentObjectUrl;
      downloadBtn.setAttribute('download', filename);
      resultMeta.textContent = pageTotal + ' pages · ' + formatBytes(blob.size);

      progressBox.hidden = true;
      resultBox.hidden = false;

      track('merge_completed', {
        tool: 'merge_pdf',
        file_count: items.length,
        page_count: pageTotal,
        duration_ms: Date.now() - startedAt
      });
    }).catch(function (err) {
      progressBox.hidden = true;
      listWrap.hidden = false;
      mergeBtn.disabled = false;
      var msg = String(err && err.message || '');
      if (/encrypt/i.test(msg)) {
        showError('One of your PDFs is password protected. Remove the password and try again.');
      } else if (/memory|alloc/i.test(msg)) {
        showError('Your browser ran out of memory while merging these files. Try fewer files, or split large files first.');
      } else {
        showError('Something interrupted the merge. Please try again — if it keeps happening, one of the files may be corrupted.');
      }
      track('merge_failed', { tool: 'merge_pdf', file_count: items.length });
    });
  });

  downloadBtn.addEventListener('click', function () {
    track('download_clicked', { tool: 'merge_pdf' });
  });

})();
