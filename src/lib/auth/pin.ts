// The PIN check. Runs on the server only (Node runtime): it needs node:crypto.
//
// This is a single-owner app with no user table, so the one PIN lives in a
// server env var, APP_PIN_HASH, as "salt:hash" (both hex), made with
// `node scripts/pin-hash.mjs`. The PIN itself is never stored anywhere.
// If the env var is missing or malformed, sign-in stays closed.
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
