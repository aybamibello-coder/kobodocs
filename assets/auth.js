// ---------- KoboDocs Pro auth (Supabase) ----------
// Loaded as a module. Exposes window.KoboAuth for use by non-module scripts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://vwmzulzluaxedkozxjfy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4HDVb8ZzRh1W-Z97m2uT1Q_4FwH6bTt';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function signUp(email, password) {
  return supabase.auth.signUp({ email, password });
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
  if (!profile || profile.plan !== 'pro') {
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
  signOut,
  getSession,
  getProfile,
  onAuthStateChange,
  requireAuth,
  requirePro
};

// Let the page know the module has finished loading and wiring window.KoboAuth
window.dispatchEvent(new Event('kobo-auth-ready'));
