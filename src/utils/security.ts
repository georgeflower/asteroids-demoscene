/**
 * Security utilities for anti-cheat and cryptographic verification.
 * Provides HMAC signature generation, value obfuscation, and integrity checks.
 *
 * Security note: Because `VITE_SCORE_HMAC_SECRET` is embedded in the client
 * bundle at build time (Vite's VITE_ prefix convention), a determined attacker
 * can extract the secret by inspecting the compiled JavaScript. This is an
 * acknowledged limitation of any shared-secret scheme where the client must
 * know the secret. The HMAC layer provides defense-in-depth against casual
 * tampering; the primary security guarantee is the server-side validation
 * (session tokens, score plausibility, rate limiting, database policies).
 */

const _XK = 0x5a4d_3b2e;

/**
 * Generate an HMAC-SHA256 signature from submission data using the Web Crypto API.
 * The message format is: `${sessionToken}:${score}:${initials}:${level}:${timestamp}`
 */
export async function generateSignature(
  sessionToken: string,
  score: number,
  initials: string,
  level: number,
  timestamp: number,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const message = `${sessionToken}:${score}:${initials}:${level}:${timestamp}`;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Encode a numeric value with a simple XOR mask to make it harder to spot in memory dumps.
 */
export function obfuscateValue(value: number): string {
  const masked = (value ^ _XK) >>> 0;
  return btoa(masked.toString(36));
}

/**
 * Decode a value encoded by obfuscateValue.
 */
export function deobfuscateValue(encoded: string): number {
  const masked = parseInt(atob(encoded), 36);
  return (masked ^ _XK) >>> 0;
}

/**
 * Basic integrity checks to detect common tampering techniques:
 * - Overridden native timing functions (used to spoof elapsed time)
 * - Overridden Date.now (used to manipulate timestamps)
 *
 * Returns true when the environment appears unmodified.
 *
 * Limitation: a sophisticated attacker can spoof these checks by overriding
 * `Function.prototype.toString` or using Proxy objects. This check serves as a
 * basic deterrent against casual tampering, not a cryptographic guarantee.
 */
export function checkIntegrity(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (typeof performance?.now !== 'function') return false;
    if (!performance.now.toString().includes('[native code]')) return false;
    if (!Date.now.toString().includes('[native code]')) return false;
    if (!JSON.stringify.toString().includes('[native code]')) return false;
  } catch {
    return false;
  }
  return true;
}
