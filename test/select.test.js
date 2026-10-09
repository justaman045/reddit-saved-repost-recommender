import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyFilters, queueSets } from '../src/lib/select.js';
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
