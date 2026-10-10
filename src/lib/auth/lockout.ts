// Five wrong tries, then a 15-minute lock.
//
// Each try is CLAIMED before the PIN is checked, and only while the
// identifier is not locked. Checking first and counting afterwards lets a
// burst of parallel guesses all be checked before the lock lands.
//
// Where the count lives:
// - If an Upstash Redis REST endpoint is configured (UPSTASH_REDIS_REST_URL +
//   UPSTASH_REDIS_REST_TOKEN, or the Vercel KV names KV_REST_API_URL +
//   KV_REST_API_TOKEN), the claim is one Lua script there, so it is atomic
//   across every server instance.
// - Otherwise it lives in this server process. The claim is synchronous, so it
//   is atomic within the process, but a serverless platform may run several
//   processes, each with its own count. See the PR notes.
export const MAX_TRIES = 5;
export const LOCK_MINUTES = 15;
export const LOCK_MS = LOCK_MINUTES * 60_000;

export type Claim =
  | { ok: true; tries: number }
  | { ok: false; lockedUntil: number };

export interface LockoutStore {
  /** Count one try, unless locked. Atomic. */
  claim(_id: string): Promise<Claim>;
  /** Lock for LOCK_MS (unless already locked) and clear the count. Returns when the lock ends. */
  lock(_id: string): Promise<number>;
  /** A right PIN: clear the count. */
  reset(_id: string): Promise<void>;
}

// ---- in-process ---------------------------------------------------------
type Entry = { tries: number; lockedUntil: number };

export function memoryStore(now: () => number = Date.now): LockoutStore {
  const map = new Map<string, Entry>();
  const get = (id: string): Entry => {
    let e = map.get(id);
    if (!e) { e = { tries: 0, lockedUntil: 0 }; map.set(id, e); }
    return e;
  };
  return {
    claim(id) {
      const e = get(id);
      if (e.lockedUntil > now()) return Promise.resolve({ ok: false, lockedUntil: e.lockedUntil });
      e.tries += 1;
      return Promise.resolve({ ok: true, tries: e.tries });
    },
    lock(id) {
      const e = get(id);
      if (!(e.lockedUntil > now())) e.lockedUntil = now() + LOCK_MS;
      e.tries = 0;
      return Promise.resolve(e.lockedUntil);
    },
    reset(id) {
      get(id).tries = 0;
      return Promise.resolve();
    },
  };
}

// ---- Upstash Redis over REST (no extra dependency) ------------------------
const CLAIM_LUA = `
local ttl = redis.call('PTTL', KEYS[2])
if ttl > 0 then return {0, ttl} end
return {redis.call('INCR', KEYS[1]), 0}`;
const LOCK_LUA = `
redis.call('SET', KEYS[2], '1', 'PX', ARGV[1], 'NX')
redis.call('DEL', KEYS[1])
return redis.call('PTTL', KEYS[2])`;

type FetchLike = (_url: string, _init: { method: string; headers: Record<string, string>; body: string; cache: 'no-store' }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function upstashStore(url: string, token: string, fetchImpl: FetchLike = fetch, now: () => number = Date.now): LockoutStore {
  const keys = (id: string) => [`pin:tries:${id}`, `pin:lock:${id}`];
  async function cmd(args: (string | number)[]): Promise<unknown> {
    const res = await fetchImpl(url.replace(/\/+$/, ''), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args.map(String)),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | null;
    if (!res.ok || !body || body.error) throw new Error(`lockout store error (${res.status})`);
    return body.result;
  }
  return {
    async claim(id) {
      const [tries, lock] = keys(id);
      const r = await cmd(['EVAL', CLAIM_LUA, 2, tries, lock]);
      if (!Array.isArray(r) || r.length !== 2) throw new Error('lockout store: bad reply');
      const n = Number(r[0]);
      const ttl = Number(r[1]);
      if (n === 0) return { ok: false, lockedUntil: now() + ttl };
      return { ok: true, tries: n };
    },
    async lock(id) {
      const [tries, lock] = keys(id);
      const ttl = Number(await cmd(['EVAL', LOCK_LUA, 2, tries, lock, LOCK_MS]));
      return now() + (ttl > 0 ? ttl : LOCK_MS);
    },
    async reset(id) {
      await cmd(['DEL', keys(id)[0]]);
    },
  };
}

// ---- choose once per process ----------------------------------------------
let chosen: LockoutStore | null = null;
export function lockoutStore(): LockoutStore {
  if (chosen) return chosen;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  chosen = url && token ? upstashStore(url, token) : memoryStore();
  return chosen;
}

// ---- words ----------------------------------------------------------------
export function lockMessage(lockedUntil: number, now: number = Date.now()): string {
  const mins = Math.max(1, Math.ceil((lockedUntil - now) / 60_000));
  return `Too many wrong tries. Try again in ${mins} ${mins === 1 ? 'minute' : 'minutes'}.`;
}

export function wrongPinMessage(left: number): string {
  return `That PIN is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`;
}
