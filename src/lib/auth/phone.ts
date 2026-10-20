// Mobile number rules - deliberately DEPENDENCY-FREE.
//
// These are pure functions so the unit test that covers them runs on a fresh
// clone with nothing installed and no database reachable. Keeping them out of
// db.ts means the test never drags in the Postgres driver.
//
// Ported from the phone-first sign-in already shipped in parwah-hq, so the two
// apps agree on what a valid number is and store the same canonical form.

export type Phone = { e164: string; cc: string; local: string };

// Only a string or a number is text a person could have typed. An object or
// an array arriving as `phone` is not a number with a formatting problem, it
// is not a number at all - so it becomes '' here and is rejected, rather than
// being stringified into "[object Object]" and failing a regex further down.
function asText(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

// The country code is kept SEPARATELY from the local number, and the local
// number is validated against that country's shape. Strictest for India (the
// home market); pragmatic ranges elsewhere so a real number is never wrongly
// rejected.
export const PHONE_CC: Record<string, { min: number; max: number; re?: RegExp; name: string }> = {
  '+91': { min: 10, max: 10, re: /^[6-9]\d{9}$/, name: 'India' },
  '+1': { min: 10, max: 10, re: /^[2-9]\d{9}$/, name: 'USA / Canada' },
  '+44': { min: 9, max: 10, name: 'UK' },
  '+971': { min: 8, max: 9, name: 'UAE' },
  '+61': { min: 9, max: 9, name: 'Australia' },
  '+65': { min: 8, max: 8, re: /^[3689]\d{7}$/, name: 'Singapore' },
  '+49': { min: 7, max: 11, name: 'Germany' },
  '+81': { min: 9, max: 10, name: 'Japan' },
  '+86': { min: 11, max: 11, name: 'China' },
  '+92': { min: 10, max: 10, name: 'Pakistan' },
  '+880': { min: 10, max: 10, name: 'Bangladesh' },
  '+977': { min: 10, max: 10, name: 'Nepal' },
  '+94': { min: 9, max: 9, name: 'Sri Lanka' },
};

export const DEFAULT_CC = '+91';

/**
 * Parse and validate a mobile number.
 *
 * `value` may be a bare local number (then `cc` applies, default +91) or a
 * full +international string (the code is read from it). Returns null when the
 * number fails its own country's rules — never a half-parsed result, because a
 * wrong number stored canonically is worse than a rejected one.
 */
export function normPhone(value: unknown, cc?: unknown): Phone | null {
  // Strip only the separators people actually type. Anything else is a reason
  // to reject rather than something to clean up silently.
  const raw = asText(value).replace(/[()\-\s.]/g, '');
  if (!raw) return null;

  let code: string | null = null;
  let local: string | null = null;

  if (raw.startsWith('+')) {
    const digits = raw.slice(1);
    if (!/^\d{6,15}$/.test(digits)) return null;
    // Longest code first, or +1 swallows the start of +91.
    for (const k of Object.keys(PHONE_CC).sort((a, b) => b.length - a.length)) {
      if (raw.startsWith(k)) {
        code = k;
        local = raw.slice(k.length);
        break;
      }
    }
    if (!code) return null;
  } else {
    code = asText(cc).trim() || DEFAULT_CC;
    if (!code.startsWith('+')) code = '+' + code.replace(/\D/g, '');
    if (!PHONE_CC[code]) return null;
    local = raw.replace(/\D/g, '');
    // A leading 0 is how the number is dialled inside its own country; it is
    // not part of the number itself.
    if (local.length > (PHONE_CC[code].max ?? 15) && local.startsWith('0')) local = local.slice(1);
  }

  if (!code || !local || !/^\d+$/.test(local)) return null;
  const rule = PHONE_CC[code];
  if (!rule) return null;
  if (local.length < rule.min || local.length > rule.max) return null;
  if (rule.re && !rule.re.test(local)) return null;

  return { e164: code + local, cc: code, local };
}

/** Why a number was rejected, in words a person can act on. */
export function phoneError(cc?: unknown): string {
  const code = asText(cc).trim() || DEFAULT_CC;
  const rule = PHONE_CC[code];
  if (!rule) return 'Pick a country code we support.';
  if (code === '+91') return 'An Indian mobile number is 10 digits and starts with 6, 7, 8 or 9.';
  const digits = rule.min === rule.max ? `${rule.min} digits` : `${rule.min} to ${rule.max} digits`;
  return `A ${rule.name} mobile number is ${digits}.`;
}

/** How the number is shown back to the person: +91 98100 02023. */
export function displayPhone(e164: string): string {
  const p = normPhone(e164);
  if (!p) return e164;
  const l = p.local;
  if (p.cc === '+91' && l.length === 10) return `${p.cc} ${l.slice(0, 5)} ${l.slice(5)}`;
  if (l.length === 10) return `${p.cc} ${l.slice(0, 3)} ${l.slice(3, 6)} ${l.slice(6)}`;
  return `${p.cc} ${l}`;
}
