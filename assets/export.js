// ---------- KoboDocs shared PDF export engine ----------
// Builds real, text-based PDFs directly with jsPDF (no html2canvas / no
// screenshotting). This keeps generation synchronous and fast, which is
// required for file downloads and navigator.share() to work reliably on
// mobile browsers — anything that waits on a slow async screenshot loses
// the "this came from a direct tap" trust the browser needs and silently
// fails or opens a blank tab.
window.KoboExport = {
  PAGE_WIDTH: 595.28,   // A4 in points
  PAGE_HEIGHT: 841.89,
  MARGIN: 48,

  // ---------- Table-style documents: invoice, receipt, quotation, payslip, waybill, budget, loan ----------
  buildTablePdf({
    docLabel,
    businessName,
    businessSub,
    metaLines = [],
    toLabel,
    toName,
    toSub,
    columns = [],
    rightAlignCols = [],
    rows = [],
    totals = [],
    note,
    signatureLines = [],
    watermark = false
  }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pw = this.PAGE_WIDTH;
    const m = this.MARGIN;
    const contentW = pw - m * 2;
    let y = m;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(20, 20, 20);
    doc.text(businessName || 'Business name', m, y);

    if (docLabel) {
      doc.setFontSize(9);
      doc.setTextColor(140);
      doc.text(docLabel.toUpperCase(), pw - m, m - 16, { align: 'right' });
      doc.setTextColor(20);
    }

    let metaY = m;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    metaLines.forEach(line => {
      doc.text(String(line), pw - m, metaY, { align: 'right' });
      metaY += 13;
    });

    if (businessSub) {
      y += 14;
      doc.setFontSize(9.5);
      doc.setTextColor(110);
      doc.text(businessSub, m, y);
    }

    y = Math.max(y, metaY) + 26;
    doc.setDrawColor(210);
    doc.line(m, y, pw - m, y);
    y += 22;

    if (toName) {
      doc.setFontSize(8.5);
      doc.setTextColor(140);
      doc.text((toLabel || 'To').toUpperCase(), m, y);
      y += 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(20);
      doc.text(toName, m, y);
      doc.setFont('helvetica', 'normal');
      if (toSub) {
        y += 13;
        doc.setFontSize(9);
        doc.setTextColor(110);
        doc.text(toSub, m, y);
      }
      y += 26;
    }

    if (columns.length) {
      const colWidths = this._colWidths(columns, contentW, rightAlignCols);

      const drawHeader = () => {
        doc.setFillColor(244, 241, 233);
        doc.rect(m, y - 12, contentW, 20, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100);
        let x = m + 6;
        columns.forEach((col, i) => {
          const align = rightAlignCols.includes(i) ? 'right' : 'left';
          doc.text(col.toUpperCase(), align === 'right' ? x + colWidths[i] - 6 : x, y, { align });
          x += colWidths[i];
        });
        y += 20;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30);
      };

      drawHeader();

      rows.forEach(row => {
        if (y > this.PAGE_HEIGHT - m - 40) {
          doc.addPage();
          y = m;
          drawHeader();
        }
        doc.setFontSize(9.5);
        let x = m + 6;
        row.forEach((cell, i) => {
          const align = rightAlignCols.includes(i) ? 'right' : 'left';
          const text = doc.splitTextToSize(String(cell), colWidths[i] - 10);
          doc.text(text, align === 'right' ? x + colWidths[i] - 12 : x, y, { align });
          x += colWidths[i];
        });
        y += 18;
        doc.setDrawColor(230);
        doc.line(m, y - 6, pw - m, y - 6);
      });
      y += 12;
    }

    if (totals.length) {
      totals.forEach(t => {
        if (y > this.PAGE_HEIGHT - m - 30) { doc.addPage(); y = m; }
        doc.setFont('helvetica', t.emphasis ? 'bold' : 'normal');
        doc.setFontSize(t.emphasis ? 12 : 10);
        doc.setTextColor(t.emphasis ? 20 : 80);
        doc.text(t.label, pw - m - 180, y);
        doc.text(String(t.value), pw - m, y, { align: 'right' });
        y += t.emphasis ? 20 : 15;
      });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(20);
      y += 8;
    }

    if (note) {
      if (y > this.PAGE_HEIGHT - m - 60) { doc.addPage(); y = m; }
      doc.setFontSize(9);
      doc.setTextColor(90);
      const lines = doc.splitTextToSize(note, contentW);
      doc.text(lines, m, y);
      y += lines.length * 12 + 12;
      doc.setTextColor(20);
    }

    if (signatureLines.length) {
      if (y > this.PAGE_HEIGHT - m - 60) { doc.addPage(); y = m; }
      y += 36;
      const colW = contentW / signatureLines.length;
      signatureLines.forEach((label, i) => {
        const x1 = m + i * colW;
        doc.setDrawColor(40);
        doc.line(x1, y, x1 + colW - 24, y);
        doc.setFontSize(8);
        doc.setTextColor(110);
        doc.text(label, x1, y + 13);
        doc.setTextColor(20);
      });
    }

    if (watermark) {
      const pageCount = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFontSize(8);
        doc.setTextColor(170);
        doc.text('Made with KoboDocs — kobodocs.com.ng', pw / 2, this.PAGE_HEIGHT - 28, { align: 'center' });
      }
      doc.setTextColor(20);
    }

    return doc;
  },

  _colWidths(columns, contentW, rightAlignCols) {
    const numCols = columns.length;
    if (numCols === 1) return [contentW];
    const narrowW = 70;
    const numNarrow = rightAlignCols.length > 0 ? rightAlignCols.filter(i => i !== 0).length : numCols - 1;
    const wideW = contentW - narrowW * numNarrow;
    return columns.map((_, i) => (rightAlignCols.includes(i) && i !== 0 ? narrowW : wideW));
  },

  // ---------- Letter-style documents (HR letters) ----------
  buildLetterPdf({ letterhead, dateLine, bodyText }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const m = 64;
    const pw = this.PAGE_WIDTH;
    let y = m;

    doc.setFont('times', 'bold');
    doc.setFontSize(15);
    doc.text(letterhead || 'Business name', m, y);
    y += 20;

    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(110);
    doc.text(dateLine || '', m, y);
    doc.setTextColor(20);
    y += 34;

    doc.setFontSize(11.5);
    const lines = doc.splitTextToSize(bodyText || '', pw - m * 2);
    lines.forEach(line => {
      if (y > this.PAGE_HEIGHT - m) { doc.addPage(); y = m; }
      doc.text(line, m, y);
      y += 17;
    });

    return doc;
  },

  // ---------- Save / share ----------
  download(filename, doc) {
    doc.save(filename);
  },

  async shareWhatsApp(filename, caption, doc) {
    const blob = doc.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });

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
