// The public demo's one rule about data: it has its own. A demo visitor reads
// and writes only keys under DEMO_PREFIX, so the demo can never show, change
// or delete what a real person stored in the same browser, and anything a
// signed-in person saves never lands in the demo's copy.
export const DEMO_COOKIE = 'ats_demo';
export const DEMO_PREFIX = 'demo:';

export function isDemoCookie(cookie: string | null | undefined): boolean {
  return /(?:^|;\s*)ats_demo=1(?:;|$)/.test(cookie ?? '');
}

/** The key to use in the browser's storage for `key`, given the page's cookies. */
export function storageKeyFor(key: string, cookie: string | null | undefined): string {
  return isDemoCookie(cookie) ? DEMO_PREFIX + key : key;
}

export function isDemoVisitor(): boolean {
  return typeof document !== 'undefined' && isDemoCookie(document.cookie);
}

/** Leave the demo in this browser (the middleware also does this on sign-in). */
export function leaveDemo(): void {
  if (typeof document !== 'undefined') document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0`;
}
