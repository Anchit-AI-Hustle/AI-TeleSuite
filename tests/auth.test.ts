// Sign-in rules, tested with nothing installed.
//
// Node 22 strips the types itself, so `npm test` runs on a fresh clone with
// no test framework, no database and no network. That is the point: the parts
// that decide who gets in should be checkable before anything else is.
//
// What is NOT here: anything that needs Postgres. users.ts is a thin layer of
// queries over these rules, and a test that needs a live database is a test
// that stops being run.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normPhone, phoneError, displayPhone, DEFAULT_CC } from '../src/lib/auth/phone.ts';
import { pinError, isPinShape, hashPin, verifyPin, PIN_LEN } from '../src/lib/auth/pin.ts';
import { createSessionToken, verifySessionToken, SESSION_MAX_AGE } from '../src/lib/auth/session.ts';

const UID = '11111111-2222-4333-8444-555555555555';
const SECRET = 'test-secret-not-a-real-one';

test('a bare Indian mobile is accepted and stored in E.164', () => {
  assert.equal(normPhone('9810002023')?.e164, '+919810002023');
  assert.equal(normPhone('98100 02023')?.e164, '+919810002023');
  assert.equal(normPhone('+91 98100 02023')?.e164, '+919810002023');
  // The leading 0 is how it is dialled inside India, not part of the number.
  assert.equal(normPhone('09810002023')?.e164, '+919810002023');
  assert.equal(DEFAULT_CC, '+91');
});

test('a number that breaks its own country rules is rejected, not patched up', () => {
  assert.equal(normPhone('1234567890'), null, 'Indian mobiles start 6-9');
  assert.equal(normPhone('981000202'), null, 'nine digits');
  assert.equal(normPhone('98100020234'), null, 'eleven digits');
  assert.equal(normPhone(''), null);
  assert.equal(normPhone(null), null);
  assert.equal(normPhone('not a number'), null);
});

test('the longest country code wins, or +1 swallows the start of +91', () => {
  assert.equal(normPhone('+919810002023')?.cc, '+91');
  assert.equal(normPhone('+12125551234')?.cc, '+1');
  assert.equal(normPhone('+8801712345678')?.cc, '+880');
});

test('phoneError names the country and its shape', () => {
  assert.match(phoneError('+91'), /10 digits/);
  assert.match(phoneError('+65'), /Singapore/);
});

test('displayPhone groups an Indian number the way it is written', () => {
  assert.equal(displayPhone('+919810002023'), '+91 98100 02023');
});

test('a PIN is exactly four numbers', () => {
  assert.equal(PIN_LEN, 4);
  assert.equal(isPinShape('4827'), true);
  assert.equal(isPinShape('482'), false);
  assert.equal(isPinShape('48a7'), false);
  assert.equal(isPinShape(4827 as unknown), false, 'a number is not a PIN; only the typed string is');
});

test('the PINs a thief tries first are refused at sign-up', () => {
  for (const weak of ['1234', '0000', '1111', '4321', '2580', '9876', '3456']) {
    assert.ok(pinError(weak), `${weak} should be refused`);
  }
  assert.equal(pinError('4827'), null);
  assert.match(pinError('') as string, /Choose a PIN/);
  assert.match(pinError('48a7') as string, /numbers only/);
  assert.match(pinError('482') as string, /you typed 3/);
});

test('a PIN verifies against its own hash and nothing else', async () => {
  const stored = await hashPin('4827');
  assert.equal(await verifyPin('4827', stored), true);
  assert.equal(await verifyPin('4828', stored), false);
  // Same PIN, different salt, different hash: two people sharing a PIN do not
  // share a row that looks identical.
  const other = await hashPin('4827');
  assert.notEqual(stored.hash, other.hash);
  assert.notEqual(stored.salt, other.salt);
});

test('a session says who it belongs to, and only with the right key', async () => {
  const token = await createSessionToken(SECRET, UID);
  assert.equal(await verifySessionToken(token, SECRET), UID);
  // A different server secret must not accept it.
  assert.equal(await verifySessionToken(token, 'another-secret'), null);
  assert.equal(await verifySessionToken(undefined, SECRET), null);
  assert.equal(await verifySessionToken(token, null), null);
});

test('the user id cannot be swapped without the key', async () => {
  const token = await createSessionToken(SECRET, UID);
  const parts = token.split('.');
  parts[2] = '99999999-2222-4333-8444-555555555555';
  assert.equal(await verifySessionToken(parts.join('.'), SECRET), null);
});

test('v1 tokens, which carried no user, are refused rather than upgraded', async () => {
  // Shape of the old token: v1.exp.nonce.sig
  const old = `v1.${Math.floor(Date.now() / 1000) + 600}.abcdef.ghijkl`;
  assert.equal(await verifySessionToken(old, SECRET), null);
});

test('an expired session is not a session', async () => {
  const past = Date.now() - (SESSION_MAX_AGE + 60) * 1000;
  const token = await createSessionToken(SECRET, UID, past);
  assert.equal(await verifySessionToken(token, SECRET), null);
});

test('createSessionToken refuses anything that is not a uuid', async () => {
  await assert.rejects(() => createSessionToken(SECRET, 'owner'), /uuid/);
});
