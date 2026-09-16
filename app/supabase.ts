import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
export const SUPABASE_AUTH_OPTIONS = Object.freeze({
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  flowType: "pkce" as const,
  storageKey: "orionix-lucy-auth",
});
export const FUTURE_AUTH_CAPABILITIES = Object.freeze({
  passkeys: false,
  webauthn: false,
  deviceBiometrics: false,
});

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: SUPABASE_AUTH_OPTIONS,
});

let restorePromise: ReturnType<typeof supabase.auth.getSession> | undefined;
export function restoreStoredSession() {
  restorePromise ??= supabase.auth.getSession();
  return restorePromise;
}
