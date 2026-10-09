import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FETCH } from '../src/lib/limits.js';

// src/content/fetcher.js cannot import limits.js (it is a classic script),
// so it carries a copy. This test fails if the copies ever drift.

const src = readFileSync(new URL('../src/content/fetcher.js', import.meta.url), 'utf8');
const match = src.match(/const LIMITS = \{([\s\S]*?)\};/);
assert.ok(match, 'fetcher LIMITS block not found');

const fetcherLimits = Object.fromEntries(
  [...match[1].matchAll(/([A-Z_]+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]),
);

test('fetcher LIMITS keys are exactly the shared fetch limits', () => {
  assert.deepEqual(Object.keys(fetcherLimits).sort(), [
    'DELAY_JITTER_MS',
    'DELAY_MIN_MS',
    'LOCK_STALE_MS',
    'MAX_PAGES',
    'PAGE_LIMIT',
  ]);
});

test('fetcher LIMITS matches src/lib/limits.js FETCH', () => {
  for (const [key, value] of Object.entries(fetcherLimits)) {
    assert.equal(value, FETCH[key], `${key} differs between fetcher.js and limits.js`);
  }
});
