import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

// Browser-side client. Only ever uses the PUBLIC anon key (VITE_-prefixed, safe to ship) - never a
// service-role secret. Friendly Battle's only identity mechanism: an anonymous Supabase auth session,
// persisted by supabase-js itself in localStorage, so a returning visit to this browser keeps the same
// player id without any account/registration UI (see docs/FRIENDLY-BATTLE.md).
let client: SupabaseClient | null = null;

export function isFriendlyConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see .env.example) to use Friendly Battle');
  }
  client = createClient(url, anonKey);
  return client;
}

/** Signs in anonymously once per browser; a returning session is reused automatically by supabase-js. */
export async function ensureAnonymousSession(): Promise<Session> {
  const { data } = await supabase().auth.getSession();
  if (data.session) return data.session;

  const { data: signedIn, error } = await supabase().auth.signInAnonymously();
  if (error || !signedIn.session) throw new Error(error?.message ?? 'Failed to start an anonymous session');
  return signedIn.session;
}

export async function currentAccessToken(): Promise<string> {
  const session = await ensureAnonymousSession();
  return session.access_token;
}
