// ---------- Shared image-based export (PDF + WhatsApp) ----------
// Captures the actual styled #docPreview as an image, rather than
// redrawing plain text, so the PDF and WhatsApp share look like the
// real document (stamp, fonts, colors) instead of a bare text dump.
window.KoboExport = {
  async capture(elementId = 'docPreview') {
    const node = document.getElementById(elementId);
    return await html2canvas(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true
    });
  },

  async downloadPdf(filename, elementId = 'docPreview') {
    const canvas = await this.capture(elementId);
    const { jsPDF } = window.jspdf;

    const pageWidth = 595.28;  // A4 in points
    const pageHeight = 841.89;
    const margin = 24;
    const maxW = pageWidth - margin * 2;
    const maxH = pageHeight - margin * 2;

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const scale = maxW / canvas.width; // px -> pt, fit full width
    const scaledFullHeight = canvas.height * scale;

    if (scaledFullHeight <= maxH) {
      // Fits on one page — center it vertically like a normal document
      const imgData = canvas.toDataURL('image/png');
      doc.addImage(imgData, 'PNG', margin, margin, maxW, scaledFullHeight);
    } else {
      // Long document (e.g. a multi-year loan schedule) — split across pages
      // at full width rather than shrinking everything to fit one page.
      const pxPerPage = Math.floor(maxH / scale);
      let renderedPx = 0;
      let first = true;
      while (renderedPx < canvas.height) {
        const sliceHeightPx = Math.min(pxPerPage, canvas.height - renderedPx);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeightPx;
        sliceCanvas.getContext('2d').drawImage(
          canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx
        );
        if (!first) doc.addPage();
        doc.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, margin, maxW, sliceHeightPx * scale);
        renderedPx += sliceHeightPx;
        first = false;
      }
    }
    doc.save(filename);
  },

  // Returns 'shared' if the native share sheet was used, 'downloaded' if we
  // fell back to downloading the image and opening WhatsApp with just the caption.
  async shareWhatsApp(filename, caption, elementId = 'docPreview') {
    const canvas = await this.capture(elementId);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], filename, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: caption, title: filename });
      return 'shared';
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, '_blank');
    return 'downloaded';
  }
};
