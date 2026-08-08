// ---------- Compliance Tracker ----------
const fmtDate = (isoDate) => isoDate
  ? new Date(isoDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2600);
}

function whatsappButtonsHtml(hasOwner, hasTeam) {
  if (!hasOwner && !hasTeam) return '';
  let html = '';
  if (hasOwner) html += '<button data-action="wa-owner">WhatsApp owner</button>';
  if (hasTeam) html += '<button data-action="wa-team">WhatsApp team</button>';
  return html;
}

function openWhatsapp(number, message) {
  const digits = (number || '').replace(/[^\d+]/g, '');
  window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank');
}

const OBLIGATION_LABELS = {
  vat: 'VAT', paye: 'PAYE', annual_return: 'CAC Annual Return', company_income_tax: 'Company Income Tax',
  pension: 'Pension', nsitf: 'NSITF', itf: 'ITF', nhf: 'NHF', business_permit: 'Business permit',
  nafdac: 'NAFDAC', son: 'SON', ncc: 'NCC', other: 'Other'
};

const DOC_LABELS = {
  cac_certificate: 'CAC certificate', memart: 'MEMART', tax_clearance: 'Tax clearance',
  tin_certificate: 'TIN certificate', nafdac_certificate: 'NAFDAC certificate', son_certificate: 'SON certificate',
  business_permit: 'Business permit', insurance: 'Insurance', contract: 'Contract', other: 'Other'
};

// Standard deadlines most registered Nigerian businesses face. Dates are the
// next occurrence from today for the recurring ones — users can edit/remove.
function standardObligations() {
  const now = new Date();
  const y = now.getFullYear();
  const nextMonthly = (day) => {
    const d = new Date(y, now.getMonth() + (now.getDate() > day ? 1 : 0), day);
    return d.toISOString().slice(0, 10);
  };
  return [
    { obligation_type: 'vat', title: 'VAT filing (FIRS)', due_date: nextMonthly(21), recurrence: 'monthly' },
    { obligation_type: 'paye', title: 'PAYE remittance', due_date: nextMonthly(10), recurrence: 'monthly' },
    { obligation_type: 'pension', title: 'Pension remittance', due_date: nextMonthly(7), recurrence: 'monthly' },
    { obligation_type: 'annual_return', title: 'CAC Annual Return', due_date: `${y}-12-31`, recurrence: 'annually' },
    { obligation_type: 'company_income_tax', title: 'Company Income Tax filing', due_date: `${y}-06-30`, recurrence: 'annually' },
  ];
}

(async function init() {
  const ctx = await window.BizSuiteGuard.requireAccess();
  if (!ctx) return;
  const { business, supabase } = ctx;

  // ---------- Tabs ----------
  document.querySelectorAll('.ct-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ct-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.ct-view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`view-${tab.dataset.view}`).classList.add('active');
    });
  });

  async function loadObligations() {
    const { data } = await supabase
      .from('compliance_obligations')
      .select('*')
      .eq('business_id', business.id)
      .order('due_date', { ascending: true });
    return data || [];
  }

  async function loadDocuments() {
    const { data } = await supabase
      .from('compliance_documents')
      .select('*')
      .eq('business_id', business.id)
      .order('expiry_date', { ascending: true, nullsFirst: false });
    return data || [];
  }

  function effectiveStatus(ob) {
    if (ob.status === 'completed' || ob.status === 'waived') return ob.status;
    const d = daysUntil(ob.due_date);
    return d !== null && d < 0 ? 'overdue' : 'pending';
  }

  // ---------- Dashboard ----------
  async function renderDashboard() {
    const [obligations, documents] = await Promise.all([loadObligations(), loadDocuments()]);

    const overdue = obligations.filter(o => effectiveStatus(o) === 'overdue');
    const dueSoon = obligations.filter(o => {
      const d = daysUntil(o.due_date);
      return effectiveStatus(o) === 'pending' && d !== null && d >= 0 && d <= 30;
    });
    const expiringDocs = documents.filter(d => {
      const days = daysUntil(d.expiry_date);
      return days !== null && days <= 30;
    });

    document.getElementById('statOverdue').textContent = overdue.length;
    document.getElementById('statDueSoon').textContent = dueSoon.length;
    document.getElementById('statExpiring').textContent = expiringDocs.length;

    const trackedTotal = obligations.length + documents.filter(d => d.expiry_date).length;
    const atRisk = overdue.length + documents.filter(d => (daysUntil(d.expiry_date) ?? 999) < 0).length;
    const score = trackedTotal === 0 ? null : Math.round(100 * (1 - atRisk / trackedTotal));
    const scoreEl = document.getElementById('scoreValue');
    if (score === null) {
      scoreEl.textContent = '—';
      scoreEl.className = 'score-value';
    } else {
      scoreEl.textContent = `${score}%`;
      scoreEl.className = 'score-value ' + (score >= 90 ? 'good' : score >= 60 ? 'warn' : 'bad');
    }

    const upcomingItems = [
      ...obligations
        .filter(o => effectiveStatus(o) !== 'completed' && effectiveStatus(o) !== 'waived')
        .map(o => ({ kind: 'obligation', label: OBLIGATION_LABELS[o.obligation_type] || o.title, title: o.title, date: o.due_date, status: effectiveStatus(o) })),
      ...documents
        .filter(d => d.expiry_date)
        .map(d => ({ kind: 'document', label: DOC_LABELS[d.doc_type] || d.name, title: d.name, date: d.expiry_date, status: daysUntil(d.expiry_date) < 0 ? 'overdue' : 'pending' }))
    ].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 8);

    const wrap = document.getElementById('upcomingWrap');
    if (!upcomingItems.length) {
      wrap.innerHTML = '<div class="empty-note">Nothing tracked yet — add obligations or documents to see them here.</div>';
    } else {
      wrap.innerHTML = upcomingItems.map(item => `
        <div class="ob-row">
          <div>
            <div class="ob-title">${item.title}${item.kind === 'document' ? ' <span style="opacity:.5; font-weight:400;">(renewal)</span>' : ''}</div>
            <div class="ob-meta">${item.label} · Due ${fmtDate(item.date)}</div>
          </div>
          <span class="status-tag ${item.status}">${item.status}</span>
        </div>
      `).join('');
    }

    document.getElementById('starterPanel').style.display = obligations.length ? 'none' : 'block';
  }

  document.getElementById('seedBtn').addEventListener('click', async () => {
    const rows = standardObligations().map(o => ({ ...o, business_id: business.id }));
    const { error } = await supabase.from('compliance_obligations').insert(rows);
    if (error) { toast(error.message); return; }
    toast('Standard obligations added');
    renderDashboard();
    renderObligations();
  });

  document.getElementById('ownerWhatsapp').value = business.owner_whatsapp_number || '';
  document.getElementById('teamWhatsapp').value = business.team_whatsapp_number || '';
  document.getElementById('contactsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const owner_whatsapp_number = document.getElementById('ownerWhatsapp').value.trim() || null;
    const team_whatsapp_number = document.getElementById('teamWhatsapp').value.trim() || null;
    const { error } = await supabase.from('businesses').update({ owner_whatsapp_number, team_whatsapp_number }).eq('id', business.id);
    if (error) { toast(error.message); return; }
    business.owner_whatsapp_number = owner_whatsapp_number;
    business.team_whatsapp_number = team_whatsapp_number;
    toast('WhatsApp contacts saved');
    renderObligations();
    renderVault();
  });

  // ---------- Calendar ----------
  async function renderObligations() {
    const obligations = await loadObligations();
    const wrap = document.getElementById('obligationsWrap');
    if (!obligations.length) {
      wrap.innerHTML = '<div class="empty-note">No obligations tracked yet.</div>';
      return;
    }
    wrap.innerHTML = '';
    obligations.forEach(ob => {
      const status = effectiveStatus(ob);
      const row = document.createElement('div');
      row.className = 'ob-row';
      row.innerHTML = `
        <div>
          <div class="ob-title">${ob.title}<span class="status-tag ${status}">${status}</span></div>
          <div class="ob-meta">${OBLIGATION_LABELS[ob.obligation_type] || ob.obligation_type} · Due ${fmtDate(ob.due_date)}${ob.recurrence !== 'none' ? ' · ' + ob.recurrence : ''}</div>
        </div>
        <div class="ob-actions">
          ${whatsappButtonsHtml(!!business.owner_whatsapp_number, !!business.team_whatsapp_number)}
          ${status !== 'completed' ? '<button data-action="complete">Mark done</button>' : ''}
          ${status !== 'waived' ? '<button data-action="waive">Not applicable</button>' : ''}
          <button data-action="delete">Remove</button>
        </div>
      `;
      const waMessage = `Compliance reminder from ${business.name}: "${ob.title}" (${OBLIGATION_LABELS[ob.obligation_type] || ob.obligation_type}) is due ${fmtDate(ob.due_date)}.`;
      row.querySelector('[data-action="wa-owner"]')?.addEventListener('click', async () => {
        openWhatsapp(business.owner_whatsapp_number, waMessage);
        await supabase.from('compliance_reminder_log').insert({ business_id: business.id, obligation_id: ob.id, channel: 'whatsapp', tone: 'polite' });
      });
      row.querySelector('[data-action="wa-team"]')?.addEventListener('click', async () => {
        openWhatsapp(business.team_whatsapp_number, waMessage);
        await supabase.from('compliance_reminder_log').insert({ business_id: business.id, obligation_id: ob.id, channel: 'whatsapp', tone: 'polite' });
      });
      row.querySelector('[data-action="complete"]')?.addEventListener('click', async () => {
        await supabase.from('compliance_obligations').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', ob.id);
        renderObligations(); renderDashboard();
      });
      row.querySelector('[data-action="waive"]')?.addEventListener('click', async () => {
        await supabase.from('compliance_obligations').update({ status: 'waived' }).eq('id', ob.id);
        renderObligations(); renderDashboard();
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm('Remove this obligation?')) return;
        await supabase.from('compliance_obligations').delete().eq('id', ob.id);
        renderObligations(); renderDashboard();
      });
      wrap.appendChild(row);
    });
  }

  document.getElementById('obForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('compliance_obligations').insert({
      business_id: business.id,
      obligation_type: document.getElementById('obType').value,
      title: document.getElementById('obTitle').value.trim(),
      due_date: document.getElementById('obDueDate').value,
      recurrence: document.getElementById('obRecurrence').value,
    });
    if (error) { toast(error.message); return; }
    e.target.reset();
    toast('Obligation added');
    renderObligations(); renderDashboard();
  });

  // ---------- Vault ----------
  async function renderVault() {
    const documents = await loadDocuments();
    const wrap = document.getElementById('vaultWrap');
    if (!documents.length) {
      wrap.innerHTML = '<div class="empty-note">No documents in the vault yet.</div>';
      return;
    }
    wrap.innerHTML = '';
    documents.forEach(doc => {
      const days = daysUntil(doc.expiry_date);
      let metaClass = '';
      if (days !== null && days < 0) metaClass = 'expired';
      else if (days !== null && days <= 30) metaClass = 'expiring';

      const row = document.createElement('div');
      row.className = 'vault-row';
      row.innerHTML = `
        <div>
          <div class="vault-name">${doc.name}</div>
          <div class="vault-meta ${metaClass}">${DOC_LABELS[doc.doc_type] || doc.doc_type}${doc.expiry_date ? ' · Expires ' + fmtDate(doc.expiry_date) : ' · No expiry'}</div>
        </div>
        <div class="ob-actions">
          ${doc.expiry_date ? whatsappButtonsHtml(!!business.owner_whatsapp_number, !!business.team_whatsapp_number) : ''}
          ${doc.file_path ? '<button data-action="download">View</button>' : ''}
          <button data-action="delete">Remove</button>
        </div>
      `;
      if (doc.expiry_date) {
        const waMessage = `Renewal reminder from ${business.name}: "${doc.name}" (${DOC_LABELS[doc.doc_type] || doc.doc_type}) expires ${fmtDate(doc.expiry_date)}.`;
        row.querySelector('[data-action="wa-owner"]')?.addEventListener('click', async () => {
          openWhatsapp(business.owner_whatsapp_number, waMessage);
          await supabase.from('compliance_reminder_log').insert({ business_id: business.id, compliance_document_id: doc.id, channel: 'whatsapp', tone: 'polite' });
        });
        row.querySelector('[data-action="wa-team"]')?.addEventListener('click', async () => {
          openWhatsapp(business.team_whatsapp_number, waMessage);
          await supabase.from('compliance_reminder_log').insert({ business_id: business.id, compliance_document_id: doc.id, channel: 'whatsapp', tone: 'polite' });
        });
      }
      row.querySelector('[data-action="download"]')?.addEventListener('click', async () => {
        const { data, error } = await supabase.storage.from('compliance-documents').createSignedUrl(doc.file_path, 60);
        if (error) { toast(error.message); return; }
        window.open(data.signedUrl, '_blank');
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm('Remove this document?')) return;
        if (doc.file_path) await supabase.storage.from('compliance-documents').remove([doc.file_path]);
        await supabase.from('compliance_documents').delete().eq('id', doc.id);
        renderVault(); renderDashboard();
      });
      wrap.appendChild(row);
    });
  }

  document.getElementById('docForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = document.getElementById('docFile').files[0];
    let filePath = null;

    if (file) {
      filePath = `${business.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('compliance-documents').upload(filePath, file);
      if (uploadError) { toast(uploadError.message); return; }
    }

    const { error } = await supabase.from('compliance_documents').insert({
      business_id: business.id,
      doc_type: document.getElementById('docType').value,
      name: document.getElementById('docName').value.trim(),
      expiry_date: document.getElementById('docExpiry').value || null,
      file_path: filePath,
    });
    if (error) { toast(error.message); return; }
    e.target.reset();
    toast('Document added to vault');
    renderVault(); renderDashboard();
  });

  renderDashboard();
  renderObligations();
  renderVault();
  wireAssistant(supabase, business);
  wireTeam(supabase, business, ctx.role);
})();

const ROLE_LABELS = { owner: 'Owner', staff: 'Staff', accountant: 'Accountant', lawyer: 'Lawyer', hr: 'HR', finance: 'Finance' };

function wireTeam(supabase, business, myRole) {
  const wrap = document.getElementById('teamWrap');
  const inviteForm = document.getElementById('inviteForm');
  const isOwner = myRole === 'owner';
  document.getElementById('inviteOwnerOnly').style.display = isOwner ? 'block' : 'none';

  async function renderTeam() {
    const { data: members } = await supabase
      .from('business_members')
      .select('id, user_id, role, member_email, member_name, created_at')
      .eq('business_id', business.id)
      .order('created_at', { ascending: true });

    const rows = [{ id: 'owner-row', role: 'owner', member_name: null, member_email: null, isOwnerRow: true }, ...(members || [])];
    wrap.innerHTML = '';
    rows.forEach(m => {
      const row = document.createElement('div');
      row.className = 'vault-row';
      const label = m.isOwnerRow ? (business.name + ' (you, business owner)') : (m.member_name || m.member_email || 'Team member');
      row.innerHTML = `
        <div>
          <div class="vault-name">${label}</div>
          <div class="vault-meta">${ROLE_LABELS[m.role] || m.role}${m.member_email && !m.isOwnerRow ? ' · ' + m.member_email : ''}</div>
        </div>
        ${(isOwner && !m.isOwnerRow) ? '<div class="ob-actions"><button data-action="remove">Remove</button></div>' : ''}
      `;
      row.querySelector('[data-action="remove"]')?.addEventListener('click', async () => {
        if (!confirm(`Remove ${label} from the team?`)) return;
        await supabase.from('business_members').delete().eq('id', m.id);
        renderTeam();
      });
      wrap.appendChild(row);
    });
  }

  if (isOwner) {
    inviteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('inviteEmail').value.trim();
      const role = document.getElementById('inviteRole').value;
      const { data, error } = await supabase.functions.invoke('invite-team-member', {
        body: { business_id: business.id, email, role },
      });
      if (error) { toast(error.message); return; }
      if (data?.error) { toast(data.error); return; }
      e.target.reset();
      toast(`${email} added as ${ROLE_LABELS[role]}`);
      renderTeam();
    });
  }

  renderTeam();
}

function wireAssistant(supabase, business) {
  const thread = document.getElementById('assistantThread');
  const form = document.getElementById('assistantForm');
  const input = document.getElementById('assistantQuestion');
  const submitBtn = document.getElementById('assistantSubmit');
  let hasMessages = false;

  function addMessage(who, text) {
    if (!hasMessages) { thread.innerHTML = ''; hasMessages = true; }
    const el = document.createElement('div');
    el.className = `assist-msg ${who}`;
    el.innerHTML = `<div class="who">${who === 'user' ? 'You' : 'Assistant'}</div><div class="body"></div>`;
    el.querySelector('.body').textContent = text;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question) return;

    addMessage('user', question);
    input.value = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Thinking…';

    try {
      const { data, error } = await supabase.functions.invoke('compliance-assistant', {
        body: { business_id: business.id, question },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      addMessage('assistant', data.answer);
    } catch (err) {
      addMessage('assistant', `Sorry, I couldn't answer that right now (${err.message || err}). Please try again shortly.`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Ask';
    }
  });
}
