import { redirect } from 'next/navigation';

// Sign-up is the other tab of /login, not a second screen. The middleware
// already treated this path as one of the two public ones and sent a
// signed-in visitor away from it, so the only thing missing was the route
// itself: /signup answered 404 while the middleware waved it through.
//
// The ?next= value is forwarded as it arrived. It is untrusted, and /login
// puts it through safeNextPath before navigating anywhere, which is where
// that check belongs.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const query = new URLSearchParams({ mode: 'signup' });
  const one = Array.isArray(next) ? next[0] : next;
  if (one) query.set('next', one);
  redirect(`/login?${query.toString()}`);
}
