// The session cookie. Edge-safe (WebCrypto only), so the middleware and the
// sign-in route share one implementation.
//
// There is no database in this app to keep session rows in, so the cookie
// carries a random token, a fixed expiry and an HMAC over both. The HMAC key
// is derived from APP_PIN_HASH, which means:
// - nobody without the server env var can mint a session; and
// - changing the PIN signs out every device at once.
// The cookie is httpOnly, Secure (in production) and SameSite=Lax.
export const SESSION_COOKIE = 'ats_session';
export const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60; // seconds

const VERSION = 'v1';
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function keyFrom(pinHash: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest('SHA-256', enc.encode(`ai-telesuite-session-${VERSION}\n${pinHash}`));
  return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** The server secret the session is bound to, or null when sign-in is not set up. */
export function sessionSecret(): string | null {
  const v = process.env.APP_PIN_HASH;
  return v && v.trim() ? v.trim() : null;
}

export async function createSessionToken(secret: string, nowMs: number = Date.now()): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + SESSION_MAX_AGE;
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const body = `${VERSION}.${exp}.${nonce}`;
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await keyFrom(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySessionToken(token: string | undefined | null, secret: string | null, nowMs: number = Date.now()): Promise<boolean> {
  if (!token || !secret || token.length > 200) return false;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION || !/^\d{1,12}$/.test(parts[1])) return false;
  const exp = Number(parts[1]);
  if (exp * 1000 <= nowMs) return false;
  const sig = fromB64url(parts[3]);
  // Canonical encoding only, so one signature has exactly one spelling.
  if (!sig || sig.length !== 32 || b64url(sig) !== parts[3]) return false;
  // crypto.subtle.verify compares in constant time.
  return crypto.subtle.verify('HMAC', await keyFrom(secret), sig, enc.encode(parts.slice(0, 3).join('.')));
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}
