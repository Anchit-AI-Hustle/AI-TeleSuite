// Where to go after sign-in. The value comes from the ?next= query param, so
// it is untrusted: only a same-origin path is accepted, anything else falls
// back to /home.
//
// Plain prefix checks are not enough on their own: browsers drop tabs and
// newlines from URLs ("/\t/evil.com" becomes "//evil.com") and treat "\" as
// "/". So the value is also resolved against our own origin, and used only if
// it is still on that origin.
export const DEFAULT_AFTER_SIGN_IN = '/home';

export function safeNextPath(raw: string | null | undefined, origin: string): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return DEFAULT_AFTER_SIGN_IN;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_AFTER_SIGN_IN;
  // Control characters and backslashes have no place in our own paths.
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c < 0x20 || c === 0x7f || c === 0x5c) return DEFAULT_AFTER_SIGN_IN;
  }
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return DEFAULT_AFTER_SIGN_IN;
  }
  if (url.origin !== new URL(origin).origin) return DEFAULT_AFTER_SIGN_IN;
  return url.pathname + url.search + url.hash;
}
