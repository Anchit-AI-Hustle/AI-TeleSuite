// The public demo must never show, change or delete a real person's work.
// These pin the two ways it could: reading the real activity log while in the
// demo, and deleting real records when the demo ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DEMO_PREFIX, isDemoCookie, storageKeyFor } from '../src/lib/demo.ts';

const REAL = 'aiTeleSuiteActivityLog';
const seed = readFileSync(new URL('../public/demo-seed.js', import.meta.url), 'utf8');

function browser(cookie: string, initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  const attrs: Record<string, string> = {};
  const window: Record<string, unknown> = {};
  const ctx = { window, localStorage, document: { cookie, documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } } };
  vm.runInNewContext(seed, ctx);
  return { store, attrs };
}

test('the demo cookie is recognised exactly', () => {
  assert.equal(isDemoCookie('ats_demo=1'), true);
  assert.equal(isDemoCookie('a=b; ats_demo=1; c=d'), true);
  assert.equal(isDemoCookie('xats_demo=1'), false);
  assert.equal(isDemoCookie('ats_demo=10'), false);
  assert.equal(isDemoCookie(''), false);
});

test('in the demo every stored key is namespaced, outside it none is', () => {
  assert.equal(storageKeyFor(REAL, 'ats_demo=1'), DEMO_PREFIX + REAL);
  assert.equal(storageKeyFor(REAL, ''), REAL);
  assert.equal(storageKeyFor('aiTeleSuiteKnowledgeBase_v5_with_data_uri', 'ats_demo=1'), DEMO_PREFIX + 'aiTeleSuiteKnowledgeBase_v5_with_data_uri');
});

test('a demo visitor on a browser with real history gets sample calls and the real log is untouched', () => {
  const real = JSON.stringify([{ id: 'real-1', module: 'Call Scoring' }]);
  const { store, attrs } = browser('ats_demo=1', { [REAL]: real });
  assert.equal(store.get(REAL), real);
  const demo = JSON.parse(store.get(DEMO_PREFIX + REAL)!);
  assert.ok(demo.length >= 8);
  assert.ok(demo.every((a: { id: string }) => a.id.startsWith('demo-')));
  assert.equal(attrs['data-demo'], '1');
});

test('when the demo ends only demo data is removed; real records survive', () => {
  const real = JSON.stringify([{ id: 'real-1' }, { id: 'real-2' }]);
  const { store } = browser('', { [REAL]: real, [DEMO_PREFIX + REAL]: '[{"id":"demo-01"}]', [DEMO_PREFIX + 'other']: '1', aiTeleSuiteDemoSeeded: '1' });
  assert.equal(store.get(REAL), real);
  assert.equal([...store.keys()].some((k) => k.startsWith(DEMO_PREFIX)), false);
});

test('a visitor who was never in the demo is left alone', () => {
  const { store } = browser('', { [REAL]: '[]' });
  assert.deepEqual([...store.keys()], [REAL]);
});
