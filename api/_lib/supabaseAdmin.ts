import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Service-role client for Vercel serverless functions ONLY - never imported from src/ (the browser
// bundle). SUPABASE_SERVICE_ROLE_KEY is a Vercel-only environment variable, deliberately not prefixed
// VITE_, so Vite never inlines it into client code. The project URL isn't secret, so it's fine to reuse
// the same VITE_-prefixed value the browser already uses.
let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for server functions');
  }
  cached = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return cached;
}

/**
 * A client scoped to the CALLER's own already-verified session token, using the public anon key - RPC
 * calls made with this respect RLS and see `auth.uid()` as that real user, exactly as if the browser had
 * called them directly. Used for `submit_round_action` so the RPC's own auth.uid()-based membership/side
 * derivation applies unchanged, without this server needing to re-derive or pass along a side itself.
 */
export function supabaseAsUser(bearerToken: string): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set for server functions');
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
  });
}
