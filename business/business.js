const FUNCTIONS_URL = 'https://vwmzulzluaxedkozxjfy.supabase.co/functions/v1';

function getBusinessId() {
  return new URLSearchParams(window.location.search).get('id');
}

let business = null;
let session = null;
let myRole = null;

(async function init() {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });

  session = await window.KoboAuth.getSession();
  const businessId = getBusinessId();
  if (!session || !businessId) {
    window.location.href = '/account/';
    return;
  }

  const { data, error } = await window.KoboAuth.supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .maybeSingle();

  if (error || !data) {
    document.getElementById('loadError').classList.remove('hidden');
    document.getElementById('loadError').textContent = 'Business not found, or you don\'t have access to it.';
    return;
  }

  business = data;

  const { data: memberRow } = await window.KoboAuth.supabase
    .from('business_members')
    .select('role')
    .eq('business_id', business.id)
    .eq('user_id', session.user.id)
    .maybeSingle();
  myRole = memberRow ? memberRow.role : (business.owner_user_id === session.user.id ? 'owner' : 'staff');

  document.getElementById('businessContent').classList.remove('hidden');
  renderHeader();
  await renderMembers();
})();

function renderHeader() {
  document.getElementById('businessName').textContent = business.name;
  document.getElementById('myRole').textContent = myRole;

  if (business.brand_logo_url) {
    document.getElementById('brandLogoPreview').innerHTML = `<img src="${business.brand_logo_url}" alt="Logo">`;
  }
  if (business.brand_color) {
    document.getElementById('brandColorInput').value = business.brand_color;
  }

  // Only the owner can manage team members and branding — staff can view but not change these.
  if (myRole !== 'owner') {
    document.getElementById('brandingPanel').querySelectorAll('input, button').forEach(el => el.disabled = true);
    document.getElementById('addMemberBtn').disabled = true;
  }
}

// ---------- Branding ----------
document.getElementById('brandLogoInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('brandLogoPreview').innerHTML = `<img src="${reader.result}" alt="Logo preview">`;
  };
  reader.readAsDataURL(file);
});

document.getElementById('saveBrandingBtn').addEventListener('click', async () => {
  const btn = document.getElementById('saveBrandingBtn');
  const msg = document.getElementById('brandingMsg');
  const originalText = btn.textContent;
  btn.textContent = 'Saving…';
  btn.disabled = true;

  try {
    const updates = { brand_color: document.getElementById('brandColorInput').value, updated_at: new Date().toISOString() };
    const file = document.getElementById('brandLogoInput').files[0];

    if (file) {
      const ext = file.name.split('.').pop();
      const path = `${session.user.id}/business-${business.id}-logo.${ext}`;
      const { error: uploadError } = await window.KoboAuth.supabase.storage
        .from('brand-logos')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = window.KoboAuth.supabase.storage.from('brand-logos').getPublicUrl(path);
      updates.brand_logo_url = urlData.publicUrl;
    }

    const { error } = await window.KoboAuth.supabase.from('businesses').update(updates).eq('id', business.id);
    if (error) throw error;

    msg.className = 'auth-msg success';
    msg.textContent = 'Branding saved.';
  } catch (err) {
    msg.className = 'auth-msg error';
    msg.textContent = 'Could not save branding: ' + err.message;
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

// ---------- Team members ----------
async function renderMembers() {
  const { data } = await window.KoboAuth.supabase
    .from('business_members')
    .select('role, user_id')
    .eq('business_id', business.id);

  const listEl = document.getElementById('memberList');
  listEl.innerHTML = (data || []).map(m => `
    <div class="member-row">
      <span>${m.user_id === session.user.id ? 'You' : m.user_id}</span>
      <span class="role-tag ${m.role === 'owner' ? 'owner' : ''}">${m.role}</span>
    </div>
  `).join('') || '<p style="opacity:0.6; font-size:0.9rem;">No members yet.</p>';
}

document.getElementById('addMemberBtn').addEventListener('click', async () => {
  const btn = document.getElementById('addMemberBtn');
  const msg = document.getElementById('memberMsg');
  const email = document.getElementById('newMemberEmail').value.trim();
  if (!email) {
    msg.className = 'auth-msg error';
    msg.textContent = 'Enter an email.';
    return;
  }

  const originalText = btn.textContent;
  btn.textContent = 'Adding…';
  btn.disabled = true;

  try {
    const res = await fetch(`${FUNCTIONS_URL}/add-business-member`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ business_id: business.id, email })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Could not add team member');

    msg.className = 'auth-msg success';
    msg.textContent = 'Team member added.';
    document.getElementById('newMemberEmail').value = '';
    await renderMembers();
  } catch (err) {
    msg.className = 'auth-msg error';
    msg.textContent = err.message;
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});
