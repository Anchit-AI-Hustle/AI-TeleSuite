"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck, LockKeyhole } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { safeNextPath } from '@/lib/auth/next-path';

export default function LoginPage() {
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // The old browser-only sign-in kept a flag here. It no longer grants
    // anything; clear it so it does not linger.
    try { window.localStorage.removeItem('aiTeleSuiteDemoAuth'); } catch { /* storage blocked */ }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      setError('Type your 4-digit PIN, numbers only.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && data?.ok) {
        const next = new URLSearchParams(window.location.search).get('next');
        window.location.assign(safeNextPath(next, window.location.origin));
        return;
      }
      setError(data?.error || 'Sign-in did not work. Please try again.');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
    setPin('');
    setIsSubmitting(false);
    inputRef.current?.focus();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>Enter your 4-digit PIN.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN</Label>
              <Input
                ref={inputRef}
                id="pin"
                name="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                autoComplete="current-password"
                autoFocus
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
            <Button type="submit" className="w-full" disabled={isSubmitting || pin.length !== 4}>
              {isSubmitting ? 'Checking...' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
