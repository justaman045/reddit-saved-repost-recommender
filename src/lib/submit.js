const REDDIT_MEDIA_HOST = /^(i|v)\.redd\.it$/;

function hostOf(domain) {
  return String(domain || '').toLowerCase();
}

export function isRedditMedia(post) {
  if (post.isGallery || post.crosspostParent) return true;
  if (post.isVideo) return true;
  const d = hostOf(post.domain);
  if (REDDIT_MEDIA_HOST.test(d)) return true;
  if (d === 'reddit.com' || d.endsWith('.reddit.com') || d.startsWith('self.')) return true;
  return false;
}

export function classify(post) {
  const d = hostOf(post.domain);
  if (post.isSelf || d.startsWith('self.')) return 'self';
  return isRedditMedia(post) ? 'reddit-media' : 'link';
}

function absoluteRedditUrl(post, origin) {
  const p = post.permalink || '';
  if (/^https?:\/\//i.test(p)) return p;
  return origin + (p.startsWith('/') ? p : '/' + p);
}

export function buildSubmitUrl(post, origin = 'https://www.reddit.com') {
  const title = encodeURIComponent(post.title || '');
  const kind = classify(post);
  if (kind === 'self') {
    return `${origin}/submit?title=${title}`;
  }
  if (kind === 'reddit-media') {
    const target = absoluteRedditUrl(post, origin);
    return `${origin}/submit?url=${encodeURIComponent(target)}&title=${title}`;
  }
  const target = post.url || absoluteRedditUrl(post, origin);
  return `${origin}/submit?url=${encodeURIComponent(target)}&title=${title}`;
}

export function contentKey(post, origin = 'https://www.reddit.com') {
  const raw = post.url || post.permalink || '';
  if (!raw) return post.name || '';
  try {
    const u = new URL(raw, origin);
    for (const key of [...u.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_')) u.searchParams.delete(key);
    }
    u.hash = '';
    return u.origin + u.pathname + u.search;
  } catch {
    return raw;
  }
}
