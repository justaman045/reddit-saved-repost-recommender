import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The content script is a classic (non-module) script; load it through a
// Function sandbox so its IIFE registers globalThis.__SRR__ for tests.
const src = readFileSync(new URL('../src/content/fetcher.js', import.meta.url), 'utf8');
const load = new Function(`${src}\n;return globalThis.__SRR__;`);
const { fetchAll, LIMITS } = load();

function fakeStore(initial = {}) {
  const data = { ...initial };
  return {
    get: async (key) => data[key],
    set: async (obj) => Object.assign(data, obj),
    data,
  };
}

function jsonResponse(obj, status = 200, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: async () => JSON.stringify(obj),
  };
}

function textResponse(text, status = 200, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: async () => text,
  };
}

function child(name) {
  return { kind: 't3', data: { name } };
}

function listing(children, after = null) {
  return { kind: 'Listing', data: { after, children } };
}

function router(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [pattern, handler] of routes) {
      if (pattern.test(url)) return handler(url);
    }
    throw new Error('unexpected url: ' + url);
  };
  fn.calls = calls;
  return fn;
}

const ME_OK = () => jsonResponse({ kind: 'DM', data: { name: 'tester', modhash: 'x' } });

test('happy path: paginates, dedupes, throttles, stores results', async () => {
  const store = fakeStore();
  const delays = [];
  const events = [];
  const fetchFn = router([
    [/api\/me\.json/, ME_OK],
    [/after=t3_p2/, () => jsonResponse(listing([child('t3_a'), child('t3_c')], 't3_p3'))],
    [/after=t3_p3/, () => jsonResponse(listing([child('t3_d')]))],
    [/saved\.json/, () => jsonResponse(listing([child('t3_a'), child('t3_b')], 't3_p2'))],
  ]);

  const res = await fetchAll({
    store,
    fetchFn,
    delayFn: async (ms) => {
      delays.push(ms);
    },
    random: () => 0.5,
    now: () => 1000000,
    onEvent: (e) => events.push(e),
    limits: { PAGE_LIMIT: 2 },
  });

  assert.deepEqual(res, { ok: true, count: 4, truncated: false });
  assert.equal(store.data.raw.length, 4);
  assert.deepEqual(store.data.raw.map((c) => c.data.name), ['t3_a', 't3_b', 't3_c', 't3_d']);
  assert.equal(store.data.meta.username, 'tester');
  assert.equal(store.data.meta.fetchedAt, 1000000);
  assert.equal(store.data.meta.count, 4);
  assert.equal(store.data.meta.pages, 3);
  assert.equal(store.data.meta.truncated, false);
  assert.equal(store.data.meta.fetching, false);
  assert.equal(store.data.meta.error, null);
  assert.equal(store.data.meta.progress, null);

  // delays: none before the first saved page, one before each later page
  assert.deepEqual(delays, [1150, 1150]);
  assert.equal(fetchFn.calls.length, 4); // me + 3 pages

  const kinds = events.map((e) => e.type);
  assert.deepEqual(kinds, ['SRR_PROGRESS', 'SRR_PROGRESS', 'SRR_PROGRESS', 'SRR_DONE']);
  assert.equal(events.at(-1).ok, true);
});

test('429 stops immediately, honors Retry-After, releases the lock', async () => {
  const store = fakeStore();
  const fetchFn = router([
    [/api\/me\.json/, ME_OK],
    [/saved\.json/, () => jsonResponse({ message: 'slow down' }, 429, { 'retry-after': '30' })],
  ]);
  const res = await fetchAll({ store, fetchFn, delayFn: async () => {}, now: () => 1000000 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'rate-limited');
  assert.equal(store.data.meta.error.kind, 'rate-limited');
  assert.equal(store.data.meta.error.retryAfterMs, 30000);
  assert.equal(store.data.meta.error.at, 1000000);
  assert.equal(store.data.meta.fetching, false);
  assert.equal(store.data.raw, undefined);
  assert.equal(fetchFn.calls.length, 2);
});

test('403 maps to a session error', async () => {
  const store = fakeStore();
  const fetchFn = router([
    [/api\/me\.json/, ME_OK],
    [/saved\.json/, () => jsonResponse({}, 403)],
  ]);
  const res = await fetchAll({ store, fetchFn, delayFn: async () => {} });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'session');
  assert.equal(store.data.meta.fetching, false);
});

test('200 HTML (challenge page) maps to blocked, never fake success', async () => {
  const store = fakeStore();
  const fetchFn = router([
    [/api\/me\.json/, ME_OK],
    [/saved\.json/, () => textResponse('<html><body>blocked</body></html>')],
  ]);
  const res = await fetchAll({ store, fetchFn, delayFn: async () => {} });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'blocked');
  assert.equal(store.data.raw, undefined);
});

test('logged-out /api/me.json maps to not-logged-in', async () => {
  const store = fakeStore();
  const fetchFn = router([[/api\/me\.json/, () => jsonResponse({ kind: 'DM', data: { user: null } })]]);
  const res = await fetchAll({ store, fetchFn, delayFn: async () => {} });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not-logged-in');
  assert.equal(store.data.meta.fetching, false);
});

test('network failure maps to network error', async () => {
  const store = fakeStore();
  const fetchFn = async () => {
    throw new Error('offline');
  };
  const res = await fetchAll({ store, fetchFn, delayFn: async () => {} });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'network');
});

test('fresh lock refuses a second run without touching the network', async () => {
  const store = fakeStore({ meta: { fetching: true, fetchStartedAt: 1000000 } });
  let called = 0;
  const fetchFn = async () => {
    called += 1;
    return ME_OK();
  };
  const res = await fetchAll({ store, fetchFn, delayFn: async () => {}, now: () => 1000500 });
  assert.deepEqual(res, { ok: false, reason: 'busy' });
  assert.equal(called, 0);
  assert.deepEqual(store.data.meta, { fetching: true, fetchStartedAt: 1000000 }, 'meta must be untouched');
});

test('stale lock (crashed run) is taken over', async () => {
  const store = fakeStore({ meta: { fetching: true, fetchStartedAt: 1000000 } });
  const fetchFn = router([
    [/api\/me\.json/, ME_OK],
    [/saved\.json/, () => jsonResponse(listing([child('t3_a')]))],
  ]);
  const res = await fetchAll({ store, fetchFn, delayFn: async () => {}, now: () => 1000000 + 120001 });
  assert.equal(res.ok, true);
  assert.equal(store.data.meta.fetching, false);
});

test('stops at MAX_PAGES and flags truncation', async () => {
  const store = fakeStore();
  let page = 0;
  const fetchFn = router([
    [/api\/me\.json/, ME_OK],
    [
      /saved\.json/,
      () => {
        page += 1;
        return jsonResponse(listing([child('t3_p' + page)], 't3_cont' + page));
      },
    ],
  ]);
  const res = await fetchAll({ store, fetchFn, delayFn: async () => {}, limits: { MAX_PAGES: 2, PAGE_LIMIT: 1 } });
  assert.equal(res.ok, true);
  assert.equal(res.truncated, true);
  assert.equal(store.data.meta.pages, 2);
  assert.equal(store.data.meta.truncated, true);
  assert.equal(store.data.raw.length, 2);
});

test('empty first page yields an empty successful fetch', async () => {
  const store = fakeStore();
  const fetchFn = router([
    [/api\/me\.json/, ME_OK],
    [/saved\.json/, () => jsonResponse(listing([]))],
  ]);
  const res = await fetchAll({ store, fetchFn, delayFn: async () => {} });
  assert.deepEqual(res, { ok: true, count: 0, truncated: false });
  assert.equal(store.data.raw.length, 0);
});

test('exposes the same LIMITS as documented', () => {
  assert.equal(LIMITS.DELAY_MIN_MS, 900);
  assert.equal(LIMITS.DELAY_JITTER_MS, 500);
  assert.equal(LIMITS.MAX_PAGES, 12);
  assert.equal(LIMITS.PAGE_LIMIT, 100);
  assert.equal(LIMITS.LOCK_STALE_MS, 120000);
});
