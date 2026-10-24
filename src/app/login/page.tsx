"use client";

// One screen, two directions. "Sign in" and "Sign up" are the same fields; a
// tab swaps what the button does, rather than sending someone to a second
// page and asking them to type their number again.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck, LockKeyhole } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { safeNextPath } from '@/lib/auth/next-path';
import { PHONE_CC, DEFAULT_CC } from '@/lib/auth/phone';

type Mode = 'signin' | 'signup';

// Home market first, the rest alphabetical by country name.
const CODES = Object.keys(PHONE_CC).sort((a, b) =>
  a === DEFAULT_CC ? -1 : b === DEFAULT_CC ? 1 : PHONE_CC[a].name.localeCompare(PHONE_CC[b].name)
);

// A number is often pasted whole: "+91 98100 02023". Keeping a leading + lets
// normPhone read the country code out of the number itself instead of the
// select, so a pasted number is accepted rather than refused for being twelve
// digits long. A + anywhere else is not a number anyone types.
function phoneInput(raw: string): string {
  // The cap counts DIGITS, not characters. Counting characters counted the
  // spaces too, so a pasted "+49 151 2345 6789" came out as "+49 151 2345 678"
  // - and +49 accepts 7 to 11 local digits, so normPhone took the truncated
  // number as a valid one. The form would have registered a number its owner
  // never typed, and bound their PIN to it. Fifteen digits is E.164's own
  // limit, so nothing real reaches it.
  const plus = raw.trimStart().startsWith('+');
  let digits = 0;
  let out = '';
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      if (digits >= 15) break;
      digits += 1;
      out += ch;
    } else if (ch === ' ') {
      out += ch;
    }
  }
  return plus ? '+' + out : out;
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [cc, setCc] = useState(DEFAULT_CC);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // The old browser-only sign-in kept a flag here. It no longer grants
    // anything; clear it so it does not linger.
    try { window.localStorage.removeItem('aiTeleSuiteDemoAuth'); } catch { /* storage blocked */ }
    // /signup sends people here with ?mode=signup. Read it AFTER mount: the
    // server has already rendered the sign-in tab, and picking a different
    // tab during render is a hydration mismatch.
    if (new URLSearchParams(window.location.search).get('mode') === 'signup') setMode('signup');
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPin('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!phone.trim()) {
      setError('Enter your mobile number.');
      phoneRef.current?.focus();
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError('Your PIN is 4 numbers.');
      pinRef.current?.focus();
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, phone: phone.trim(), cc, pin, name: name.trim() || undefined }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; exists?: boolean }
        | null;
      if (res.ok && data?.ok) {
        const next = new URLSearchParams(window.location.search).get('next');
        window.location.assign(safeNextPath(next, window.location.origin));
        return;
      }
      // "That number already has an account" is only useful if the button
      // then becomes the one they actually need.
      if (data?.exists) setMode('signin');
      setError(data?.error || 'That did not work. Please try again.');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
    setPin('');
    setIsSubmitting(false);
    pinRef.current?.focus();
  };

  const isSignup = mode === 'signup';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">{isSignup ? 'Create an account' : 'Sign in'}</CardTitle>
          <CardDescription>
            {isSignup
              ? 'Your mobile number and a PIN of 4 numbers.'
              : 'Your mobile number and your 4-number PIN.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist">
            {(['signin', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (mode === m ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')
                }
              >
                {m === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile number</Label>
              <div className="flex gap-2">
                <select
                  aria-label="Country code"
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                >
                  {CODES.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
                <Input
                  ref={phoneRef}
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  autoFocus
                  placeholder={cc === '+91' ? '98100 02023' : 'Mobile number'}
                  className="flex-1"
                  value={phone}
                  onChange={(e) => setPhone(phoneInput(e.target.value))}
                />
              </div>
            </div>

            {isSignup && (
              <div className="space-y-2">
                <Label htmlFor="name">
                  Your name <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 80))}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="pin">{isSignup ? 'Choose a PIN' : 'PIN'}</Label>
              <Input
                ref={pinRef}
                id="pin"
                name="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                className="text-center text-2xl tracking-[0.75em]"
                aria-describedby={error ? 'pin-error' : undefined}
                aria-invalid={error ? true : undefined}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </div>

            {error && (
              <Alert variant="destructive" className="text-sm gap-2">
                <LockKeyhole className="h-4 w-4" />
                <AlertDescription id="pin-error" role="alert">{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting || pin.length !== 4 || !phone.trim()}>
              {isSubmitting ? 'Checking...' : isSignup ? 'Create account' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
