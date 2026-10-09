import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scorePost, rankPosts, normalizedWeights } from '../src/lib/score.js';
import { parseChildren } from '../src/lib/parse.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/saved-synthetic.json', import.meta.url), 'utf8'),
);
const NOW = 1700000000000;

const basePost = {
  name: 't3_x',
  score: 1000,
  numComments: 100,
  upvoteRatio: 0.9,
  createdUtc: NOW / 1000 - 86400,
};

test('scorePost is deterministic', () => {
  const a = scorePost(basePost, { now: NOW });
  const b = scorePost(basePost, { now: NOW });
  assert.deepEqual(a, b);
});

test('scorePost never produces NaN for hostile inputs', () => {
  const hostile = [
    { name: 't3_a', score: -100000, numComments: -5, upvoteRatio: null, createdUtc: 0 },
    { name: 't3_b', score: 0, numComments: 0, upvoteRatio: undefined, createdUtc: NaN },
    { name: 't3_c', score: 1e15, numComments: 1e15, upvoteRatio: 1, createdUtc: NOW / 1000 },
  ];
  for (const post of hostile) {
    const s = scorePost(post, { now: NOW });
    assert.ok(Number.isFinite(s.total), `total not finite for ${post.name}`);
    assert.ok(Number.isFinite(s.parts.score));
    assert.ok(Number.isFinite(s.parts.recency));
    assert.ok(s.total >= 0 && s.total <= 100);
  }
});

test('missing upvote ratio is flagged and treated as neutral', () => {
  const s = scorePost({ ...basePost, upvoteRatio: null }, { now: NOW });
  assert.equal(s.ratioMissing, true);
  assert.equal(s.parts.ratio, 0.5);
  const s2 = scorePost(basePost, { now: NOW });
  assert.equal(s2.ratioMissing, false);
});

test('higher engagement scores higher', () => {
  const low = scorePost({ ...basePost, score: 10, numComments: 1 }, { now: NOW });
  const high = scorePost({ ...basePost, score: 50000, numComments: 5000 }, { now: NOW });
  assert.ok(high.total > low.total);
});

test('custom weights are normalized and honored', () => {
  const onlyScore = scorePost(basePost, { now: NOW, weights: { score: 1, comments: 0, ratio: 0, recency: 0 } });
  const w = normalizedWeights({ score: 1, comments: 0, ratio: 0, recency: 0 });
  const expected = 100 * w.score * Math.min(1, Math.log10(1001) / 6);
  assert.ok(Math.abs(onlyScore.total - expected) < 1e-9);
  const invalid = normalizedWeights({ score: -1, comments: NaN, ratio: 0, recency: 0 });
  assert.ok(Number.isFinite(invalid.score + invalid.comments + invalid.ratio + invalid.recency));
  const sum = invalid.score + invalid.comments + invalid.ratio + invalid.recency;
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('zero-sum weights fall back to defaults', () => {
  const w = normalizedWeights({ score: 0, comments: 0, ratio: 0, recency: 0 });
  assert.deepEqual(w, { score: 0.5, comments: 0.2, ratio: 0.2, recency: 0.1 });
});

test('rankPosts orders by total with stable name tie-break', () => {
  const now = NOW;
  const posts = [
    { name: 't3_b', score: 100, numComments: 10, upvoteRatio: 0.9, createdUtc: now / 1000 - 1000 },
    { name: 't3_a', score: 100, numComments: 10, upvoteRatio: 0.9, createdUtc: now / 1000 - 1000 },
    { name: 't3_c', score: 50000, numComments: 10, upvoteRatio: 0.9, createdUtc: now / 1000 - 1000 },
  ];
  const ranked = rankPosts(posts, { now });
  assert.equal(ranked[0].name, 't3_c');
  assert.equal(ranked[1].name, 't3_a');
  assert.equal(ranked[2].name, 't3_b');
  const again = rankPosts(posts, { now });
  assert.deepEqual(ranked.map((p) => p.name), again.map((p) => p.name));
});

test('fixture ranking: the most engaging post wins and nothing is NaN', () => {
  const posts = parseChildren(fixture.data.children);
  const ranked = rankPosts(posts, { now: NOW });
  assert.equal(ranked.length, 9);
  assert.equal(ranked[0].name, 't3_ext1');
  assert.ok(ranked.every((p) => Number.isFinite(p.scoreInfo.total)));
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].scoreInfo.total >= ranked[i].scoreInfo.total, 'sorted desc');
  }
});
