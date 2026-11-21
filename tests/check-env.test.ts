// The pre-build check, run the way `npm run build` runs it.
//
// PR #33 moved sign-in onto accounts in Postgres, and the production server had
// no DATABASE_URL. The build was green, the deploy was READY, and every sign-up
// and sign-in answered 503 - with every page behind sign-in, that is the whole
// app. These pin the rule that would have stopped that deploy at the build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(import.meta.dirname, '..', 'scripts', 'check-env.js');
const DB = 'postgresql://app_user:s3cr3t-db-pass@ep-example.aws.neon.tech/app';
const SECRET = 'a-very-long-random-session-secret-value';

function run(env: Record<string, string>) {
  // An empty directory, so no developer's .env.local leaks into the result.
  const cwd = mkdtempSync(join(tmpdir(), 'check-env-'));
  const r = spawnSync(process.execPath, [SCRIPT], {
    cwd,
    // Only what is listed: the runner's own environment must not decide the result.
    env: { ...env, NODE_ENV: 'production', PATH: process.env.PATH ?? '' },
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('a production build without a database is refused, and says why', () => {
  const r = run({ VERCEL_ENV: 'production', APP_PIN_HASH: 'salt:hash' });
  assert.equal(r.code, 1);
  assert.match(r.out, /DATABASE_URL/);
  assert.match(r.out, /nobody can sign in/i);
});

test('a production build without a session secret is refused', () => {
  const r = run({ VERCEL_ENV: 'production', DATABASE_URL: DB });
  assert.equal(r.code, 1);
  assert.match(r.out, /SESSION_SECRET/);
});

test('a production build with both passes', () => {
  assert.equal(run({ VERCEL_ENV: 'production', DATABASE_URL: DB, SESSION_SECRET: SECRET }).code, 0);
});

test('the names the route also accepts count: POSTGRES_URL and APP_PIN_HASH', () => {
  assert.equal(run({ VERCEL_ENV: 'production', POSTGRES_URL: DB, APP_PIN_HASH: 'salt:hash' }).code, 0);
});

test('a blank value is not a value', () => {
  assert.equal(run({ VERCEL_ENV: 'production', DATABASE_URL: '   ', SESSION_SECRET: SECRET }).code, 1);
});

test('a blank preferred name is not rescued by its alias, because the server does not rescue it either', () => {
  // users.ts and session.ts read `A || B` and trim afterwards: a whitespace-only
  // A is truthy, wins, and trims to nothing. The check has to agree with them.
  assert.equal(run({ VERCEL_ENV: 'production', DATABASE_URL: '   ', POSTGRES_URL: DB, SESSION_SECRET: SECRET }).code, 1);
  assert.equal(run({ VERCEL_ENV: 'production', DATABASE_URL: DB, SESSION_SECRET: ' ', APP_PIN_HASH: 'salt:hash' }).code, 1);
});

test('outside a production deploy it warns and lets the build through', () => {
  const cases: Record<string, string>[] = [{}, { VERCEL_ENV: 'preview' }, { CI: 'true' }];
  for (const env of cases) {
    const r = run(env);
    assert.equal(r.code, 0, JSON.stringify(env));
    assert.match(r.out, /DATABASE_URL/);
  }
});

test('the connection string and the secret never reach the build log', () => {
  const r = run({ VERCEL_ENV: 'production', DATABASE_URL: DB, SESSION_SECRET: SECRET });
  assert.ok(!r.out.includes('s3cr3t-db-pass'));
  assert.ok(!r.out.includes('ep-example'));
  assert.ok(!r.out.includes(SECRET.slice(0, 8)));
});
