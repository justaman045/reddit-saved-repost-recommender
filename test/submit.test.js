import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, buildSubmitUrl, contentKey, isRedditMedia } from '../src/lib/submit.js';

const linkPost = {
  name: 't3_l',
  title: 'Nice & useful article',
  url: 'https://example.com/article?utm_source=x&utm_medium=y',
  permalink: '/r/interesting/l/',
  domain: 'example.com',
  isSelf: false,
};
const selfPost = {
  name: 't3_s',
  title: 'Text post',
  url: 'https://www.reddit.com/r/AskReddit/s/',
  permalink: '/r/AskReddit/s/',
  domain: 'self.AskReddit',
  isSelf: true,
  selftext: 'body',
};
const imagePost = {
  name: 't3_i',
  title: 'Photo',
  url: 'https://i.redd.it/abc.jpg',
  permalink: '/r/pics/i/',
  domain: 'i.redd.it',
  isSelf: false,
};
const videoPost = {
  name: 't3_v',
  title: 'Video',
  url: 'https://v.redd.it/xyz',
  permalink: '/r/videos/v/',
  domain: 'v.redd.it',
  isVideo: true,
  isSelf: false,
};
const galleryPost = {
  name: 't3_g',
  title: 'Gallery',
  url: 'https://www.reddit.com/gallery/t3_g',
  permalink: '/r/pics/g/',
  domain: 'reddit.com',
  isGallery: true,
  isSelf: false,
};
const crossPost = {
  name: 't3_c',
  title: 'Crosspost',
  url: 'https://www.reddit.com/r/orig/p/',
  permalink: '/r/aww/c/',
  domain: 'reddit.com',
  crosspostParent: 't3_o',
  isSelf: false,
};

test('classify sorts posts into the three submit paths', () => {
  assert.equal(classify(linkPost), 'link');
  assert.equal(classify(selfPost), 'self');
  assert.equal(classify(imagePost), 'reddit-media');
  assert.equal(classify(videoPost), 'reddit-media');
  assert.equal(classify(galleryPost), 'reddit-media');
  assert.equal(classify(crossPost), 'reddit-media');
  assert.equal(classify({ ...linkPost, domain: 'self.weird', isSelf: false }), 'self');
});

test('isRedditMedia covers reddit-hosted domains', () => {
  assert.equal(isRedditMedia(imagePost), true);
  assert.equal(isRedditMedia(linkPost), false);
  assert.equal(isRedditMedia({ ...linkPost, domain: 'old.reddit.com' }), true);
});

test('buildSubmitUrl for external links round-trips url and title', () => {
  const u = new URL(buildSubmitUrl(linkPost));
  assert.equal(u.origin + u.pathname, 'https://www.reddit.com/submit');
  assert.equal(u.searchParams.get('url'), linkPost.url);
  assert.equal(u.searchParams.get('title'), linkPost.title);
});

test('buildSubmitUrl never breaks on & or quotes in titles', () => {
  const post = { ...linkPost, title: 'A & B "C" \'D\'' };
  const u = new URL(buildSubmitUrl(post));
  assert.equal(u.searchParams.get('title'), 'A & B "C" \'D\'');
  assert.equal(u.searchParams.get('url'), linkPost.url);
});

test('buildSubmitUrl for self posts has title only', () => {
  const u = new URL(buildSubmitUrl(selfPost));
  assert.equal(u.searchParams.get('title'), selfPost.title);
  assert.equal(u.searchParams.get('url'), null);
});

test('buildSubmitUrl for reddit media uses the permalink for the crosspost dialog', () => {
  for (const post of [imagePost, videoPost, galleryPost, crossPost]) {
    const u = new URL(buildSubmitUrl(post));
    assert.equal(u.searchParams.get('url'), 'https://www.reddit.com' + post.permalink);
    assert.equal(u.searchParams.get('title'), post.title);
  }
});

test('buildSubmitUrl tolerates absolute permalinks', () => {
  const post = { ...imagePost, permalink: 'https://www.reddit.com/r/pics/abs/' };
  const u = new URL(buildSubmitUrl(post));
  assert.equal(u.searchParams.get('url'), 'https://www.reddit.com/r/pics/abs/');
});

test('contentKey strips utm params and fragments for dedupe', () => {
  const a = contentKey({ ...linkPost, url: 'https://example.com/article?utm_source=x&keep=1#frag' });
  assert.equal(a, 'https://example.com/article?keep=1');
  const b = contentKey(linkPost);
  assert.equal(b, 'https://example.com/article');
});

test('contentKey never throws on junk', () => {
  assert.equal(typeof contentKey({ name: 't3_x' }), 'string');
  assert.equal(typeof contentKey({}), 'string');
  const fallback = contentKey({ url: '', permalink: '', name: 't3_z' });
  assert.equal(fallback, 't3_z');
});
