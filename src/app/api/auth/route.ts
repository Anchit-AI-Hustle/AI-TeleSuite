// PIN sign-in for the single owner of this app.
//
//   POST   /api/auth  { pin: "1234" }  -> sets the session cookie
//   DELETE /api/auth                   -> clears it (sign out)
//
// This is the only way in. There is no username, password, OAuth or OTP.
import { NextRequest, NextResponse } from 'next/server';
import { isPinShape, readPinHashFromEnv, verifyPin } from '@/lib/auth/pin';
import { lockoutStore, lockMessage, wrongPinMessage, MAX_TRIES } from '@/lib/auth/lockout';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions, sessionSecret } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One owner, so one identifier to count tries against.
const OWNER = 'owner';

function reply(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const stored = readPinHashFromEnv();
  if (!stored) {
    // No fallback of any kind: without the env var, nobody gets in.
    return reply(503, { ok: false, error: 'Sign-in is closed until the owner sets a PIN on the server.' });
  }

  let pin: unknown;
  try {
    pin = ((await req.json()) as { pin?: unknown } | null)?.pin;
  } catch {
    pin = undefined;
  }
  if (!isPinShape(pin)) {
    return reply(400, { ok: false, error: 'Type your 4-digit PIN, numbers only.' });
  }

  const store = lockoutStore();
  try {
    const claim = await store.claim(OWNER);
    if (!claim.ok) {
      return reply(429, { ok: false, locked: true, error: lockMessage(claim.lockedUntil) });
    }
    // Tries past the fifth were claimed by guesses already in flight.
    if (claim.tries > MAX_TRIES) {
      const until = await store.lock(OWNER);
      return reply(429, { ok: false, locked: true, error: lockMessage(until) });
    }
    if (!(await verifyPin(pin, stored))) {
      if (claim.tries >= MAX_TRIES) {
        const until = await store.lock(OWNER);
        return reply(429, { ok: false, locked: true, error: lockMessage(until) });
      }
      const left = MAX_TRIES - claim.tries;
      return reply(401, { ok: false, wrongPin: true, left, error: wrongPinMessage(left) });
    }
    await store.reset(OWNER);
  } catch (e) {
    console.error('PIN sign-in: lockout store unavailable', e instanceof Error ? e.message : e);
    return reply(503, { ok: false, error: 'Sign-in is unavailable right now. Please try again in a minute.' });
  }

  const res = reply(200, { ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(sessionSecret() as string), sessionCookieOptions());
  return res;
}

export function DELETE() {
  const res = reply(200, { ok: true });
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
