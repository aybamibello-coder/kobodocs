// ---------- KoboDocs Pro auth (Supabase) ----------
// Loaded as a module. Exposes window.KoboAuth for use by non-module scripts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://vwmzulzluaxedkozxjfy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4HDVb8ZzRh1W-Z97m2uT1Q_4FwH6bTt';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function signUp(email, password, metadata = {}) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
      emailRedirectTo: window.location.origin + '/account/'
    }
  });
}

async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

async function signInWithMagicLink(email) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + '/account/' }
  });
}

// Real password reset — distinct from the magic link above. Sends an email
// with a recovery link; when clicked, Supabase redirects back here and fires
// a PASSWORD_RECOVERY auth event (listened for on the account page), at which
// point updatePassword() can actually set a new password.
async function resetPassword(email) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/account/'
  });
}

async function updatePassword(newPassword) {
  return supabase.auth.updateUser({ password: newPassword });
}

async function signOut() {
  return supabase.auth.signOut();
}

async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function getProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (error) return null;
  return data;
}

function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}

// Redirect helpers used by protected/Pro-only pages
async function requireAuth(redirectTo = '/account/') {
  const session = await getSession();
  if (!session) {
    window.location.href = redirectTo;
    return null;
  }
  return session;
}

async function requirePro(redirectTo = '/pricing/') {
  const profile = await getProfile();
  const active = profile && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date();
  if (!profile || !active || (profile.plan !== 'pro' && profile.plan !== 'business')) {
    window.location.href = redirectTo;
    return null;
  }
  return profile;
}

window.KoboAuth = {
  supabase,
  signUp,
  signIn,
  signInWithMagicLink,
  resetPassword,
  updatePassword,
  signOut,
  getSession,
  getProfile,
  onAuthStateChange,
  requireAuth,
  requirePro
};

// Let the page know the module has finished loading and wiring window.KoboAuth
window.dispatchEvent(new Event('kobo-auth-ready'));
