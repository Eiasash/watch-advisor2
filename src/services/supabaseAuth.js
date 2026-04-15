import { supabase } from "./supabaseClient.js";

/**
 * Sign in with GitHub OAuth via Supabase.
 *
 * Prerequisites (Supabase Dashboard):
 *   1. Go to Authentication > Providers > GitHub
 *   2. Enable GitHub provider and add your OAuth App credentials
 *   3. Set callback URL to: <your-supabase-url>/auth/v1/callback
 */
export async function signInWithGitHub() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser() {
  const session = await getSession();
  return session?.user ?? null;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
