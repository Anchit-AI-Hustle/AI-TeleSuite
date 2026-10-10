// Every page and API route needs a signed-in session, except the sign-in
// page, the sign-in route itself, and the daily cache-cleanup cron.
//
// This file must live in src/ because the app uses src/app: Next.js ignores a
// middleware.ts at the project root in that layout.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionSecret, verifySessionToken } from '@/lib/auth/session';

const PUBLIC_PATHS = new Set(['/login', '/api/auth', '/api/cleanup-cache']);

// Only same-site paths, never "//host" or a full URL.
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/home';
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, sessionSecret());

  if (pathname === '/login') {
    if (signedIn) {
      return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get('next')), request.url));
    }
    return NextResponse.next();
  }
  if (PUBLIC_PATHS.has(pathname) || signedIn) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { ok: false, error: 'Sign in with your PIN first.' },
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
