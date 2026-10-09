import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubmitted, submittedIndex } from '../src/lib/submitted.js';

const children = [
  {
    kind: 't3',
    data: {
      name: 't3_a',
      title: 'My external',
      permalink: '/r/test/a/',
      url: 'https://example.com/thing?utm_source=x',
      domain: 'example.com',
      created_utc: 1700000000,
      is_self: false,
    },
  },
  {
    kind: 't3',
    data: {
      name: 't3_s',
      title: 'My self',
      permalink: '/r/test/s/',
      url: 'https://www.reddit.com/r/test/s/',
      domain: 'self.test',
      created_utc: 1700001000,
      is_self: true,
    },
  },
  {
    kind: 't1',
    data: { name: 't1_c', body: 'skip' },
  },
  {
    kind: 't3',
    data: {
      name: 't3_a',
      title: 'dup',
      permalink: '/r/test/a/',
      url: 'https://example.com/thing',
    },
  },
];

test('parseSubmitted filters comments, dedupes, computes contentKey', () => {
  const list = parseSubmitted(children);
  assert.equal(list.length, 2);
  assert.equal(list[0].name, 't3_a');
  assert.equal(list[0].contentKey, 'https://example.com/thing');
  assert.equal(list[1].name, 't3_s');
  assert.ok(list[1].contentKey.includes('/r/test/s/'));
});

test('submittedIndex builds sets/maps', () => {
  const list = parseSubmitted(children);
  const idx = submittedIndex(list);
  assert.equal(idx.keys.size, 2);
  assert.ok(idx.byKey.has('https://example.com/thing'));
});
