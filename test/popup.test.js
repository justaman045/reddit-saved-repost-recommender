import test from 'node:test';
import assert from 'node:assert/strict';
import { isRedditUrl, refreshEnabled, fetchNote, isFetchingLive, ERROR_MESSAGES } from '../src/popup/popup.js';
import { FETCH } from '../src/lib/limits.js';

test('importing popup.js has no side effects without a document', () => {
  // Reaching this line means the module evaluated cleanly in Node.
  assert.equal(typeof isRedditUrl, 'function');
});

test('isRedditUrl only accepts real reddit.com hosts', () => {
  assert.equal(isRedditUrl('https://www.reddit.com/r/programming/'), true);
  assert.equal(isRedditUrl('https://old.reddit.com/'), true);
  assert.equal(isRedditUrl('https://sh.reddit.com/'), true);
  assert.equal(isRedditUrl('https://reddit.com/'), true);
  assert.equal(isRedditUrl('http://www.reddit.com/'), true);
  assert.equal(isRedditUrl('https://reddit.com.evil.example/'), false);
  assert.equal(isRedditUrl('https://evilreddit.com/'), false);
  assert.equal(isRedditUrl('https://notreddit.com/'), false);
  assert.equal(isRedditUrl('https://example.com/'), false);
  assert.equal(isRedditUrl('chrome-extension://abcdef/popup.html'), false);
  assert.equal(isRedditUrl(undefined), false);
  assert.equal(isRedditUrl(null), false);
});

test('refreshEnabled enforces the floor and rate-limit backoff', () => {
  const now = Date.now();
  // Only a LIVE fetch blocks; a stale/interrupted one recovers like the fetcher does.
  assert.equal(refreshEnabled({ fetching: true, fetchStartedAt: now }), false);
  assert.equal(refreshEnabled({}), true);
  assert.equal(refreshEnabled({ fetching: true }), true, 'corrupt lock (no fetchStartedAt) recovers');
  assert.equal(
    refreshEnabled({ fetching: true, fetchStartedAt: now - FETCH.LOCK_STALE_MS - 1 }),
    true,
    'interrupted fetch recovers after the stale window',
  );
  assert.equal(refreshEnabled({ fetchedAt: now }), false);
  assert.equal(refreshEnabled({ fetchedAt: now - FETCH.REFRESH_FLOOR_MS - 1 }), true);
  assert.equal(
    refreshEnabled({
      fetchedAt: now - FETCH.REFRESH_FLOOR_MS - 1,
      error: { kind: 'rate-limited', at: now, retryAfterMs: 60000 },
    }),
    false,
  );
  assert.equal(
    refreshEnabled({
      error: { kind: 'rate-limited', at: now - 120000, retryAfterMs: 60000 },
    }),
    true,
  );
  // Non-rate-limit errors allow an immediate retry.
  assert.equal(refreshEnabled({ fetchedAt: now, error: { kind: 'network', at: now } }), true);
});

test('isFetchingLive only trusts locks that can still be running', () => {
  const now = Date.now();
  assert.equal(isFetchingLive(undefined), false);
  assert.equal(isFetchingLive({}), false);
  assert.equal(isFetchingLive({ fetching: false, fetchStartedAt: now }), false);
  assert.equal(isFetchingLive({ fetching: true, fetchStartedAt: now }), true);
  assert.equal(isFetchingLive({ fetching: true }), false, 'no fetchStartedAt means a corrupt lock');
  assert.equal(isFetchingLive({ fetching: true, fetchStartedAt: now - FETCH.LOCK_STALE_MS - 1 }), false);
});

test('fetchNote describes state without throwing', () => {
  assert.equal(fetchNote({}), 'Not fetched yet.');
  assert.equal(fetchNote({ fetching: true, fetchStartedAt: Date.now() }), 'Fetching…');
  // An interrupted fetch must not claim to be fetching forever.
  assert.equal(
    fetchNote({ fetching: true, fetchStartedAt: Date.now() - FETCH.LOCK_STALE_MS - 1 }),
    'Not fetched yet.',
  );
  // Within the floor the note explains when the button unlocks again.
  assert.equal(fetchNote({ fetchedAt: Date.now() }), 'Fetched just now. Refresh in 10m.');
  assert.match(
    fetchNote({ fetchedAt: Date.now() - 5 * 60000 }),
    /^Fetched 5m ago\. Refresh in 5m\.$/,
  );
  assert.match(fetchNote({ fetchedAt: Date.now() - 3 * 3600000 }), /^Fetched 3h ago\.$/);
  // Rate-limit backoff is explained too.
  assert.match(
    fetchNote({
      fetchedAt: Date.now() - 3 * 3600000,
      error: { kind: 'rate-limited', at: Date.now(), retryAfterMs: 90000 },
    }),
    /^Fetched 3h ago\. Rate-limited — retry in 2m\.$/,
  );
});

test('every fetcher error kind has user-facing copy', () => {
  for (const kind of ['not-logged-in', 'rate-limited', 'session', 'blocked', 'network', 'http', 'unknown']) {
    assert.ok(ERROR_MESSAGES[kind], `missing message for ${kind}`);
  }
});
