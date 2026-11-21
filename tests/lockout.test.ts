// The sign-up cap, on a clock the test controls.
//
// A wrong-PIN count is cleared by the right PIN. Nothing clears a sign-up
// count, so the route's first version (claim, refuse above five, and stop
// there) refused an address for as long as the count lived: until the server
// process happened to be recycled, or forever once the count was kept in
// Redis. A sales team behind one office connection shares one address, so the
// sixth person to sign up was told "try again later" and later never came.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { memoryStore, upstashStore, claimCapped, capMessage, LOCK_MS } from '../src/lib/auth/lockout.ts';

test('the cap lets five through, refuses the sixth, and says for how long', async () => {
  let t = 1_000_000;
  const store = memoryStore(() => t);
  for (let i = 1; i <= 5; i++) assert.deepEqual(await claimCapped(store, 'signup:1.2.3.4', 5), { ok: true }, `sign-up ${i}`);
  assert.deepEqual(await claimCapped(store, 'signup:1.2.3.4', 5), { ok: false, lockedUntil: t + LOCK_MS });
  assert.match(capMessage(t + LOCK_MS, t), /15 minutes/);
});

test('"later" comes: after the pause the same address can sign up again', async () => {
  let t = 1_000_000;
  const store = memoryStore(() => t);
  for (let i = 0; i < 6; i++) await claimCapped(store, 'a', 5);
  t += LOCK_MS - 1;
  assert.equal((await claimCapped(store, 'a', 5)).ok, false, 'still inside the pause');
  t += 1;
  for (let i = 1; i <= 5; i++) assert.deepEqual(await claimCapped(store, 'a', 5), { ok: true }, `after the pause, sign-up ${i}`);
  assert.equal((await claimCapped(store, 'a', 5)).ok, false);
});

test('hammering during the pause does not extend it', async () => {
  let t = 0;
  const store = memoryStore(() => t);
  for (let i = 0; i < 6; i++) await claimCapped(store, 'a', 5);
  for (let i = 0; i < 50; i++) { t += 1000; await claimCapped(store, 'a', 5); }
  t = LOCK_MS;
  assert.deepEqual(await claimCapped(store, 'a', 5), { ok: true });
});

test('one address being capped does not touch another', async () => {
  const store = memoryStore(() => 0);
  for (let i = 0; i < 6; i++) await claimCapped(store, 'a', 5);
  assert.deepEqual(await claimCapped(store, 'b', 5), { ok: true });
});

test('on Redis the sixth claim asks for the expiring lock, which is what clears the count', async () => {
  const calls: string[][] = [];
  let tries = 0;
  const fake = async (_url: string, init: { body: string }) => {
    const args = JSON.parse(init.body) as string[];
    calls.push(args);
    const isClaim = args[1].includes('INCR');
    return { ok: true, status: 200, json: async () => ({ result: isClaim ? [++tries, 0] : LOCK_MS }) };
  };
  const store = upstashStore('https://redis.example', 'token', fake as never, () => 0);
  for (let i = 0; i < 5; i++) assert.deepEqual(await claimCapped(store, 'signup:9.9.9.9', 5), { ok: true });
  assert.deepEqual(await claimCapped(store, 'signup:9.9.9.9', 5), { ok: false, lockedUntil: LOCK_MS });
  const last = calls.at(-1)!;
  assert.match(last[1], /'PX'/, 'the lock expires on its own');
  assert.match(last[1], /DEL/, 'the count is cleared with it');
  assert.equal(last.at(-1), String(LOCK_MS));
});
