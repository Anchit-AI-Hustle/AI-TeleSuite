// The PIN check. Runs on the server only (Node runtime): it needs node:crypto.
//
// Each person has their own PIN now, stored per mobile number as a scrypt
// salt and hash (see users.ts). The PIN itself is never stored anywhere.
//
// APP_PIN_HASH is still read, and still works: it was the single owner's PIN
// before accounts existed, and removing it would lock that person out of
// their own app on deploy. It is a fallback for one account, not the scheme.
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

export const PIN_LEN = 4;
export const PIN_RE = /^\d{4}$/;

// scrypt, not a bare hash: a 4-digit PIN has ten thousand possibilities, so
// the cost of each guess is what protects the hash if it ever leaks.
// These must match scripts/pin-hash.mjs.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const;

export function isPinShape(pin: unknown): pin is string {
  return typeof pin === 'string' && PIN_RE.test(pin);
}

// The PINs a thief tries first. Blocking them costs a person nothing and
// removes the handful that would otherwise be guessed immediately. Ten
// thousand possibilities is only a real number if the first fifty are not
// where everybody lands.
const WEAK = new Set([
  '1234', '4321', '1212', '1122', '2580', '0852', '1004', '2000', '2020',
  '6969', '1313', '2468', '1357', '0123', '9876', '5683', '7777', '1010',
  '2121', '1111', '0000', '2001', '1990', '1230', '0007',
]);

/**
 * The rule for CHOOSING a PIN, used by sign-up and by changing one.
 *
 * Signing in with an existing PIN is never checked against this: that is
 * verifyPin's job. Someone whose PIN predates a rule must still be able to
 * prove who they are, and then be asked to pick a new one.
 */
export function pinError(pin: unknown): string | null {
  // Same reasoning as phone.ts: an object is not a PIN with a typo in it.
  const p = typeof pin === 'string' ? pin : typeof pin === 'number' && Number.isFinite(pin) ? String(pin) : '';
  if (!p) return 'Choose a PIN of 4 numbers.';
  if (!/^[0-9]+$/.test(p)) return 'A PIN is numbers only - 4 of them.';
  if (p.length !== PIN_LEN) return `A PIN is exactly 4 numbers, and you typed ${p.length}.`;
  if (WEAK.has(p) || /^(\d)\1+$/.test(p)) {
    return 'That PIN is one of the first anyone would try. Please pick another.';
  }
  // A run like 3456 or 9876, forwards or backwards, is the same problem.
  let up = true;
  let down = true;
  for (let i = 1; i < p.length; i++) {
    if (+p[i] !== +p[i - 1] + 1) up = false;
    if (+p[i] !== +p[i - 1] - 1) down = false;
  }
  if (up || down) return 'That PIN is one of the first anyone would try. Please pick another.';
  return null;
}

export type PinHash = { salt: string; hash: string };

export function parsePinHash(raw: string | undefined | null): PinHash | null {
  if (!raw) return null;
  const m = /^([0-9a-f]{32}):([0-9a-f]{64})$/.exec(raw.trim());
  return m ? { salt: m[1], hash: m[2] } : null;
}

export function readPinHashFromEnv(): PinHash | null {
  return parsePinHash(process.env.APP_PIN_HASH);
}

function derive(pin: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPin(pin: string, salt?: string): Promise<PinHash> {
  const s = salt ?? randomBytes(16).toString('hex');
  const key = await derive(pin, s);
  return { salt: s, hash: key.toString('hex') };
}

// Constant-time compare, so the answer cannot be learned one digit at a time
// from how long the reply takes.
export async function verifyPin(pin: string, stored: PinHash): Promise<boolean> {
  const a = await derive(pin, stored.salt);
  const b = Buffer.from(stored.hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
