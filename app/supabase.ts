import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ?? "https://svzgnsyjqywckdvdlzsl.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? "sb_publishable_HGyJQLaomek4W7W9-JN36g_MfUY85pM";
export const SUPABASE_AUTH_OPTIONS = Object.freeze({
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  flowType: "pkce" as const,
  storageKey: "orionix-lucy-auth",
});
export const FUTURE_AUTH_CAPABILITIES = Object.freeze({
  passkeys: true,
  webauthn: true,
  deviceBiometrics: true,
});

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: SUPABASE_AUTH_OPTIONS,
});

export async function restoreStoredSession() {
  const current = await supabase.auth.getSession();
  if (current.error || !current.data.session) return current;
  const expiresAt = current.data.session.expires_at ?? 0;
  if (expiresAt * 1000 - Date.now() < 90_000) {
    return supabase.auth.refreshSession(current.data.session);
  }
  return current;
}
