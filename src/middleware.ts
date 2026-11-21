// Every page and API route needs a signed-in session, except the sign-in
// page, the sign-in route itself, and the daily cache-cleanup cron.
//
// This file must live in src/ because the app uses src/app: Next.js ignores a
// middleware.ts at the project root in that layout.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionSecret, verifySessionToken } from '@/lib/auth/session';
import { safeNextPath } from '@/lib/auth/next-path';

const PUBLIC_PATHS = new Set(['/login', '/signup', '/api/auth', '/api/cleanup-cache']);

// The public demo. /demo sets a short-lived, non-secret cookie that lets a
// visitor open the app's pages with sample data and nothing else: every API
// route still answers 403 for a demo visitor, so no AI call, no stored data and
// no account is reachable without signing in. The pages are client shells whose
// data lives in the browser, so there is nothing of anyone's to see.
export const DEMO_COOKIE = 'ats_demo';
const DEMO_MAX_AGE = 6 * 60 * 60; // seconds
const DEMO_MESSAGE = 'This is the public demo with sample data. Sign up free to run this on your own calls.';

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // verifySessionToken returns the user id now, so null is the only "no".
  const signedIn = (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, sessionSecret())) !== null;

  if (pathname === '/demo') {
    if (signedIn) {
      const home = NextResponse.redirect(new URL('/home', request.url));
      home.cookies.set(DEMO_COOKIE, '', { path: '/', maxAge: 0 });
      return home;
    }
    const res = NextResponse.redirect(new URL('/home', request.url));
    res.cookies.set(DEMO_COOKIE, '1', { path: '/', maxAge: DEMO_MAX_AGE, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    return res;
  }
  const demo = !signedIn && request.cookies.get(DEMO_COOKIE)?.value === '1';

  if (pathname === '/login' || pathname === '/signup') {
    if (signedIn) {
      return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get('next'), request.nextUrl.origin), request.url));
    }
    return NextResponse.next();
  }
  if (signedIn && request.cookies.has(DEMO_COOKIE)) {
    // Signing in ends the demo. The cookie goes before the page's scripts run,
    // so the app starts on the person's own storage, not the demo's copy.
    const res = NextResponse.next();
    res.cookies.set(DEMO_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  }
  if (PUBLIC_PATHS.has(pathname) || signedIn) {
    return NextResponse.next();
  }

  if (demo) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { ok: false, demo: true, error: DEMO_MESSAGE },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    const res = NextResponse.next();
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('X-Robots-Tag', 'noindex');
    return res;
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { ok: false, error: 'Sign in with your mobile number and PIN first.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  const login = new URL('/login', request.url);
  if (pathname !== '/') login.searchParams.set('next', pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // Everything except Next.js build assets and files with an extension
    // (favicon.ico, icon-192.png and the rest of /public).
    '/((?!_next/static|_next/image|.*\\.[A-Za-z0-9]+$).*)',
  ],
};
