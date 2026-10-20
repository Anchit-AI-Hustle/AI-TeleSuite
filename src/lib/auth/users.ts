// Accounts: one per mobile number, each with its own 4-digit PIN.
//
// WHY POSTGRES AND NOT FIRESTORE
//   `firebase` and `firebase-admin` are in package.json, and firestore.rules
//   exists, but nothing in src/ actually talks to Firestore: the one module
//   that claimed to (activity-log-server.ts) is a deprecated stub that logs to
//   the console, and the voiceAgent files carry TODOs rather than calls. So
//   "use Firestore" would have meant standing up a service account and rules
//   from nothing. Neon is one connection string, has a free tier, and the
//   phone-and-PIN sign-in this is ported from already runs on it - so the
//   schema and the queries are proven rather than invented.
//
// WHAT IS STORED
//   The number in E.164, a display name, and the scrypt salt and hash of the
//   PIN. Never the PIN. A copy of this table is not a set of working logins:
//   each PIN still costs a scrypt derivation per guess, and the per-number
//   lockout in lockout.ts caps how fast guesses can be made at all.
import { neon } from '@neondatabase/serverless';
import { hashPin, verifyPin, type PinHash } from './pin';

export type User = {
  id: string;
  phone: string;
  name: string | null;
  createdAt: string;
};

export type UserRow = User & { pinSalt: string; pinHash: string };

/** The connection string, or null when accounts are not configured. */
export function databaseUrl(): string | null {
  const v = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  return v && v.trim() ? v.trim() : null;
}

function sql() {
  const url = databaseUrl();
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url);
}

// Created on demand rather than by a migration step, because this app deploys
// straight from a push with no migrate stage to hang one on. It is cheap and
// idempotent; Postgres does nothing when the table is already there.
let schemaReady: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const q = sql();
      await q`
        create table if not exists auth_users (
          id          uuid primary key default gen_random_uuid(),
          phone       text not null,
          name        text,
          pin_salt    text not null,
          pin_hash    text not null,
          created_at  timestamptz not null default now(),
          updated_at  timestamptz not null default now()
        )
      `;
      // One account per number, and the uniqueness is the database's job, not
      // the route handler's: two sign-ups racing on the same number must not
      // both succeed.
      await q`create unique index if not exists auth_users_phone_key on auth_users (phone)`;
    })().catch((e) => {
      // Do not cache a failure, or one cold start with the database asleep
      // breaks sign-in until the instance is recycled.
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

/** A text column is a string or null. Anything else is a row we do not trust. */
function text(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function toRow(r: Record<string, unknown>): UserRow {
  return {
    id: String(r.id),
    phone: String(r.phone),
    name: text(r.name),
    createdAt: String(r.created_at),
    pinSalt: String(r.pin_salt),
    pinHash: String(r.pin_hash),
  };
}

export async function findByPhone(e164: string): Promise<UserRow | null> {
  await ensureSchema();
  const q = sql();
  const rows = (await q`
    select id, phone, name, pin_salt, pin_hash, created_at
    from auth_users where phone = ${e164} limit 1
  `) as Record<string, unknown>[];
  return rows.length ? toRow(rows[0]) : null;
}

export async function findById(id: string): Promise<User | null> {
  // Guard the shape before it reaches the query: an id out of a cookie is
  // attacker-controlled input.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  await ensureSchema();
  const q = sql();
  const rows = (await q`
    select id, phone, name, created_at from auth_users where id = ${id} limit 1
  `) as Record<string, unknown>[];
  if (!rows.length) return null;
  const r = rows[0];
  return { id: String(r.id), phone: String(r.phone), name: text(r.name), createdAt: String(r.created_at) };
}

/**
 * Create an account. Returns null when the number is already taken, which the
 * unique index decides rather than a read-then-write that two requests can
 * both pass.
 */
export async function createUser(e164: string, pin: string, name?: string | null): Promise<User | null> {
  await ensureSchema();
  const { salt, hash }: PinHash = await hashPin(pin);
  const q = sql();
  const rows = (await q`
    insert into auth_users (phone, name, pin_salt, pin_hash)
    values (${e164}, ${name ?? null}, ${salt}, ${hash})
    on conflict (phone) do nothing
    returning id, phone, name, created_at
  `) as Record<string, unknown>[];
  if (!rows.length) return null;
  const r = rows[0];
  return { id: String(r.id), phone: String(r.phone), name: text(r.name), createdAt: String(r.created_at) };
}

/** Check a PIN against the stored hash. Constant-time inside verifyPin. */
export async function checkPin(row: UserRow, pin: string): Promise<boolean> {
  return verifyPin(pin, { salt: row.pinSalt, hash: row.pinHash });
}

export async function setPin(id: string, pin: string): Promise<void> {
  await ensureSchema();
  const { salt, hash } = await hashPin(pin);
  const q = sql();
  await q`update auth_users set pin_salt = ${salt}, pin_hash = ${hash}, updated_at = now() where id = ${id}`;
}
