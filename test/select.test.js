import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyFilters, queueSets, getFiltered, BASE_DISPLAY_LIMIT } from '../src/lib/select.js';
import { contentKey } from '../src/lib/submit.js';
import { parseChildren } from '../src/lib/parse.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/saved-synthetic.json', import.meta.url), 'utf8'),
);
const posts = parseChildren(fixture.data.children);

test('applyFilters with default opts keeps everything', () => {
  assert.equal(applyFilters(posts, {}).length, posts.length);
});

test('applyFilters minScore', () => {
  const out = applyFilters(posts, { minScore: 1000 });
  assert.ok(out.every((p) => p.score >= 1000));
  assert.ok(out.length < posts.length);
});

test('applyFilters subreddit is case-insensitive', () => {
  const out = applyFilters(posts, { subreddit: 'PICS' });
  assert.deepEqual(out.map((p) => p.name).sort(), ['t3_gal1', 't3_img1']);
});

test('applyFilters hideQueued by name and by content key', () => {
  const queue = { t3_ext1: { queuedAt: 1, contentKey: 'https://example.com/article' } };
  const { queuedNames, queuedKeys } = queueSets(queue);
  const out = applyFilters(posts, { hideQueued: true, queuedNames, queuedKeys });
  assert.ok(!out.some((p) => p.name === 't3_ext1'));
  // A second saved copy with the same content URL must also hide.
  const duplicate = { ...posts.find((p) => p.name === 't3_low1'), url: 'https://example.com/article' };
  const out2 = applyFilters([...posts, duplicate], { hideQueued: true, queuedNames, queuedKeys });
  assert.ok(!out2.some((p) => p.name === 't3_low1' && p.url === 'https://example.com/article'));
});

test('applyFilters prefillOnly drops self posts', () => {
  const out = applyFilters(posts, { prefillOnly: true });
  assert.ok(!out.some((p) => p.name === 't3_self1'));
  assert.ok(out.some((p) => p.name === 't3_ext1'));
});

test('applyFilters combines criteria', () => {
  const out = applyFilters(posts, { minScore: 100, subreddit: 'pics', prefillOnly: true });
  assert.deepEqual(out.map((p) => p.name), ['t3_img1', 't3_gal1']);
});

test('queueSets builds names and keys', () => {
  const { queuedNames, queuedKeys } = queueSets({
    t3_a: { queuedAt: 5, contentKey: 'https://x.test/a' },
    t3_b: { queuedAt: 6, contentKey: 'https://x.test/b' },
  });
  assert.deepEqual([...queuedNames].sort(), ['t3_a', 't3_b']);
  assert.deepEqual([...queuedKeys].sort(), ['https://x.test/a', 'https://x.test/b']);
  const empty = queueSets(undefined);
  assert.equal(empty.queuedNames.size, 0);
});
test("filters by domain", () => {
  const posts = [
    { name: "t3_a", subreddit: "s", domain: "example.com", score: 1, contentKey: "c1" },
    { name: "t3_b", subreddit: "s", domain: "other.com", score: 1, contentKey: "c2" },
  ];
  const res = applyFilters(posts, { domain: "example.com" });
  assert.equal(res.length, 1);
  assert.equal(res[0].name, "t3_a");
});

function stateOf(overrides = {}) {
  return {
    posts,
    filters: { minScore: 0, subreddit: '', hideQueued: false, prefillOnly: false, hideSubmitted: false },
    queue: {},
    submitted: [],
    displayLimit: BASE_DISPLAY_LIMIT,
    ...overrides,
  };
}

test('getFiltered ranks by score desc and attaches contentKey to every post', () => {
  const { ranked, filtered, shown } = getFiltered(stateOf());
  assert.equal(ranked.length, posts.length);
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].scoreInfo.total >= ranked[i].scoreInfo.total, 'must sort by total desc');
  }
  assert.ok(filtered.every((p) => typeof p.contentKey === 'string' && p.contentKey.length > 0));
  assert.ok(shown.every((p) => typeof p.contentKey === 'string' && p.contentKey.length > 0));
});

test('getFiltered displayLimit slices shown but not filtered', () => {
  const { filtered, shown, limit } = getFiltered(stateOf({ displayLimit: 2 }));
  assert.equal(limit, 2);
  assert.equal(shown.length, 2);
  assert.ok(filtered.length > 2);
});

test('getFiltered defaults a missing displayLimit to the base', () => {
  const { limit } = getFiltered({ posts, filters: {}, queue: {}, submitted: [] });
  assert.equal(limit, BASE_DISPLAY_LIMIT);
});

test('getFiltered hideQueued drops queued posts by name', () => {
  const first = posts[0].name;
  const { filtered, sets } = getFiltered(stateOf({ filters: { hideQueued: true }, queue: { [first]: { queuedAt: 1 } } }));
  assert.ok(sets.queuedNames.has(first));
  assert.ok(!filtered.some((p) => p.name === first));
});

test('getFiltered attaches submittedMatch so the badge and export can see it', () => {
  const target = posts.find((p) => p.url && p.url.startsWith('http')) || posts[0];
  const submitted = [{ name: 't3_sub1', title: 'mine', permalink: '/r/x/comments/1/', url: target.url }];
  submitted[0].contentKey = contentKey(submitted[0]);
  const { filtered } = getFiltered(stateOf({ submitted }));
  const match = filtered.find((p) => p.name === target.name);
  assert.ok(match, 'post must be present');
  assert.ok(match.submittedMatch, 'submittedMatch must be attached for the badge/export');
  assert.equal(match.submittedMatch.name, 't3_sub1');
});
