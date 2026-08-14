// ---------- PDF OS local tool handlers ----------
// Same pdf-lib operations as merge-pdf/merge.js, compress-pdf/compress.js
// etc. — adapted here to run headlessly (no DOM/progress-bar wiring) as
// steps inside an agent plan instead of a single-purpose page. Kept as
// separate functions, not a shared imported module, since Toolkit's pages
// are static HTML with no build step — duplication here is deliberate,
// not an oversight (see architecture note on why there's no shared engine).
window.PdfOsLocalTools = {

  merge_pdf: function (input, fileStore) {
    var files = input.file_ids.map(function (id) { return fileStore[id]; });
    return window.PDFLib.PDFDocument.create().then(function (mergedDoc) {
      var chain = Promise.resolve();
      files.forEach(function (f) {
        chain = chain.then(function () {
          return window.PDFLib.PDFDocument.load(f.arrayBuffer).then(function (srcDoc) {
            return mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices()).then(function (pages) {
              pages.forEach(function (p) { mergedDoc.addPage(p); });
            });
          });
        });
      });
      return chain.then(function () { return mergedDoc.save(); });
    }).then(function (bytes) {
      return { output_file: makeFile('merged.pdf', bytes) };
    });
  },

  split_pdf: function (input, fileStore) {
    var src = fileStore[input.file_id];
    return window.PDFLib.PDFDocument.load(src.arrayBuffer).then(function (srcDoc) {
      var ranges = input.mode === 'every_page'
        ? srcDoc.getPageIndices().map(function (i) { return [i, i]; })
        : input.ranges.map(parseRange);

      var chain = Promise.resolve();
      var outputs = [];
      ranges.forEach(function (r, idx) {
        chain = chain.then(function () {
          return window.PDFLib.PDFDocument.create().then(function (doc) {
            var indices = [];
            for (var i = r[0]; i <= r[1]; i++) indices.push(i);
            return doc.copyPages(srcDoc, indices).then(function (pages) {
              pages.forEach(function (p) { doc.addPage(p); });
              return doc.save();
            }).then(function (bytes) {
              outputs.push(makeFile('split-' + (idx + 1) + '.pdf', bytes));
            });
          });
        });
      });
      return chain.then(function () { return { output_file: outputs[0], output_files: outputs }; });
    });
  },

  compress_pdf: function (input, fileStore) {
    var src = fileStore[input.file_id];
    return window.PDFLib.PDFDocument.load(src.arrayBuffer).then(function (doc) {
      try {
        doc.setTitle(''); doc.setAuthor(''); doc.setSubject('');
        doc.setKeywords([]); doc.setProducer(''); doc.setCreator('');
      } catch (e) { /* fields may not all exist */ }
      return doc.save({ useObjectStreams: true });
    }).then(function (bytes) {
      return { output_file: makeFile(stripExt(src.name) + '-compressed.pdf', bytes) };
    });
  },

  watermark_pdf: function (input, fileStore) {
    var src = fileStore[input.file_id];
    return window.PDFLib.PDFDocument.load(src.arrayBuffer).then(function (doc) {
      var pages = doc.getPages();
      pages.forEach(function (page) {
        var size = page.getSize();
        page.drawText(input.text, {
          x: size.width / 4, y: size.height / 2,
          size: 40, opacity: input.opacity || 0.25, rotate: window.PDFLib.degrees(-45)
        });
      });
      return doc.save();
    }).then(function (bytes) {
      return { output_file: makeFile(stripExt(src.name) + '-watermarked.pdf', bytes) };
    });
  },

  convert_image_to_pdf: function (input, fileStore) {
    return window.PDFLib.PDFDocument.create().then(function (doc) {
      var chain = Promise.resolve();
      input.file_ids.forEach(function (id) {
        chain = chain.then(function () {
          var f = fileStore[id];
          var embed = /\.png$/i.test(f.name) ? doc.embedPng(f.arrayBuffer) : doc.embedJpg(f.arrayBuffer);
          return embed.then(function (img) {
            var page = doc.addPage([img.width, img.height]);
            page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
          });
        });
      });
      return chain.then(function () { return doc.save(); });
    }).then(function (bytes) {
      return { output_file: makeFile('converted.pdf', bytes) };
    });
  },

  convert_pdf_to_image: function () {
    // Uses pdf.js render-to-canvas, same technique as pdf-to-jpg/pdf-to-jpg.js.
    // Omitted here for brevity — same pattern as the tools above.
    return Promise.reject({ code: 'NOT_IMPLEMENTED_IN_SKELETON' });
  }
};

function makeFile(name, bytes) {
  return { id: 'f_' + Math.random().toString(36).slice(2), name: name, size: bytes.length, arrayBuffer: bytes.buffer || bytes };
}
function stripExt(name) { return name.replace(/\.pdf$/i, ''); }
function parseRange(str) {
  var parts = str.split('-').map(function (n) { return parseInt(n, 10) - 1; });
  return parts.length === 1 ? [parts[0], parts[0]] : parts;
}
