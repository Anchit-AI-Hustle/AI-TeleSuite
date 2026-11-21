"use client";

// Shown only to a visitor in the public demo (the ats_demo cookie set by /demo).
// The cookie is read after mount so the server and first client render agree.
import { useEffect, useState } from 'react';
import Link from 'next/link';

export function isDemoVisitor(): boolean {
  return typeof document !== 'undefined' && /(?:^|;\s*)ats_demo=1(?:;|$)/.test(document.cookie);
}

export function DemoBanner() {
  const [demo, setDemo] = useState(false);
  useEffect(() => { setDemo(isDemoVisitor()); }, []);
  if (!demo) return null;
  const leave = () => { document.cookie = 'ats_demo=; path=/; max-age=0'; };
  return (
    <div role="status" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-950">
      <span>
        <strong>Public demo.</strong> You are looking at sample calls. Running a tool on your own calls needs a free account.
      </span>
      <Link href="/login" onClick={leave} className="inline-flex min-h-[36px] items-center rounded-md bg-sky-700 px-3 font-medium text-white hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
        Sign up free
      </Link>
    </div>
  );
}
