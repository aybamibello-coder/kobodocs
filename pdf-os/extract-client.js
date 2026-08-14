// PDF OS — client-side document text extraction.
// Mirrors the proven ocr-pdf-pages pattern exactly: rendering PDF pages
// to images requires a browser canvas, which the Deno edge runtime does
// not reliably provide — so all rendering happens here, client-side,
// same as the existing OCR Pro tool. REMOTE tools send the result of
// this (either a text layer or base64 page images) as JSON, never a raw
// PDF file.
window.PdfOsExtractClient = {
  // Returns Promise<{ mode: 'text', text } | { mode: 'images', images: [{data, mime_type}] }>
  prepare: function (file) {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    return window.pdfjsLib.getDocument({ data: file.arrayBuffer.slice(0) }).promise.then(function (doc) {
      return extractTextLayer(doc).then(function (text) {
        if (text.trim().length > 40) {
          return { mode: 'text', text: text };
        }
        // No usable text layer -> scanned doc -> render pages to images,
        // same technique as ocr-pdf-pages expects (max 10 pages there too).
        return renderPagesToImages(doc, Math.min(doc.numPages, 10)).then(function (images) {
          return { mode: 'images', images: images };
        });
      });
    });
  }
};

function extractTextLayer(doc) {
  var chain = Promise.resolve();
  var text = '';
  for (var i = 1; i <= doc.numPages; i++) {
    (function (pageNum) {
      chain = chain.then(function () {
        return doc.getPage(pageNum).then(function (page) {
          return page.getTextContent().then(function (content) {
            text += content.items.map(function (it) { return it.str; }).join(' ') + '\n';
          });
        });
      });
    })(i);
  }
  return chain.then(function () { return text; });
}

function renderPagesToImages(doc, pageCount) {
  var RENDER_SCALE = 2.0;
  var chain = Promise.resolve();
  var images = [];
  for (var i = 1; i <= pageCount; i++) {
    (function (pageNum) {
      chain = chain.then(function () {
        return doc.getPage(pageNum).then(function (page) {
          var viewport = page.getViewport({ scale: RENDER_SCALE });
          var canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          var ctx = canvas.getContext('2d');
          return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
            var dataUrl = canvas.toDataURL('image/png');
            images.push({ data: dataUrl.split(',')[1], mime_type: 'image/png' });
          });
        });
      });
    })(i);
  }
  return chain.then(function () { return images; });
}
