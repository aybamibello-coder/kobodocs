// KoboDocs — Word to PDF
// Fully client-side: file never leaves the browser. mammoth.js (docx -> HTML)
// + pdf-lib (real, selectable text laid out with wrapping/pagination) loaded
// via CDN in index.html.
//
// Honest scope: preserves headings, paragraphs and bullet lists as real
// text. Does NOT preserve inline bold/italic within a paragraph, tables,
// images, or complex layout — a proper layout engine can't run reliably
// in-browser. The page copy says so; skipped elements are also counted
// and reported to the user after conversion rather than silently dropped.
(function () {
  'use strict';

  var MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
  var PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 56;
  var MAX_WIDTH = PAGE_W - MARGIN * 2;

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
  var resultMeta = document.getElementById('pdfResultMeta');
  var resultWarning = document.getElementById('pdfResultWarning');
  var downloadBtn = document.getElementById('pdfDownloadBtn');
  var convertAnotherBtn = document.getElementById('pdfConvertAnotherBtn');

  var current = null; // { file, arrayBuffer, name }
  var currentObjectUrl = null;
  var currentBlob = null;
  var currentFilename = null;

  function track(name, params) {
    if (window.KoboTrack) { window.KoboTrack(name, params); }
    else if (typeof gtag === 'function') {
      try { gtag('event', name, params || {}); } catch (e) { /* no-op */ }
    }
  }
  track('tool_view', { tool: 'word_to_pdf' });

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function showError(msg) { errorBox.textContent = msg; errorBox.hidden = false; }
  function clearError() { errorBox.hidden = true; errorBox.textContent = ''; }

  // .docx files are ZIP archives — check the ZIP local-file-header signature (PK\x03\x04).
  function readsAsZipSignature(file) {
    return file.slice(0, 4).arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf);
      return b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04;
    }).catch(function () { return false; });
  }

  function handleFile(file) {
    clearError();
    if (!file) return;
    var lowerName = (file.name || '').toLowerCase();
    if (lowerName.endsWith('.doc') && !lowerName.endsWith('.docx')) {
      showError('".doc" files aren\'t supported — please save this as a .docx file first, then try again.');
      track('file_validation_failed', { reason: 'legacy_doc_format', tool: 'word_to_pdf' });
      return;
    }
    if (!lowerName.endsWith('.docx')) {
      showError('"' + file.name + '" isn\'t a .docx file.');
      track('file_validation_failed', { reason: 'wrong_type', tool: 'word_to_pdf' });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showError('"' + file.name + '" is larger than the 15MB limit on the Free plan.');
      track('file_validation_failed', { reason: 'file_too_large', tool: 'word_to_pdf' });
      return;
    }
    readsAsZipSignature(file).then(function (isZip) {
      if (!isZip) {
        showError('"' + file.name + '" doesn\'t look like a valid .docx file.');
        track('file_validation_failed', { reason: 'bad_signature', tool: 'word_to_pdf' });
        return;
      }
      current = { file: file, name: file.name };
      track('file_selected', { tool: 'word_to_pdf' });
      fileSummaryEl.textContent = current.name + ' · ' + formatBytes(file.size);
      optionsBox.hidden = false;
      resultBox.hidden = true;
      progressBox.hidden = true;
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

  // Word-wraps `text` at `maxWidth` for the given font/size, returning an array of lines.
  function wrapText(text, font, size, maxWidth) {
    var words = text.split(/\s+/).filter(Boolean);
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var test = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  convertBtn.addEventListener('click', function () {
    if (!current) return;
    clearError();
    optionsBox.hidden = true;
    progressBox.hidden = false;
    progressFill.style.width = '10%';
    progressLabel.textContent = 'Reading your document…';
    track('convert_started', { tool: 'word_to_pdf' });
    var startedAt = Date.now();

    current.file.arrayBuffer().then(function (arrayBuffer) {
      return window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
    }).then(function (result) {
      progressFill.style.width = '35%';
      progressLabel.textContent = 'Laying out your PDF…';

      var parser = new DOMParser();
      var docHtml = parser.parseFromString('<div>' + result.value + '</div>', 'text/html');
      var root = docHtml.body.firstChild;
      var blocks = [];
      var skippedCount = 0;

      Array.prototype.forEach.call(root.children, function (el) {
        var tag = el.tagName.toLowerCase();
        if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
          blocks.push({ type: tag, text: el.textContent.trim() });
        } else if (tag === 'p') {
          var text = el.textContent.trim();
          if (text) blocks.push({ type: 'p', text: text });
        } else if (tag === 'ul' || tag === 'ol') {
          Array.prototype.forEach.call(el.querySelectorAll('li'), function (li) {
            var t = li.textContent.trim();
            if (t) blocks.push({ type: 'li', text: t });
          });
        } else if (tag === 'table' || tag === 'img' || tag === 'figure') {
          skippedCount++;
        } else {
          var fallbackText = el.textContent.trim();
          if (fallbackText) blocks.push({ type: 'p', text: fallbackText });
        }
      });

      return window.PDFLib.PDFDocument.create().then(function (doc) {
        return Promise.all([
          doc.embedFont(window.PDFLib.StandardFonts.Helvetica),
          doc.embedFont(window.PDFLib.StandardFonts.HelveticaBold),
        ]).then(function (fonts) {
          var fontRegular = fonts[0], fontBold = fonts[1];
          var page = doc.addPage([PAGE_W, PAGE_H]);
          var y = PAGE_H - MARGIN;

          function ensureSpace(neededHeight) {
            if (y - neededHeight < MARGIN) {
              page = doc.addPage([PAGE_W, PAGE_H]);
              y = PAGE_H - MARGIN;
            }
          }

          blocks.forEach(function (block, idx) {
            var font = fontRegular, size = 11, lineHeight = 15, spacingBefore = 6, spacingAfter = 6, indent = 0, prefix = '';
            if (block.type === 'h1') { font = fontBold; size = 22; lineHeight = 28; spacingBefore = 4; spacingAfter = 12; }
            else if (block.type === 'h2') { font = fontBold; size = 17; lineHeight = 22; spacingBefore = 14; spacingAfter = 8; }
            else if (/^h[3-6]$/.test(block.type)) { font = fontBold; size = 13; lineHeight = 18; spacingBefore = 10; spacingAfter = 6; }
            else if (block.type === 'li') { indent = 16; prefix = '\u2022 '; }

            ensureSpace(lineHeight + spacingBefore);
            y -= spacingBefore;
            var lines = wrapText(prefix + block.text, font, size, MAX_WIDTH - indent);
            lines.forEach(function (line) {
              ensureSpace(lineHeight);
              y -= lineHeight;
              page.drawText(line, { x: MARGIN + indent, y: y, size: size, font: font, color: window.PDFLib.rgb(0.1, 0.1, 0.1) });
            });
            y -= spacingAfter;

            progressFill.style.width = Math.round(35 + ((idx + 1) / Math.max(1, blocks.length)) * 55) + '%';
          });

          return doc.save().then(function (bytes) { return { bytes: bytes, pageCount: doc.getPageCount(), skippedCount: skippedCount, blockCount: blocks.length }; });
        });
      });
    }).then(function (out) {
      progressFill.style.width = '100%';
      if (out.blockCount === 0) {
        progressBox.hidden = true;
        optionsBox.hidden = false;
        showError('No readable text was found in this document — it may be empty, or built mostly from tables and images that this free tool can\'t convert.');
        track('convert_failed', { tool: 'word_to_pdf', reason: 'no_content' });
        return;
      }
      var blob = new Blob([out.bytes], { type: 'application/pdf' });
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = URL.createObjectURL(blob);
      var outFilename = current.name.replace(/\.docx$/i, '') + '.pdf';
      currentBlob = blob;
      currentFilename = outFilename;
      downloadBtn.href = currentObjectUrl;
      downloadBtn.setAttribute('download', outFilename);
      resultMeta.textContent = out.pageCount + (out.pageCount === 1 ? ' page' : ' pages') + ' · ' + formatBytes(blob.size);

      if (out.skippedCount > 0) {
        resultWarning.textContent = out.skippedCount + (out.skippedCount === 1 ? ' table or image was' : ' tables or images were') + ' in the original document and could not be included — text content was kept.';
        resultWarning.hidden = false;
      } else {
        resultWarning.hidden = true;
      }

      progressBox.hidden = true;
      resultBox.hidden = false;
      track('convert_completed', { tool: 'word_to_pdf', page_count: out.pageCount, skipped_count: out.skippedCount, duration_ms: Date.now() - startedAt });
    }).catch(function () {
      progressBox.hidden = true;
      optionsBox.hidden = false;
      showError('Something interrupted the conversion. Please try again — if it keeps happening, the file may be corrupted or use unsupported formatting.');
      track('convert_failed', { tool: 'word_to_pdf' });
    });
  });

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

  downloadBtn.addEventListener('click', function () { track('download_clicked', { tool: 'word_to_pdf' }); });

  var shareWhatsAppBtn = document.getElementById('pdfShareWhatsAppBtn');
  if (shareWhatsAppBtn) {
    shareWhatsAppBtn.addEventListener('click', function () {
      if (!currentBlob || !currentFilename || !window.KoboExport) return;
      track('download_clicked', { tool: 'word_to_pdf', via: 'whatsapp' });
      window.KoboExport.shareWhatsAppBlob(currentFilename, 'Here\'s the PDF from KoboDocs.', currentBlob);
    });
  }

})();
