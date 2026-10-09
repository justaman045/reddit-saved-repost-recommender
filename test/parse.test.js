import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChildren, toRatio, toNumber } from '../src/lib/parse.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/saved-synthetic.json', import.meta.url), 'utf8'),
);
const children = fixture.data.children;

test('parseChildren filters t1 comments and dedupes by name', () => {
  const posts = parseChildren(children);
  assert.equal(posts.length, 9);
  assert.ok(posts.every((p) => p.name.startsWith('t3_')));
  assert.equal(posts.filter((p) => p.name === 't3_ext1').length, 1);
});

test('parseChildren keeps HTML-ish titles as inert plain strings', () => {
  const posts = parseChildren(children);
  const html = posts.find((p) => p.name === 't3_htm1');
  assert.equal(html.title, 'Free <script>alert(1)</script> "quotes" & \'apostrophes\'');
});

test('parseChildren guards null and missing numeric fields', () => {
  const posts = parseChildren(children);
  const neg = posts.find((p) => p.name === 't3_neg1');
  assert.equal(neg.score, -15);
  assert.equal(neg.upvoteRatio, null);
  const html = posts.find((p) => p.name === 't3_htm1');
  assert.equal(html.upvoteRatio, null);
});

test('parseChildren preserves flags needed for submit classification', () => {
  const posts = parseChildren(children);
  const self = posts.find((p) => p.name === 't3_self1');
  assert.equal(self.isSelf, true);
  assert.ok(self.selftext.includes('\n'));
  const gallery = posts.find((p) => p.name === 't3_gal1');
  assert.equal(gallery.isGallery, true);
  const cross = posts.find((p) => p.name === 't3_cro1');
  assert.equal(cross.crosspostParent, 't3_orig1');
});

test('parseChildren tolerates junk input', () => {
  assert.deepEqual(parseChildren(undefined), []);
  assert.deepEqual(parseChildren(null), []);
  assert.deepEqual(parseChildren([null, {}, { kind: 't3' }, { kind: 't3', data: null }, { kind: 't2', data: {} }]), []);
});

test('toNumber and toRatio edge cases', () => {
  assert.equal(toNumber('42', 0), 42);
  assert.equal(toNumber('nope', 7), 7);
  assert.equal(toNumber(NaN, 3), 3);
  assert.equal(toNumber(Infinity, 3), 3);
  assert.equal(toRatio(0.5), 0.5);
  assert.equal(toRatio(1.5), null);
  assert.equal(toRatio(-0.1), null);
  assert.equal(toRatio('0.9'), null);
  assert.equal(toRatio(undefined), null);
});
