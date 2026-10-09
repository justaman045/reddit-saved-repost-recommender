import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  buildRow,
  renderRows,
  formatScore,
  formatRatio,
  formatAge,
  formatParts,
  safeExternalHref,
} from '../src/lib/render.js';

const BASE_POST = {
  name: 't3_xyz',
  title: 'Test post',
  subreddit: 'test',
  domain: 'example.com',
  url: 'https://example.com/article',
  permalink: '/r/test/comments/xyz/test_post/',
  score: 123,
  upvoteRatio: 0.87,
  numComments: 45,
  createdUtc: Math.floor(Date.now() / 1000) - 3600,
};

function makeItem(overrides = {}) {
  const post = { ...BASE_POST, ...(overrides.post || {}) };
  return {
    post,
    rank: 1,
    scoreInfo: {
      total: 42.5,
      parts: { score: 0.4, comments: 0.2, ratio: 0.2, recency: 0.1 },
    },
    actions: {
      onRepost: () => {},
      ...(overrides.actions || {}),
    },
    queued: false,
    ...overrides,
  };
}

test('buildRow renders a post without any innerHTML or element injection', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const doc = dom.window.document;
  const item = makeItem();
  const row = buildRow(item, doc);
  assert.equal(row.tagName, 'ARTICLE');
  const html = doc.body.innerHTML;
  assert.ok(!html.includes('<script'), html);
  assert.ok(!html.includes('innerHTML'), html);
  assert.ok(!html.includes('outerHTML'), html);
  assert.ok(!html.includes('setAttribute(\'innerHTML\')'), html);
});

test('buildRow shows ranking, score breakdown, and n/a ratio', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const doc = dom.window.document;
  const item = makeItem({
    post: { ...BASE_POST, upvoteRatio: NaN },
    scoreInfo: { total: 10, parts: { score: 1, comments: 0, ratio: 0, recency: -0.1 } },
  });
  item.scoreInfo.ratioMissing = true;
  const row = buildRow(item, doc);
  assert.equal(row.querySelector('.srr-rank')?.textContent, '#1');
  assert.ok(row.querySelector('.srr-denom')?.textContent.includes('/100'));
  assert.ok(row.querySelector('.srr-parts')?.textContent.includes('score'));
  assert.ok(row.querySelector('.srr-na')?.textContent.includes('ratio missing'));
  assert.equal(row.querySelector('.srr-ratio')?.textContent, 'ratio n/a');
});

test('renderRows clears the container and renders one row per item', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="c"></div></body></html>');
  const doc = dom.window.document;
  const c = doc.getElementById('c');
  c.innerHTML = '<span>old</span>';
  const items = [makeItem(), makeItem({ rank: 2 })];
  renderRows(c, items, doc);
  assert.equal(c.textContent.includes('old'), false);
  assert.equal(c.querySelectorAll('article').length, 2);
});

test('buttons fire their callbacks', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const doc = dom.window.document;
  let reposted = 0;
  let queued = 0;
  const item = makeItem({
    actions: {
      onRepost: () => { reposted++; },
      onToggleQueue: () => { queued++; },
    },
  });
  const row = buildRow(item, doc);
  row.querySelector('.srr-repost')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  row.querySelector('.srr-queue')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(reposted, 1);
  assert.equal(queued, 1);
});

test('queued item shows Unqueue label', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const doc = dom.window.document;
  const item = makeItem({
    queued: true,
    actions: { onRepost: () => {}, onToggleQueue: () => {} },
  });
  const row = buildRow(item, doc);
  assert.equal(row.querySelector('.srr-queue')?.textContent, 'Unqueue');
});

test('external links are only ever http(s)', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const doc = dom.window.document;
  const bad = makeItem({ post: { ...BASE_POST, url: 'javascript:alert(1)' } });
  const good = makeItem({ post: { ...BASE_POST, url: 'https://example.org' } });
  const badRow = buildRow(bad, doc);
  const goodRow = buildRow(good, doc);
  const openBad = badRow.querySelector('.srr-open');
  const openGood = goodRow.querySelector('.srr-open');
  assert.ok(!openBad, 'javascript: link must not be rendered as an external Open link');
  assert.ok(openGood, 'https link should render an Open link');
  assert.equal(openGood?.getAttribute('href'), 'https://example.org');
});

test('formatters', () => {
  assert.equal(formatScore(1234), '1.2k');
  assert.equal(formatScore(500), '500');
  assert.equal(formatRatio(0.875), '88%');
  assert.equal(formatRatio(undefined), 'ratio n/a');
  assert.ok(formatAge(Date.now() / 1000 - 30).includes('m'));
  const p = { score: 0.1, comments: 0.2, ratio: 0.3, recency: 0.4 };
  assert.ok(formatParts({ parts: p }).includes('recency'));
});
