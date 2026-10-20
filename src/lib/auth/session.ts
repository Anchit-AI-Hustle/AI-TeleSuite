// The session cookie. Edge-safe (WebCrypto only), so the middleware and the
// sign-in route share one implementation.
//
// Session rows are not kept: the cookie carries WHO is signed in, when it
// expires, a random nonce and an HMAC over all three. The key is derived from
// a server secret, so nobody without that env var can mint a session.
//
// The cookie is httpOnly, Secure (in production) and SameSite=Lax.
//
// v1 carried no user id, because there was one owner and nothing to name. Now
// that each mobile number is its own account, a session has to say which one,
// or every signed-in request would be indistinguishable from every other. v1
// tokens are rejected rather than upgraded: anyone holding one signs in again
// once, which is the right trade for not carrying a second format forever.
export const SESSION_COOKIE = 'ats_session';
export const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60; // seconds

const VERSION = 'v2';
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

/**
 * The server secret the session is bound to, or null when sign-in is not set
 * up. SESSION_SECRET is the one to set; APP_PIN_HASH is still accepted so an
 * existing deployment keeps working without a new env var on the same push
 * that introduces accounts.
 */
export function sessionSecret(): string | null {
  const v = process.env.SESSION_SECRET || process.env.APP_PIN_HASH;
  return v && v.trim() ? v.trim() : null;
}

export async function createSessionToken(secret: string, userId: string, nowMs: number = Date.now()): Promise<string> {
  // The id goes in the signed body, so it cannot be swapped for someone
  // else's without the key. It is a uuid and therefore has no dots in it,
  // which is what keeps the body unambiguous to split.
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('createSessionToken: userId must be a uuid');
  const exp = Math.floor(nowMs / 1000) + SESSION_MAX_AGE;
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const body = `${VERSION}.${exp}.${userId}.${nonce}`;
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await keyFrom(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** The signed-in user's id, or null. Null is the only "not signed in". */
export async function verifySessionToken(token: string | undefined | null, secret: string | null, nowMs: number = Date.now()): Promise<string | null> {
  if (!token || !secret || token.length > 240) return null;
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== VERSION || !/^\d{1,12}$/.test(parts[1])) return null;
  if (!/^[0-9a-f-]{36}$/i.test(parts[2])) return null;
  const exp = Number(parts[1]);
  if (exp * 1000 <= nowMs) return null;
  const sig = fromB64url(parts[4]);
  // Canonical encoding only, so one signature has exactly one spelling.
  if (!sig || sig.length !== 32 || b64url(sig) !== parts[4]) return null;
  // crypto.subtle.verify compares in constant time.
  const ok = await crypto.subtle.verify('HMAC', await keyFrom(secret), sig, enc.encode(parts.slice(0, 4).join('.')));
  return ok ? parts[2] : null;
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
