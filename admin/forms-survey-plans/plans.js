let supabase = null;
let lookedUpEmail = null;

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function describePlan(sub) {
  if (!sub || sub.plan === 'free') return 'Currently on Free.';
  const expiry = sub.expires_at ? ` (expires ${new Date(sub.expires_at).toLocaleDateString('en-GB')})` : ' (no expiry set)';
  return `Currently on ${sub.plan[0].toUpperCase() + sub.plan.slice(1)}, status: ${sub.status}${expiry}.`;
}

document.getElementById('lookupBtn').addEventListener('click', async () => {
  const email = document.getElementById('lookupEmail').value.trim();
  if (!email) { toast('Enter an email first.'); return; }

  const { data, error } = await supabase.rpc('admin_get_form_survey_plan', { p_email: email });
  if (error) { toast('Lookup failed: ' + error.message); return; }
  if (!data.found) { toast('No account found for that email.'); document.getElementById('planEditor').style.display = 'none'; return; }

  lookedUpEmail = email;
  document.getElementById('currentFormPlan').textContent = describePlan(data.form);
  document.getElementById('currentSurveyPlan').textContent = describePlan(data.survey);
  document.getElementById('formPlanSelect').value = data.form.plan || 'free';
  document.getElementById('surveyPlanSelect').value = data.survey.plan || 'free';
  document.getElementById('formExpiryInput').value = data.form.expires_at ? data.form.expires_at.slice(0, 10) : '';
  document.getElementById('surveyExpiryInput').value = data.survey.expires_at ? data.survey.expires_at.slice(0, 10) : '';
  document.getElementById('planEditor').style.display = 'block';
});

document.getElementById('saveFormPlanBtn').addEventListener('click', async () => {
  if (!lookedUpEmail) return;
  const plan = document.getElementById('formPlanSelect').value;
  const expiry = document.getElementById('formExpiryInput').value || null;
  const { data, error } = await supabase.rpc('admin_set_form_plan', { p_email: lookedUpEmail, p_plan: plan, p_expires_at: expiry });
  if (error || !data.success) { toast((data && data.error) || (error && error.message) || 'Could not save.'); return; }
  toast('Form plan updated.');
  document.getElementById('currentFormPlan').textContent = `Currently on ${plan[0].toUpperCase() + plan.slice(1)}, status: active${expiry ? ` (expires ${new Date(expiry).toLocaleDateString('en-GB')})` : ' (no expiry set)'}.`;
});

document.getElementById('saveSurveyPlanBtn').addEventListener('click', async () => {
  if (!lookedUpEmail) return;
  const plan = document.getElementById('surveyPlanSelect').value;
  const expiry = document.getElementById('surveyExpiryInput').value || null;
  const { data, error } = await supabase.rpc('admin_set_survey_plan', { p_email: lookedUpEmail, p_plan: plan, p_expires_at: expiry });
  if (error || !data.success) { toast((data && data.error) || (error && error.message) || 'Could not save.'); return; }
  toast('Survey plan updated.');
  document.getElementById('currentSurveyPlan').textContent = `Currently on ${plan[0].toUpperCase() + plan.slice(1)}, status: active${expiry ? ` (expires ${new Date(expiry).toLocaleDateString('en-GB')})` : ' (no expiry set)'}.`;
});

(async () => {
  await new Promise(r => {
    if (window.KoboAuth) return r();
    window.addEventListener('kobo-auth-ready', r, { once: true });
  });
  const session = await window.KoboAuth.getSession();
  if (!session) {
    window.location.href = '/account/?redirect=' + encodeURIComponent(window.location.pathname);
    return;
  }
  supabase = window.KoboAuth.supabase;

  // A single RPC call both authorizes (throws 'not authorized' for non-admins)
  // and confirms access — same pattern as the main admin dashboard guard.
  const { error } = await supabase.rpc('admin_get_form_survey_plan', { p_email: session.user.email });
  document.getElementById('adminLoading').style.display = 'none';
  if (error && error.message === 'not authorized') {
    document.getElementById('adminDenied').style.display = 'block';
    return;
  }
  document.getElementById('adminContent').style.display = 'block';
})();
