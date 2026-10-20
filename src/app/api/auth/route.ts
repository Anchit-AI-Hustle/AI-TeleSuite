// Sign-up and sign-in, on a mobile number and a 4-digit PIN.
//
//   POST   /api/auth { action: 'signin', phone, cc?, pin }        -> session cookie
//   POST   /api/auth { action: 'signup', phone, cc?, pin, name? } -> session cookie
//   DELETE /api/auth                                              -> sign out
//
// Registration is open: any valid mobile number can create an account. That
// was a deliberate choice, and these are what stand in for a closed door,
// because "anyone may sign up" must not also mean "anyone may guess":
//
//   - each PIN is scrypt-derived per account, so a copy of the table is not a
//     set of working logins;
//   - five wrong PINs lock THAT NUMBER for fifteen minutes (lockout.ts);
//   - sign-ups are capped per client address, so one script cannot mint
//     accounts in a loop;
//   - a number with no account and a wrong PIN get the SAME answer, so the
//     endpoint never becomes a way to ask which numbers are registered.
import { NextRequest, NextResponse } from 'next/server';
import { isPinShape, pinError, readPinHashFromEnv, verifyPin } from '@/lib/auth/pin';
import { lockoutStore, lockMessage, wrongPinMessage, MAX_TRIES } from '@/lib/auth/lockout';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions, sessionSecret } from '@/lib/auth/session';
import { normPhone, phoneError } from '@/lib/auth/phone';
import { checkPin, createUser, databaseUrl, findByPhone, type UserRow } from '@/lib/auth/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Said to someone who typed a number with no account, AND to someone who
// typed the wrong PIN for an account that exists. One sentence for both, or
// the endpoint tells a stranger which numbers are registered.
const NO_MATCH = 'That mobile number and PIN do not match an account.';

const SIGNUP_MAX_PER_IP = 5;

// The owner's pre-accounts session still needs an id to put in the token. A
// fixed uuid keeps that one session the same shape as every other, instead of
// carrying a second token format forever.
const OWNER_UUID = '00000000-0000-4000-8000-000000000001';

function reply(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Claim a try, run the check, and turn the outcome into a response.
 *
 * The claim happens BEFORE the check, and only while the identifier is not
 * locked: checking first and counting afterwards lets a burst of parallel
 * guesses all be checked before the lock lands.
 */
async function guard(
  id: string,
  check: () => Promise<boolean>,
  wrongMessage?: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const store = lockoutStore();
  try {
    const claim = await store.claim(id);
    if (!claim.ok) {
      return { ok: false, response: reply(429, { ok: false, locked: true, error: lockMessage(claim.lockedUntil) }) };
    }
    if (claim.tries > MAX_TRIES) {
      const until = await store.lock(id);
      return { ok: false, response: reply(429, { ok: false, locked: true, error: lockMessage(until) }) };
    }
    if (!(await check())) {
      if (claim.tries >= MAX_TRIES) {
        const until = await store.lock(id);
        return { ok: false, response: reply(429, { ok: false, locked: true, error: lockMessage(until) }) };
      }
      const left = MAX_TRIES - claim.tries;
      return {
        ok: false,
        response: reply(401, { ok: false, wrongPin: true, left, error: wrongMessage ?? wrongPinMessage(left) }),
      };
    }
    await store.reset(id);
    return { ok: true };
  } catch (e) {
    console.error('sign-in: lockout store unavailable', e instanceof Error ? e.message : e);
    return { ok: false, response: reply(503, { ok: false, error: 'Sign-in is unavailable right now. Please try again in a minute.' }) };
  }
}

type Body = { action?: unknown; phone?: unknown; cc?: unknown; pin?: unknown; name?: unknown };

export async function POST(req: NextRequest) {
  const secret = sessionSecret();
  if (!secret) {
    return reply(503, { ok: false, error: 'Sign-in is closed until SESSION_SECRET is set on the server.' });
  }

  let body: Body = {};
  try {
    body = ((await req.json()) as Body | null) ?? {};
  } catch {
    body = {};
  }

  const action = body.action === 'signup' ? 'signup' : 'signin';
  const pin = body.pin;

  // ---- the single-owner PIN that predates accounts ------------------------
  // Before this change one PIN in APP_PIN_HASH was the whole scheme. A request
  // with a PIN and no number, on a server with no database, is that old client
  // still deployed. It keeps working so a deploy does not lock the owner out
  // of their own app; it is not how anyone new gets in.
  if (body.phone == null && !databaseUrl()) {
    const stored = readPinHashFromEnv();
    if (!stored) return reply(503, { ok: false, error: 'Sign-in is closed until the owner sets a PIN on the server.' });
    if (!isPinShape(pin)) return reply(400, { ok: false, error: 'Type your 4-digit PIN, numbers only.' });
    const gate = await guard('owner', () => verifyPin(pin, stored));
    if (!gate.ok) return gate.response;
    const res = reply(200, { ok: true });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(secret, OWNER_UUID), sessionCookieOptions());
    return res;
  }

  if (!databaseUrl()) {
    return reply(503, { ok: false, error: 'Accounts are not set up on this server yet.' });
  }

  const phone = normPhone(body.phone, body.cc);
  if (!phone) return reply(400, { ok: false, error: phoneError(body.cc) });

  // ---- sign up ------------------------------------------------------------
  if (action === 'signup') {
    // A PIN being CHOSEN is held to the choosing rules. A PIN being typed at
    // sign-in is not: that is verifyPin's job, so someone whose PIN predates a
    // rule can still prove who they are.
    const bad = pinError(pin);
    if (bad) return reply(400, { ok: false, error: bad });

    const store = lockoutStore();
    try {
      const claim = await store.claim(`signup:${clientIp(req)}`);
      if (!claim.ok || claim.tries > SIGNUP_MAX_PER_IP) {
        return reply(429, { ok: false, error: 'Too many accounts created from here. Please try again later.' });
      }
    } catch (e) {
      console.error('signup: lockout store unavailable', e instanceof Error ? e.message : e);
      return reply(503, { ok: false, error: 'Sign-up is unavailable right now. Please try again in a minute.' });
    }

    let created;
    try {
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) || null : null;
      created = await createUser(phone.e164, String(pin), name);
    } catch (e) {
      console.error('signup: database unavailable', e instanceof Error ? e.message : e);
      return reply(503, { ok: false, error: 'Sign-up is unavailable right now. Please try again in a minute.' });
    }
    if (!created) {
      // The unique index refused it, so the number already has an account.
      // Safe to say plainly: the person is holding that number.
      return reply(409, { ok: false, exists: true, error: 'That mobile number already has an account. Sign in instead.' });
    }

    const res = reply(200, { ok: true, user: { id: created.id, phone: created.phone, name: created.name } });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(secret, created.id), sessionCookieOptions());
    return res;
  }

  // ---- sign in ------------------------------------------------------------
  if (!isPinShape(pin)) return reply(400, { ok: false, error: 'Type your 4-digit PIN, numbers only.' });

  let row: UserRow | null;
  try {
    row = await findByPhone(phone.e164);
  } catch (e) {
    console.error('signin: database unavailable', e instanceof Error ? e.message : e);
    return reply(503, { ok: false, error: 'Sign-in is unavailable right now. Please try again in a minute.' });
  }

  // The try is counted against the NUMBER whether or not it has an account,
  // so a number with no account cannot be probed for free.
  const gate = await guard(`phone:${phone.e164}`, async () => (row ? checkPin(row, String(pin)) : false), NO_MATCH);
  if (!gate.ok) return gate.response;

  const user = row as UserRow;
  const res = reply(200, { ok: true, user: { id: user.id, phone: user.phone, name: user.name } });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(secret, user.id), sessionCookieOptions());
  return res;
}

export function DELETE() {
  const res = reply(200, { ok: true });
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
