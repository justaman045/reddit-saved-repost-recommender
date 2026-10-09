import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNote, mergeNotes, filterByTag } from '../src/lib/notes.js';

test('normalizeNote trims and caps length/tags', () => {
  const n = normalizeNote({ note: '  hi\nworld  ', tags: ['a', 'B', 'b', 'c'].concat(Array(10).fill('x')) });
  assert.equal(n.note, 'hi\nworld');
  assert.equal(n.tags.length <= 8, true);
});

test('mergeNotes keeps newer updatedAt', () => {
  const res = mergeNotes({ a: { note: 'old', updatedAt: 1 } }, { a: { note: 'new', updatedAt: 2 } });
  assert.equal(res.a.note, 'new');
});

test('filterByTag matches case-insensitive', () => {
  const res = filterByTag({ n1: { tags: ['Top'] } }, ['n1', 'n2'], 'top');
  assert.deepEqual(res, ['n1']);
});
