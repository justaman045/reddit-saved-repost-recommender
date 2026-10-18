import test from 'node:test';
import assert from 'node:assert/strict';
import { exportJSON, exportCSV } from '../src/lib/export.js';

test('exportJSON includes fields', () => {
  const s = exportJSON([{name:'t3_a', title:'t', subreddit:'r', domain:'d', score:10, upvoteRatio:0.9, numComments:1, createdUtc:1700000000, permalink:'/r/t', url:'http://x', contentKey:'k'}]);
  const j = JSON.parse(s);
  assert.ok(j.items[0].submitted_matched === false);
});

test('exportCSV escapes commas', () => {
  const csv = exportCSV([{title:'a,b', score:1}]);
  assert.ok(csv.includes('"a,b"'));
});

test('exportCSV computes age_days from the provided nowMs', () => {
  const created = 1700000000;
  const nowMs = (created + 86400) * 1000; // exactly one day later
  const csv = exportCSV([{ title: 't', createdUtc: created }], {}, nowMs);
  const row = csv.split('\r\n')[1].split(',');
  assert.equal(row[7], '1', 'age_days column must use nowMs, not Date.now()');
});

test('exportJSON includes username metadata when provided', () => {
  const j = JSON.parse(exportJSON([], { username: 'tester' }, 123));
  assert.equal(j.meta.username, 'tester');
  assert.equal(j.exportedAt, 123);
});
