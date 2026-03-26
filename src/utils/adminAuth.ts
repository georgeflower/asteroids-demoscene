/**
 * adminAuth.ts — Secure admin authentication utilities.
 *
 * Uses server-side session tokens (stored in React state only, never in
 * localStorage) to authenticate admin operations. The raw admin key is
 * never persisted to browser storage.
 *
 * Flow:
 *  1. Admin enters key → POST /admin-login → server validates key and issues
 *     a short-lived session token (1-hour TTL, stored in Supabase DB).
 *  2. All subsequent admin requests include the session token via the
 *     'x-admin-session' header (alongside the Supabase anon key in Authorization).
 *  3. On logout → POST /admin-logout → server invalidates the token.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const SUBMIT_URL = `${SUPABASE_URL}/functions/v1/submit`;

export interface AdminAuthResult {
  sessionToken: string;
}

export interface AdminAuthError {
  error: string;
}

/**
 * Authenticate with the admin key. Returns a short-lived session token on
 * success; throws an error on failure.
 *
 * The raw admin key is intentionally NOT stored anywhere after this call.
 */
export async function adminLogin(adminKey: string): Promise<string> {
  const res = await fetch(`${SUBMIT_URL}/admin-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ adminKey }),
  });

  if (!res.ok) {
    const body: AdminAuthError = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || "Authentication failed");
  }

  const { sessionToken }: AdminAuthResult = await res.json();
  if (!sessionToken) throw new Error("Invalid server response");
  return sessionToken;
}

/**
 * Invalidate the current admin session token on the server.
 */
export async function adminLogout(sessionToken: string): Promise<void> {
  try {
    await fetch(`${SUBMIT_URL}/admin-logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "x-admin-session": sessionToken,
      },
    });
  } catch {
    // Best-effort: the session will expire server-side anyway
  }
}

/**
 * Build headers for an authenticated admin request.
 */
export function adminHeaders(sessionToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "x-admin-session": sessionToken,
  };
}

export { SUBMIT_URL, SUPABASE_KEY };
