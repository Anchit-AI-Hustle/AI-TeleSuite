"use client";

// Shown only to a visitor in the public demo (the ats_demo cookie set by /demo).
// The cookie is read after mount so the server and first client render agree.
import { useEffect, useState } from 'react';
import { demoEnded, isDemoVisitor, leaveDemo } from '@/lib/demo';


export function DemoBanner() {
  const [demo, setDemo] = useState(false);
  useEffect(() => { setDemo(isDemoVisitor()); }, []);
  // If someone signs in from another tab, this tab is still holding the demo's
  // copy of the data. Reload it so real work is never saved into the demo.
  useEffect(() => {
    if (!demo) return;
    const check = () => { if (demoEnded(true, document.cookie)) window.location.reload(); };
    const timer = window.setInterval(check, 1500);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [demo]);
  if (!demo) return null;
  return (
    <div role="status" className="mt-2 flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-between gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-950">
      <span>
        <strong>Public demo.</strong> You are looking at sample calls. Running a tool on your own calls needs a free account.
      </span>
      <a href="/login" onClick={leaveDemo} className="inline-flex min-h-[36px] items-center rounded-md bg-sky-700 px-3 font-medium text-white hover:bg-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
        Sign up free
      </a>
    </div>
  );
}
