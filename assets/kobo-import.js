// ---------- KoboDocs shared data import ----------
// Import clients + receivables from a CSV or Excel file exported from
// another platform. Writes directly into the same `clients` and
// `receivables` tables every dashboard/aging report/DSO chart already
// reads from — there's no separate sync step, imported data is just
// part of the same database immediately.
//
// Usage: window.KoboImport.open({ supabase, business, onComplete })

(function () {
  const FIELD_DEFS = [
    { key: 'name', label: 'Client name', required: true },
    { key: 'email', label: 'Email', required: false },
    { key: 'phone', label: 'Phone', required: false },
    { key: 'amount', label: 'Amount owed (₦)', required: false },
    { key: 'due_date', label: 'Due date', required: false },
    { key: 'description', label: 'Description / notes', required: false },
  ];

  let state = null;

  function ensureLibs() {
    return new Promise((resolve) => {
      const need = [];
      if (!window.Papa) need.push('https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js');
      if (!window.XLSX) need.push('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
      if (!need.length) return resolve();
      let remaining = need.length;
      need.forEach((src) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => { remaining--; if (remaining === 0) resolve(); };
        document.head.appendChild(s);
      });
    });
  }

  function injectStyles() {
    if (document.getElementById('kobo-import-styles')) return;
    const style = document.createElement('style');
    style.id = 'kobo-import-styles';
    style.textContent = `
      .ki-overlay{ position:fixed; inset:0; background:rgba(20,26,20,0.6); z-index:9000; display:flex; align-items:center; justify-content:center; padding:20px; }
      .ki-modal{ background:var(--paper, #fdfbf6); border-radius:10px; max-width:720px; width:100%; max-height:88vh; overflow-y:auto; padding:28px; font-family:'Work Sans', sans-serif; }
      .ki-modal h2{ font-family:'Fraunces', serif; font-size:1.25rem; margin-bottom:6px; }
      .ki-modal .ki-sub{ font-size:0.85rem; opacity:0.65; margin-bottom:20px; }
      .ki-close{ float:right; background:none; border:none; font-size:1.3rem; cursor:pointer; opacity:0.5; }
      .ki-dropzone{ border:2px dashed var(--line, #ccc); border-radius:8px; padding:36px 20px; text-align:center; cursor:pointer; margin-bottom:16px; }
      .ki-dropzone:hover{ border-color:var(--ink-green-deep, #14342b); }
      .ki-dropzone input{ display:none; }
      .ki-map-row{ display:grid; grid-template-columns:1fr 1fr; gap:10px; align-items:center; margin-bottom:8px; }
      .ki-map-row label{ font-size:0.82rem; opacity:0.75; }
      .ki-map-row select{ padding:7px 8px; border:1px solid var(--line, #ccc); border-radius:6px; font-family:inherit; font-size:0.85rem; }
      .ki-table{ width:100%; border-collapse:collapse; font-size:0.78rem; margin:14px 0; }
      .ki-table th, .ki-table td{ padding:6px 8px; border-bottom:1px solid var(--line, #eee); text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px; }
      .ki-table .ki-bad{ color:#b23; }
      .ki-summary{ background:rgba(199,154,60,0.1); border:1px solid rgba(199,154,60,0.3); border-radius:8px; padding:14px 16px; font-size:0.88rem; margin:16px 0; }
      .ki-actions{ display:flex; gap:10px; margin-top:20px; justify-content:flex-end; }
      .ki-btn{ font-size:0.88rem; border:1px solid var(--line, #ccc); background:none; border-radius:20px; padding:9px 20px; cursor:pointer; }
      .ki-btn.primary{ background:var(--ink-green-deep, #14342b); color:var(--paper, #fdfbf6); border-color:var(--ink-green-deep, #14342b); }
      .ki-btn:disabled{ opacity:0.5; cursor:not-allowed; }
      .ki-progress{ text-align:center; padding:30px 0; }
    `;
    document.head.appendChild(style);
  }

  function closeModal() {
    const el = document.getElementById('ki-overlay');
    if (el) el.remove();
    state = null;
  }

  function renderModal(innerHtml) {
    let overlay = document.getElementById('ki-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ki-overlay';
      overlay.className = 'ki-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="ki-modal"><button class="ki-close" id="ki-close-btn">&times;</button>${innerHtml}</div>`;
    document.getElementById('ki-close-btn').addEventListener('click', closeModal);
  }

  function parseCsvText(text) {
    const result = window.Papa.parse(text, { header: false, skipEmptyLines: true });
    return result.data;
  }

  function parseFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const isCsv = /\.csv$/i.test(file.name);
      reader.onload = (e) => {
        try {
          let rows;
          if (isCsv) {
            rows = parseCsvText(e.target.result);
          } else {
            const wb = window.XLSX.read(e.target.result, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
          }
          rows = rows.filter(r => r.some(c => String(c).trim() !== ''));
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      if (isCsv) reader.readAsText(file);
      else reader.readAsArrayBuffer(file);
    });
  }

  // Best-effort guess at which column maps to which field, based on header text.
  function guessMapping(headers) {
    const map = {};
    const lower = headers.map(h => String(h).toLowerCase());
    const tryMatch = (patterns) => {
      for (const p of patterns) {
        const idx = lower.findIndex(h => h.includes(p));
        if (idx !== -1) return idx;
      }
      return -1;
    };
    map.name = tryMatch(['client', 'customer', 'name']);
    map.email = tryMatch(['email']);
    map.phone = tryMatch(['phone', 'mobile', 'tel']);
    map.amount = tryMatch(['amount', 'balance', 'owed', 'total']);
    map.due_date = tryMatch(['due', 'date']);
    map.description = tryMatch(['description', 'note', 'memo', 'detail']);
    return map;
  }

  function parseAmount(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(String(v).replace(/[₦,\s]/g, ''));
    return isNaN(n) ? null : n;
  }

  function parseDate(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }

  function renderMappingStep(headers, rows) {
    const guess = guessMapping(headers);
    const options = (selectedIdx) => {
      let html = `<option value="-1">— Not in this file —</option>`;
      headers.forEach((h, i) => {
        html += `<option value="${i}" ${i === selectedIdx ? 'selected' : ''}>${h || `Column ${i + 1}`}</option>`;
      });
      return html;
    };

    const rowsHtml = FIELD_DEFS.map(f => `
      <div class="ki-map-row">
        <label>${f.label}${f.required ? ' *' : ''}</label>
        <select id="ki-map-${f.key}">${options(guess[f.key])}</select>
      </div>
    `).join('');

    renderModal(`
      <h2>Import from spreadsheet</h2>
      <p class="ki-sub">Found ${rows.length} row(s) with ${headers.length} column(s). Match each field below to a column in your file.</p>
      ${rowsHtml}
      <div class="ki-actions">
        <button class="ki-btn" id="ki-back-btn">Back</button>
        <button class="ki-btn primary" id="ki-preview-btn">Preview import</button>
      </div>
    `);

    document.getElementById('ki-back-btn').addEventListener('click', () => renderUploadStep());
    document.getElementById('ki-preview-btn').addEventListener('click', () => {
      const mapping = {};
      FIELD_DEFS.forEach(f => {
        const val = Number(document.getElementById(`ki-map-${f.key}`).value);
        mapping[f.key] = val;
      });
      if (mapping.name === -1) {
        alert('Client name must be mapped to a column to continue.');
        return;
      }
      buildAndPreview(headers, rows, mapping);
    });
  }

  async function buildAndPreview(headers, rows, mapping) {
    const parsed = rows.map((r) => {
      const get = (idx) => (idx >= 0 && idx < r.length ? String(r[idx]).trim() : '');
      const name = get(mapping.name);
      const amount = mapping.amount >= 0 ? parseAmount(get(mapping.amount)) : null;
      const due_date = mapping.due_date >= 0 ? parseDate(get(mapping.due_date)) : null;
      return {
        name,
        email: mapping.email >= 0 ? get(mapping.email) : '',
        phone: mapping.phone >= 0 ? get(mapping.phone) : '',
        amount,
        amount_raw: mapping.amount >= 0 ? get(mapping.amount) : '',
        due_date,
        description: mapping.description >= 0 ? get(mapping.description) : '',
        valid: !!name,
      };
    });

    // Duplicate check against existing clients (case-insensitive name match)
    const { data: existingClients } = await state.supabase
      .from('clients')
      .select('id, name, email')
      .eq('business_id', state.business.id);
    const existingNames = new Set((existingClients || []).map(c => c.name.toLowerCase().trim()));

    const validRows = parsed.filter(r => r.valid);
    const invalidCount = parsed.length - validRows.length;
    const dupeCount = validRows.filter(r => existingNames.has(r.name.toLowerCase().trim())).length;
    const newClientCount = validRows.length - dupeCount;
    const withAmountCount = validRows.filter(r => r.amount !== null && r.amount > 0).length;

    state.parsedRows = validRows;
    state.existingClients = existingClients || [];

    const previewRows = parsed.slice(0, 12);
    const tableHtml = `
      <table class="ki-table">
        <tr><th>Name</th><th>Email</th><th>Amount</th><th>Due date</th></tr>
        ${previewRows.map(r => `
          <tr class="${!r.valid ? 'ki-bad' : ''}">
            <td>${r.name || '(missing)'}</td>
            <td>${r.email || '—'}</td>
            <td>${r.amount_raw ? (r.amount !== null ? '₦' + r.amount.toLocaleString('en-NG') : r.amount_raw + ' (unreadable)') : '—'}</td>
            <td>${r.due_date || (mapping.due_date >= 0 ? '(unreadable date)' : '—')}</td>
          </tr>
        `).join('')}
      </table>
      ${parsed.length > 12 ? `<p style="font-size:0.78rem; opacity:0.6;">+ ${parsed.length - 12} more row(s) not shown</p>` : ''}
    `;

    renderModal(`
      <h2>Preview import</h2>
      <div class="ki-summary">
        <strong>${newClientCount}</strong> new client(s) will be created.
        ${dupeCount ? `<br><strong>${dupeCount}</strong> row(s) match an existing client by name — these will be linked to the existing client, not duplicated.` : ''}
        ${withAmountCount ? `<br><strong>${withAmountCount}</strong> row(s) have an amount and will also create a receivable (outstanding balance).` : ''}
        ${invalidCount ? `<br><span style="color:#b23;"><strong>${invalidCount}</strong> row(s) skipped — missing a client name.</span>` : ''}
      </div>
      ${tableHtml}
      <div class="ki-actions">
        <button class="ki-btn" id="ki-back-btn">Back</button>
        <button class="ki-btn primary" id="ki-commit-btn" ${validRows.length === 0 ? 'disabled' : ''}>Import ${validRows.length} row(s)</button>
      </div>
    `);

    document.getElementById('ki-back-btn').addEventListener('click', () => renderMappingStep(headers, rows));
    document.getElementById('ki-commit-btn').addEventListener('click', commitImport);
  }

  async function commitImport() {
    renderModal(`<div class="ki-progress"><h2>Importing…</h2><p class="ki-sub">Please don't close this window.</p></div>`);

    const { supabase, business } = state;
    const rows = state.parsedRows;
    const existingByName = new Map(state.existingClients.map(c => [c.name.toLowerCase().trim(), c]));

    let clientsCreated = 0, receivablesCreated = 0, errors = 0;

    for (const row of rows) {
      try {
        let clientId;
        const existing = existingByName.get(row.name.toLowerCase().trim());
        if (existing) {
          clientId = existing.id;
        } else {
          const { data: newClient, error } = await supabase
            .from('clients')
            .insert({
              user_id: business.owner_user_id || (await supabase.auth.getUser()).data.user.id,
              business_id: business.id,
              name: row.name,
              email: row.email || null,
              phone: row.phone || null,
            })
            .select('id')
            .single();
          if (error || !newClient) { errors++; continue; }
          clientId = newClient.id;
          existingByName.set(row.name.toLowerCase().trim(), { id: clientId, name: row.name });
          clientsCreated++;
        }

        if (row.amount !== null && row.amount > 0) {
          const { error: recvErr } = await supabase.from('receivables').insert({
            business_id: business.id,
            client_id: clientId,
            description: row.description || null,
            amount: row.amount,
            amount_paid: 0,
            due_date: row.due_date || null,
            payment_status: 'unpaid',
            source: 'csv_import',
          });
          if (!recvErr) receivablesCreated++;
        }
      } catch (e) {
        errors++;
      }
    }

    renderModal(`
      <h2>Import complete</h2>
      <div class="ki-summary">
        <strong>${clientsCreated}</strong> new client(s) created.<br>
        <strong>${receivablesCreated}</strong> receivable(s) created.
        ${errors ? `<br><span style="color:#b23;"><strong>${errors}</strong> row(s) failed to import.</span>` : ''}
      </div>
      <p class="ki-sub">This is already reflected in your dashboard and aging report — no further steps needed.</p>
      <div class="ki-actions">
        <button class="ki-btn primary" id="ki-done-btn">Done</button>
      </div>
    `);
    document.getElementById('ki-done-btn').addEventListener('click', () => {
      closeModal();
      if (typeof state?.onComplete === 'function') state.onComplete();
      if (typeof window.__kiOnComplete === 'function') window.__kiOnComplete();
    });
  }

  function renderUploadStep() {
    renderModal(`
      <h2>Import from spreadsheet</h2>
      <p class="ki-sub">Bring in clients and outstanding balances from QuickBooks, Wave, Excel, or any other platform's CSV/Excel export.</p>
      <label class="ki-dropzone" id="ki-dropzone">
        <div>Click to choose a .csv, .xlsx, or .xls file</div>
        <input type="file" id="ki-file-input" accept=".csv,.xlsx,.xls">
      </label>
      <p class="ki-sub" style="margin-bottom:0;">Your file needs at least a client name column. Amount, due date, email, and phone are optional — map them on the next step.</p>
    `);

    document.getElementById('ki-file-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      renderModal(`<div class="ki-progress"><h2>Reading file…</h2></div>`);
      try {
        const rows = await parseFile(file);
        if (rows.length < 2) {
          alert('Could not find any data rows in this file.');
          renderUploadStep();
          return;
        }
        const headers = rows[0].map(h => String(h).trim());
        renderMappingStep(headers, rows.slice(1));
      } catch (err) {
        alert('Could not read this file: ' + err.message);
        renderUploadStep();
      }
    });
  }

  window.KoboImport = {
    async open({ supabase, business, onComplete }) {
      state = { supabase, business, onComplete };
      injectStyles();
      await ensureLibs();
      renderUploadStep();
    }
  };
})();
