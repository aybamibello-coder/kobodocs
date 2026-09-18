// ---------- KoboDocs shared PDF export engine ----------
// Builds real, text-based PDFs directly with jsPDF (no html2canvas / no
// screenshotting). This keeps generation synchronous-feeling and fast,
// which is required for file downloads and navigator.share() to work
// reliably on mobile browsers.
//
// FONTS: jsPDF's built-in 'times'/'helvetica' do NOT contain the Naira
// sign (U+20A6) — every PDF on the site was rendering it as a broken "¦"
// glyph. Fixed by embedding the site's real brand fonts (Fraunces, Work
// Sans, Space Mono — all verified to contain U+20A6) instead. Font files
// live at /assets/fonts/ and are fetched once, lazily, on first PDF
// build, then cached in memory for the rest of the session.
//
// STYLE: buildTablePdf/buildLetterPdf take a `style` param:
//   'branded' — full masthead treatment (deep green band, gold ring
//               stamp, Fraunces title) for commercial documents the
//               user's customer receives: invoices, receipts, waybills,
//               payslips, quotations, statements.
//   'formal'  — restrained: real fonts + a single thin gold rule, no
//               colored masthead. For legal/official documents that
//               should look neutral rather than like a branded invoice:
//               wills, powers of attorney, agreements, affidavits,
//               visa letters, report cards, proof of funds, etc.
//   Default is 'formal' — the safe choice for anything not explicitly
//   marked branded.
//
// Because font loading is inherently async, buildTablePdf and
// buildLetterPdf now return Promises. Every caller must await the
// result before calling .save()/.output() on it.
window.KoboExport = {
  PAGE_WIDTH: 595.28,   // A4 in points
  PAGE_HEIGHT: 841.89,
  MARGIN: 48,

  // Brand tokens — must match assets/style.css exactly.
  COLORS: {
    inkGreenDeep: [13, 38, 32],   // #0D2620
    inkGreen: [20, 52, 43],       // #14342B
    bone: [238, 234, 224],        // #EEEAE0
    paper: [251, 250, 246],       // #FBFAF6
    charcoal: [35, 39, 34],       // #232722
    gold: [199, 154, 60],         // #C79A3C
    red: [168, 52, 42],           // #A8342A
    lineGrey: [216, 212, 200],
    mutedGrey: [140, 140, 140],
  },

  FONT_FILES: {
    'Fraunces': { normal: 'Fraunces-Regular.ttf', bold: 'Fraunces-SemiBold.ttf' },
    'WorkSans': { normal: 'WorkSans-Regular.ttf', bold: 'WorkSans-SemiBold.ttf' },
    'SpaceMono': { normal: 'SpaceMono-Regular.ttf', bold: 'SpaceMono-Bold.ttf' },
  },

  // ---------- Font loading (lazy, cached, once per page session) ----------
  async _loadFontBase64(filename) {
    if (!this._fontCache) this._fontCache = {};
    if (this._fontCache[filename]) return this._fontCache[filename];

    const res = await fetch(`/assets/fonts/${filename}`);
    if (!res.ok) throw new Error(`Could not load font ${filename} (${res.status})`);
    const buffer = await res.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    this._fontCache[filename] = base64;
    return base64;
  },

  async _registerFonts(doc) {
    for (const [family, styles] of Object.entries(this.FONT_FILES)) {
      for (const [style, filename] of Object.entries(styles)) {
        const base64 = await this._loadFontBase64(filename);
        doc.addFileToVFS(filename, base64);
        doc.addFont(filename, family, style);
      }
    }
  },

  _setColor(doc, method, rgb) {
    doc[method](rgb[0], rgb[1], rgb[2]);
  },

  // ---------- Table-style documents: invoice, receipt, quotation, payslip, waybill, budget, loan, statements ----------
  async buildTablePdf({
    style = 'formal',
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
    await this._registerFonts(doc);

    const C = this.COLORS;
    const pw = this.PAGE_WIDTH;
    const ph = this.PAGE_HEIGHT;
    const m = this.MARGIN;
    const contentW = pw - m * 2;
    let y = m;

    const branded = style === 'branded';

    if (branded) {
      // ---- "The Seal": deep green masthead + gold ring-stamp motif ----
      const bandH = 100;
      this._setColor(doc, 'setFillColor', C.inkGreenDeep);
      doc.rect(0, 0, pw, bandH, 'F');

      const stampCx = pw - m - 26, stampCy = bandH / 2, stampR = 22;
      this._setColor(doc, 'setDrawColor', C.gold);
      doc.setLineWidth(1.8);
      doc.circle(stampCx, stampCy, stampR, 'S');
      doc.setLineWidth(0.9);
      doc.circle(stampCx, stampCy, stampR * 0.55, 'S');

      this._setColor(doc, 'setTextColor', C.paper);
      doc.setFont('Fraunces', 'bold');
      doc.setFontSize(18);
      doc.text(businessName || 'Business name', m, 42);

      this._setColor(doc, 'setTextColor', C.gold);
      doc.setFont('SpaceMono', 'normal');
      doc.setFontSize(8);
      const labelLine = [docLabel ? docLabel.toUpperCase() : '', ...metaLines].filter(Boolean).join('   ·   ');
      doc.text(labelLine, m, 62);

      if (businessSub) {
        this._setColor(doc, 'setTextColor', C.bone);
        doc.setFont('WorkSans', 'normal');
        doc.setFontSize(8.5);
        doc.text(businessSub, m, 78);
      }

      y = bandH + 42;
    } else {
      // ---- "Formal": restrained, no masthead band ----
      this._setColor(doc, 'setTextColor', C.charcoal);
      doc.setFont('Fraunces', 'bold');
      doc.setFontSize(15);
      doc.text(businessName || 'Business name', m, y);

      if (docLabel) {
        this._setColor(doc, 'setTextColor', C.mutedGrey);
        doc.setFont('SpaceMono', 'normal');
        doc.setFontSize(8);
        doc.text(docLabel.toUpperCase(), pw - m, m - 16, { align: 'right' });
      }

      let metaY = m;
      this._setColor(doc, 'setTextColor', [90, 90, 90]);
      doc.setFont('WorkSans', 'normal');
      doc.setFontSize(9);
      metaLines.forEach(line => {
        doc.text(String(line), pw - m, metaY, { align: 'right' });
        metaY += 13;
      });

      if (businessSub) {
        y += 15;
        this._setColor(doc, 'setTextColor', [110, 110, 110]);
        doc.setFontSize(9.5);
        doc.text(businessSub, m, y);
      }

      y = Math.max(y, metaY) + 20;
      this._setColor(doc, 'setDrawColor', C.gold);
      doc.setLineWidth(1);
      doc.line(m, y, pw - m, y);
      y += 24;
    }

    this._setColor(doc, 'setTextColor', C.charcoal);

    if (toName) {
      this._setColor(doc, 'setTextColor', C.mutedGrey);
      doc.setFont('SpaceMono', 'normal');
      doc.setFontSize(7.5);
      doc.text((toLabel || 'To').toUpperCase(), m, y);
      y += 15;
      this._setColor(doc, 'setTextColor', C.charcoal);
      doc.setFont('WorkSans', 'bold');
      doc.setFontSize(11);
      doc.text(toName, m, y);
      doc.setFont('WorkSans', 'normal');
      if (toSub) {
        y += 13;
        this._setColor(doc, 'setTextColor', [110, 110, 110]);
        doc.setFontSize(9);
        doc.text(toSub, m, y);
      }
      y += 26;
    }

    if (columns.length) {
      const colWidths = this._colWidths(columns, contentW, rightAlignCols);

      const drawHeader = () => {
        if (branded) {
          this._setColor(doc, 'setDrawColor', C.gold);
          doc.setLineWidth(1);
          doc.line(m, y - 12, pw - m, y - 12);
        } else {
          this._setColor(doc, 'setFillColor', [244, 241, 233]);
          doc.rect(m, y - 12, contentW, 20, 'F');
        }
        doc.setFont('SpaceMono', 'normal');
        doc.setFontSize(7.5);
        this._setColor(doc, 'setTextColor', branded ? C.charcoal : [100, 100, 100]);
        let x = m + (branded ? 0 : 6);
        columns.forEach((col, i) => {
          const align = rightAlignCols.includes(i) ? 'right' : 'left';
          doc.text(col.toUpperCase(), align === 'right' ? x + colWidths[i] - (branded ? 0 : 6) : x, y, { align });
          x += colWidths[i];
        });
        y += 8;
        this._setColor(doc, 'setDrawColor', C.charcoal);
        doc.setLineWidth(0.5);
        doc.line(m, y, pw - m, y);
        y += 22;
        doc.setFont('WorkSans', 'normal');
        this._setColor(doc, 'setTextColor', C.charcoal);
      };

      drawHeader();

      rows.forEach(row => {
        if (y > ph - m - 40) {
          doc.addPage();
          y = m;
          drawHeader();
        }
        doc.setFont('WorkSans', 'normal');
        doc.setFontSize(9.5);
        this._setColor(doc, 'setTextColor', C.charcoal);
        let x = m + (branded ? 0 : 6);
        row.forEach((cell, i) => {
          const align = rightAlignCols.includes(i) ? 'right' : 'left';
          const text = doc.splitTextToSize(String(cell), colWidths[i] - 10);
          doc.text(text, align === 'right' ? x + colWidths[i] - (branded ? 0 : 12) : x, y, { align });
          x += colWidths[i];
        });
        y += 22;
        this._setColor(doc, 'setDrawColor', [230, 230, 230]);
        doc.setLineWidth(0.5);
        doc.line(m, y - 8, pw - m, y - 8);
      });
      y += 14;
    }

    if (totals.length) {
      totals.forEach(t => {
        if (y > ph - m - 30) { doc.addPage(); y = m; }
        if (t.emphasis) {
          if (branded) {
            y += 10;
            const boxW = 220, boxH = 34;
            this._setColor(doc, 'setFillColor', C.inkGreenDeep);
            if (doc.roundedRect) { doc.roundedRect(pw - m - boxW, y, boxW, boxH, 4, 4, 'F'); } else { doc.rect(pw - m - boxW, y, boxW, boxH, 'F'); }
            this._setColor(doc, 'setTextColor', C.gold);
            doc.setFont('SpaceMono', 'normal');
            doc.setFontSize(7.5);
            doc.text(String(t.label).toUpperCase(), pw - m - boxW + 12, y + 16);
            this._setColor(doc, 'setTextColor', C.paper);
            doc.setFont('Fraunces', 'bold');
            doc.setFontSize(13);
            doc.text(String(t.value), pw - m - 12, y + 28, { align: 'right' });
            y += boxH + 10;
          } else {
            this._setColor(doc, 'setTextColor', C.charcoal);
            doc.setFont('WorkSans', 'bold');
            doc.setFontSize(11.5);
            doc.text(t.label, pw - m - 180, y);
            doc.setFont('Fraunces', 'bold');
            doc.setFontSize(13);
            doc.text(String(t.value), pw - m, y, { align: 'right' });
            y += 22;
          }
        } else {
          this._setColor(doc, 'setTextColor', t.color === 'red' ? C.red : [90, 90, 90]);
          doc.setFont('WorkSans', 'normal');
          doc.setFontSize(9.5);
          doc.text(t.label, pw - m - 180, y);
          doc.setFont('SpaceMono', 'normal');
          doc.text(String(t.value), pw - m, y, { align: 'right' });
          y += 17;
        }
      });
      this._setColor(doc, 'setTextColor', C.charcoal);
      y += 8;
    }

    if (note) {
      if (y > ph - m - 60) { doc.addPage(); y = m; }
      doc.setFont('WorkSans', 'normal');
      doc.setFontSize(9);
      this._setColor(doc, 'setTextColor', [90, 90, 90]);
      const lines = doc.splitTextToSize(note, contentW);
      doc.text(lines, m, y);
      y += lines.length * 12 + 12;
      this._setColor(doc, 'setTextColor', C.charcoal);
    }

    if (signatureLines.length) {
      if (y > ph - m - 60) { doc.addPage(); y = m; }
      y += 36;
      const colW = contentW / signatureLines.length;
      signatureLines.forEach((label, i) => {
        const x1 = m + i * colW;
        this._setColor(doc, 'setDrawColor', C.charcoal);
        doc.setLineWidth(0.7);
        doc.line(x1, y, x1 + colW - 24, y);
        doc.setFont('WorkSans', 'normal');
        doc.setFontSize(8);
        this._setColor(doc, 'setTextColor', [110, 110, 110]);
        doc.text(label, x1, y + 13);
        this._setColor(doc, 'setTextColor', C.charcoal);
      });
    }

    if (watermark) {
      const pageCount = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFont('WorkSans', 'normal');
        doc.setFontSize(8);
        this._setColor(doc, 'setTextColor', [170, 170, 170]);
        doc.text('Made with KoboDocs — kobodocs.com.ng', pw / 2, ph - 28, { align: 'center' });
      }
      this._setColor(doc, 'setTextColor', C.charcoal);
    }

    return doc;
  },

  _colWidths(columns, contentW, rightAlignCols) {
    const numCols = columns.length;
    if (numCols === 1) return [contentW];
    if (rightAlignCols.length === 0) {
      // No alignment hints given — split evenly rather than assuming a
      // narrow/wide split, which pushed later columns off the page edge
      // for tables like a Will's Asset/Beneficiary/Share (3 cols, none
      // numeric-right-aligned).
      const evenW = contentW / numCols;
      return columns.map(() => evenW);
    }
    const narrowW = 70;
    const numNarrow = rightAlignCols.filter(i => i !== 0).length;
    const wideW = contentW - narrowW * numNarrow;
    return columns.map((_, i) => (rightAlignCols.includes(i) && i !== 0 ? narrowW : wideW));
  },

  // ---------- Letter-style documents (HR letters, guarantor/next-of-kin free tier, visa cover letters) ----------
  // Deliberately restrained — a letter should look formal and personal,
  // not like a branded commercial document. Real brand fonts fix the
  // Naira bug here too; a single thin gold rule is the only accent.
  async buildLetterPdf({ letterhead, dateLine, bodyText }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    await this._registerFonts(doc);

    const C = this.COLORS;
    const m = 64;
    const pw = this.PAGE_WIDTH;
    let y = m;

    this._setColor(doc, 'setTextColor', C.charcoal);
    doc.setFont('Fraunces', 'bold');
    doc.setFontSize(15);
    doc.text(letterhead || 'Business name', m, y);
    y += 12;
    this._setColor(doc, 'setDrawColor', C.gold);
    doc.setLineWidth(0.8);
    doc.line(m, y, m + 90, y);
    y += 22;

    doc.setFont('WorkSans', 'normal');
    doc.setFontSize(9.5);
    this._setColor(doc, 'setTextColor', [110, 110, 110]);
    doc.text(dateLine || '', m, y);
    this._setColor(doc, 'setTextColor', C.charcoal);
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

  // ---------- Resume/CV documents (KoboDocs Resume) ----------
  // Two templates: 'classic' (single column, formal — same restrained
  // language as buildLetterPdf) and 'modern' (two-column, a tinted sidebar
  // for contact/skills). Both templates are available to every user for
  // free at build/preview time; only the clean (non-watermarked) download
  // is gated — see resume.js for the credit/Pro check that sets `watermark`.
  async buildResumePdf({ template = 'classic', watermark = false, data = {} }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    await this._registerFonts(doc);

    if (template === 'modern') {
      this._buildResumeModern(doc, data);
    } else {
      this._buildResumeClassic(doc, data);
    }

    if (watermark) {
      const pageCount = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFont('WorkSans', 'normal');
        doc.setFontSize(8);
        this._setColor(doc, 'setTextColor', [170, 170, 170]);
        doc.text('Made with KoboDocs — kobodocs.com.ng', this.PAGE_WIDTH / 2, this.PAGE_HEIGHT - 28, { align: 'center' });
      }
    }

    return doc;
  },

  _resumeDateRange(item) {
    const start = item.start || '';
    const end = item.current ? 'Present' : (item.end || '');
    if (!start && !end) return '';
    return [start, end].filter(Boolean).join(' – ');
  },

  _buildResumeClassic(doc, data) {
    const C = this.COLORS;
    const pw = this.PAGE_WIDTH, ph = this.PAGE_HEIGHT, m = this.MARGIN;
    const contentW = pw - m * 2;
    let y = m;

    const checkBreak = (needed = 20) => {
      if (y > ph - m - needed) { doc.addPage(); y = m; }
    };
    const sectionHeader = (label) => {
      checkBreak(30);
      y += 14;
      this._setColor(doc, 'setTextColor', C.mutedGrey);
      doc.setFont('SpaceMono', 'normal');
      doc.setFontSize(8);
      doc.text(label.toUpperCase(), m, y);
      y += 6;
      this._setColor(doc, 'setDrawColor', [225, 221, 209]);
      doc.setLineWidth(0.6);
      doc.line(m, y, pw - m, y);
      y += 14;
    };

    // Header
    this._setColor(doc, 'setTextColor', C.charcoal);
    doc.setFont('Fraunces', 'bold');
    doc.setFontSize(21);
    doc.text(data.fullName || 'Your Name', m, y);
    y += 18;

    if (data.jobTitle) {
      this._setColor(doc, 'setTextColor', C.gold);
      doc.setFont('WorkSans', 'bold');
      doc.setFontSize(11.5);
      doc.text(data.jobTitle, m, y);
      y += 16;
    }

    const contactBits = [data.email, data.phone, data.location, data.linkedin, data.portfolio].filter(Boolean);
    if (contactBits.length) {
      this._setColor(doc, 'setTextColor', [110, 110, 110]);
      doc.setFont('WorkSans', 'normal');
      doc.setFontSize(9);
      doc.text(contactBits.join('   ·   '), m, y);
      y += 10;
    }

    y += 6;
    this._setColor(doc, 'setDrawColor', C.gold);
    doc.setLineWidth(1);
    doc.line(m, y, pw - m, y);

    if (data.summary) {
      sectionHeader('Summary');
      this._setColor(doc, 'setTextColor', C.charcoal);
      doc.setFont('WorkSans', 'normal');
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(data.summary, contentW);
      lines.forEach(line => { checkBreak(); doc.text(line, m, y); y += 14; });
    }

    if ((data.experience || []).length) {
      sectionHeader('Experience');
      data.experience.forEach(job => {
        checkBreak(40);
        this._setColor(doc, 'setTextColor', C.charcoal);
        doc.setFont('WorkSans', 'bold');
        doc.setFontSize(10.5);
        doc.text(job.title || '', m, y);
        const range = this._resumeDateRange(job);
        if (range) {
          this._setColor(doc, 'setTextColor', [110, 110, 110]);
          doc.setFont('SpaceMono', 'normal');
          doc.setFontSize(8.5);
          doc.text(range, pw - m, y, { align: 'right' });
        }
        y += 13;
        const companyLine = [job.company, job.location].filter(Boolean).join(' · ');
        if (companyLine) {
          this._setColor(doc, 'setTextColor', [110, 110, 110]);
          doc.setFont('WorkSans', 'normal');
          doc.setFontSize(9.5);
          doc.text(companyLine, m, y);
          y += 13;
        }
        this._setColor(doc, 'setTextColor', C.charcoal);
        doc.setFont('WorkSans', 'normal');
        doc.setFontSize(9.5);
        (job.bullets || []).forEach(bullet => {
          if (!bullet) return;
          const lines = doc.splitTextToSize('•  ' + bullet, contentW - 10);
          lines.forEach((line, i) => {
            checkBreak();
            doc.text(line, m + (i === 0 ? 0 : 12), y);
            y += 13;
          });
        });
        y += 6;
      });
    }

    if ((data.education || []).length) {
      sectionHeader('Education');
      data.education.forEach(ed => {
        checkBreak(30);
        this._setColor(doc, 'setTextColor', C.charcoal);
        doc.setFont('WorkSans', 'bold');
        doc.setFontSize(10.5);
        const degreeLine = [ed.degree, ed.field].filter(Boolean).join(', ');
        doc.text(degreeLine || ed.school || '', m, y);
        const range = this._resumeDateRange(ed);
        if (range) {
          this._setColor(doc, 'setTextColor', [110, 110, 110]);
          doc.setFont('SpaceMono', 'normal');
          doc.setFontSize(8.5);
          doc.text(range, pw - m, y, { align: 'right' });
        }
        y += 13;
        if (ed.school && degreeLine) {
          this._setColor(doc, 'setTextColor', [110, 110, 110]);
          doc.setFont('WorkSans', 'normal');
          doc.setFontSize(9.5);
          doc.text(ed.school, m, y);
          y += 13;
        }
        y += 4;
      });
    }

    if ((data.skills || []).length) {
      sectionHeader('Skills');
      this._setColor(doc, 'setTextColor', C.charcoal);
      doc.setFont('WorkSans', 'normal');
      doc.setFontSize(9.5);
      const lines = doc.splitTextToSize(data.skills.join('  ·  '), contentW);
      lines.forEach(line => { checkBreak(); doc.text(line, m, y); y += 14; });
    }

    if ((data.certifications || []).length) {
      sectionHeader('Certifications');
      this._setColor(doc, 'setTextColor', C.charcoal);
      doc.setFont('WorkSans', 'normal');
      doc.setFontSize(9.5);
      data.certifications.forEach(cert => {
        checkBreak();
        const line = [cert.name, cert.issuer, cert.year ? `(${cert.year})` : ''].filter(Boolean).join(' — ');
        doc.text(line, m, y);
        y += 14;
      });
    }

    if ((data.languages || []).length) {
      sectionHeader('Languages');
      this._setColor(doc, 'setTextColor', C.charcoal);
      doc.setFont('WorkSans', 'normal');
      doc.setFontSize(9.5);
      doc.text(data.languages.join('  ·  '), m, y);
    }
  },

  _buildResumeModern(doc, data) {
    const C = this.COLORS;
    const pw = this.PAGE_WIDTH, ph = this.PAGE_HEIGHT;
    const sidebarW = 172;
    const sideM = 26, mainM = 26;
    const mainX = sidebarW + mainM;
    const mainW = pw - mainX - 40;

    let onFirstPage = true;
    const drawSidebar = () => {
      this._setColor(doc, 'setFillColor', C.bone);
      doc.rect(0, 0, sidebarW, ph, 'F');
      this._setColor(doc, 'setFillColor', C.inkGreenDeep);
      doc.rect(0, 0, sidebarW, 6, 'F');
    };
    drawSidebar();

    let sy = 40;
    this._setColor(doc, 'setTextColor', C.inkGreenDeep);
    doc.setFont('Fraunces', 'bold');
    doc.setFontSize(16);
    const nameLines = doc.splitTextToSize(data.fullName || 'Your Name', sidebarW - sideM * 2);
    nameLines.forEach(line => { doc.text(line, sideM, sy); sy += 18; });
    if (data.jobTitle) {
      this._setColor(doc, 'setTextColor', C.gold);
      doc.setFont('WorkSans', 'bold');
      doc.setFontSize(9.5);
      const jt = doc.splitTextToSize(data.jobTitle, sidebarW - sideM * 2);
      jt.forEach(line => { sy += 13; doc.text(line, sideM, sy); });
    }
    sy += 22;

    const sideSection = (label) => {
      this._setColor(doc, 'setTextColor', C.inkGreenDeep);
      doc.setFont('SpaceMono', 'normal');
      doc.setFontSize(7.5);
      doc.text(label.toUpperCase(), sideM, sy);
      sy += 12;
    };
    const sideText = (text, size = 8.5) => {
      this._setColor(doc, 'setTextColor', [60, 70, 65]);
      doc.setFont('WorkSans', 'normal');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, sidebarW - sideM * 2);
      lines.forEach(line => { if (sy < ph - 30) { doc.text(line, sideM, sy); sy += 12; } });
      sy += 6;
    };

    const contactBits = [data.email, data.phone, data.location, data.linkedin, data.portfolio].filter(Boolean);
    if (contactBits.length) { sideSection('Contact'); contactBits.forEach(c => sideText(c)); }
    if ((data.skills || []).length) { sideSection('Skills'); sideText(data.skills.join(', ')); }
    if ((data.languages || []).length) { sideSection('Languages'); sideText(data.languages.join(', ')); }
    if ((data.certifications || []).length) {
      sideSection('Certifications');
      data.certifications.forEach(cert => sideText([cert.name, cert.year ? `(${cert.year})` : ''].filter(Boolean).join(' ')));
    }

    // Main column
    let y = 40;
    const checkBreak = (needed = 20) => {
      if (y > ph - 40 - needed) {
        doc.addPage();
        onFirstPage = false;
        y = 40;
      }
    };
    const mainHeader = (label) => {
      checkBreak(30);
      this._setColor(doc, 'setTextColor', C.charcoal);
      doc.setFont('SpaceMono', 'normal');
      doc.setFontSize(8);
      this._setColor(doc, 'setTextColor', C.mutedGrey);
      doc.text(label.toUpperCase(), mainX, y);
      y += 6;
      this._setColor(doc, 'setDrawColor', C.gold);
      doc.setLineWidth(1);
      doc.line(mainX, y, mainX + mainW, y);
      y += 16;
    };

    if (data.summary) {
      mainHeader('Summary');
      this._setColor(doc, 'setTextColor', C.charcoal);
      doc.setFont('WorkSans', 'normal');
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(data.summary, mainW);
      lines.forEach(line => { checkBreak(); doc.text(line, mainX, y); y += 14; });
    }

    if ((data.experience || []).length) {
      mainHeader('Experience');
      data.experience.forEach(job => {
        checkBreak(40);
        this._setColor(doc, 'setTextColor', C.charcoal);
        doc.setFont('WorkSans', 'bold');
        doc.setFontSize(10.5);
        doc.text(job.title || '', mainX, y);
        const range = this._resumeDateRange(job);
        if (range) {
          this._setColor(doc, 'setTextColor', [110, 110, 110]);
          doc.setFont('SpaceMono', 'normal');
          doc.setFontSize(8);
          doc.text(range, mainX + mainW, y, { align: 'right' });
        }
        y += 13;
        const companyLine = [job.company, job.location].filter(Boolean).join(' · ');
        if (companyLine) {
          this._setColor(doc, 'setTextColor', [110, 110, 110]);
          doc.setFont('WorkSans', 'normal');
          doc.setFontSize(9.5);
          doc.text(companyLine, mainX, y);
          y += 13;
        }
        this._setColor(doc, 'setTextColor', C.charcoal);
        doc.setFont('WorkSans', 'normal');
        doc.setFontSize(9.5);
        (job.bullets || []).forEach(bullet => {
          if (!bullet) return;
          const lines = doc.splitTextToSize('•  ' + bullet, mainW - 10);
          lines.forEach((line, i) => {
            checkBreak();
            doc.text(line, mainX + (i === 0 ? 0 : 12), y);
            y += 13;
          });
        });
        y += 6;
      });
    }

    if ((data.education || []).length) {
      mainHeader('Education');
      data.education.forEach(ed => {
        checkBreak(30);
        this._setColor(doc, 'setTextColor', C.charcoal);
        doc.setFont('WorkSans', 'bold');
        doc.setFontSize(10.5);
        const degreeLine = [ed.degree, ed.field].filter(Boolean).join(', ');
        doc.text(degreeLine || ed.school || '', mainX, y);
        const range = this._resumeDateRange(ed);
        if (range) {
          this._setColor(doc, 'setTextColor', [110, 110, 110]);
          doc.setFont('SpaceMono', 'normal');
          doc.setFontSize(8);
          doc.text(range, mainX + mainW, y, { align: 'right' });
        }
        y += 13;
        if (ed.school && degreeLine) {
          this._setColor(doc, 'setTextColor', [110, 110, 110]);
          doc.setFont('WorkSans', 'normal');
          doc.setFontSize(9.5);
          doc.text(ed.school, mainX, y);
          y += 13;
        }
        y += 4;
      });
    }
  },

  // ---------- Lightweight toast so downloads give visible confirmation ----------
  _showToast(message) {
    let toast = document.getElementById('koboExportToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'koboExportToast';
      toast.style.cssText = `
        position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
        background:#0D2620; color:#FBFAF6; padding:11px 20px; border-radius:8px;
        font-family:'Work Sans', system-ui, sans-serif; font-size:0.88rem;
        z-index:9999; box-shadow:0 6px 20px rgba(0,0,0,0.2); opacity:0;
        transition:opacity 0.2s ease; pointer-events:none;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2800);
  },

  // ---------- Save / share ----------
  // Both take an already-resolved jsPDF `doc` — callers must `await` the
  // async build*Pdf() call before passing its result here.
  download(filename, doc) {
    doc.save(filename);
    this._showToast(`Downloaded ${filename} — check your Downloads folder or notifications.`);
  },

  async shareWhatsApp(filename, caption, doc) {
    const blob = doc.output('blob');
    return this.shareWhatsAppBlob(filename, caption, blob);
  },

  // Same share-or-download-then-open-WhatsApp flow as shareWhatsApp, but
  // for callers that already have a raw Blob (e.g. PDF Toolkit's pdf-lib
  // output, or a signed envelope's PDF) rather than a jsPDF doc object.
  async shareWhatsAppBlob(filename, caption, blob) {
    const file = new File([blob], filename, { type: blob.type || 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: caption, title: filename });
      return 'shared';
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, '_blank');
    this._showToast(`Downloaded ${filename} — attach it in the WhatsApp chat that just opened.`);
    return 'downloaded';
  }
};
