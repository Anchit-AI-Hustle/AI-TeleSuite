#!/usr/bin/env node
// Prints the value to put in the APP_PIN_HASH env var for a 4-digit PIN.
//
//   node scripts/pin-hash.mjs 4827
//   printf 4827 | node scripts/pin-hash.mjs      (keeps the PIN out of shell history)
//
// The output is "salt:hash" (scrypt). Only that goes on the server; the PIN
// itself is never stored. Run it again with a new PIN to change it: every
// signed-in device is signed out when APP_PIN_HASH changes.
import { scryptSync, randomBytes } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Must match src/lib/auth/pin.ts.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

// The PINs a thief tries first.
const WEAK = new Set([
  '1234', '4321', '1212', '1122', '2580', '0852', '1004', '2000', '2020',
  '6969', '1313', '2468', '1357', '0123', '9876', '5683', '7777', '1010',
  '2121', '1111', '0000', '2001', '1990', '1230', '0007',
]);

export function pinError(p) {
  if (!/^\d{4}$/.test(p)) return 'A PIN is exactly 4 numbers, for example 4827.';
  if (WEAK.has(p) || /^(\d)\1+$/.test(p)) return 'That PIN is one of the first anyone would try. Please pick another.';
  let up = true, down = true;
  for (let i = 1; i < p.length; i++) {
    if (+p[i] !== +p[i - 1] + 1) up = false;
    if (+p[i] !== +p[i - 1] - 1) down = false;
  }
  if (up || down) return 'That PIN is one of the first anyone would try. Please pick another.';
  return null;
}

export function pinHash(pin, salt = randomBytes(16).toString('hex')) {
  const key = scryptSync(pin, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `${salt}:${key.toString('hex')}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  let pin = process.argv[2];
  if (pin === undefined && !process.stdin.isTTY) pin = readFileSync(0, 'utf8');
  pin = String(pin ?? '').trim();
  const err = pinError(pin);
  if (err) {
    console.error(err);
    console.error('Usage: node scripts/pin-hash.mjs 4827');
    process.exit(1);
  }
  console.log(pinHash(pin));
}
