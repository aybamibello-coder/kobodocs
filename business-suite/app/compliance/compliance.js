// ---------- CAC Compliance settings ----------
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2600);
}

function directorRow(d = { name: '', former_name: '', nationality: '' }) {
  const row = document.createElement('div');
  row.className = 'director-row';
  row.innerHTML = `
    <input placeholder="Director's full name" class="d-name" value="${d.name || ''}">
    <input placeholder="Former name (if any)" class="d-former" value="${d.former_name || ''}">
    <input placeholder="Nationality (if not Nigerian)" class="d-nat" value="${d.nationality || ''}">
    <button type="button" class="btn small remove-director">✕</button>
  `;
  row.querySelector('.remove-director').addEventListener('click', () => row.remove());
  return row;
}

async function renderForm(ctx) {
  const area = document.getElementById('mainArea');
  const directors = Array.isArray(ctx.business.cac_directors) ? ctx.business.cac_directors : [];

  area.innerHTML = `
    <div class="bs-panel">
      <form id="ccForm" class="cc-form">
        <label>Registered company name (as on your CAC certificate)</label>
        <input id="ccName" value="${ctx.business.name || ''}">
        <label>RC number</label>
        <input id="ccRc" placeholder="e.g. RC1234567" value="${ctx.business.rc_number || ''}">
        <label style="margin-top:10px;">Directors</label>
        <div id="directorsList"></div>
        <button type="button" class="btn small" id="addDirectorBtn" style="margin:8px 0 18px;">+ Add director</button>
        <br>
        <button class="btn primary" type="submit">Save</button>
      </form>
    </div>
  `;

  const list = document.getElementById('directorsList');
  if (directors.length) {
    directors.forEach(d => list.appendChild(directorRow(d)));
  } else {
    list.appendChild(directorRow());
  }
  document.getElementById('addDirectorBtn').addEventListener('click', () => list.appendChild(directorRow()));

  document.getElementById('ccForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cacDirectors = Array.from(list.querySelectorAll('.director-row'))
      .map(row => ({
        name: row.querySelector('.d-name').value.trim(),
        former_name: row.querySelector('.d-former').value.trim(),
        nationality: row.querySelector('.d-nat').value.trim(),
      }))
      .filter(d => d.name);

    const { error } = await ctx.supabase
      .from('businesses')
      .update({
        name: document.getElementById('ccName').value.trim() || ctx.business.name,
        rc_number: document.getElementById('ccRc').value.trim() || null,
        cac_directors: cacDirectors,
      })
      .eq('id', ctx.business.id);

    if (error) { toast(error.message); return; }
    toast('Saved — this now appears on your invoices, quotations, and letters');
  });
}

(async function init() {
  const ctx = await window.BizSuiteGuard.requireAccess();
  if (!ctx) return;
  renderForm(ctx);
})();
