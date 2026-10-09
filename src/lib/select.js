import { classify, contentKey } from './submit.js';

export function applyFilters(posts, opts = {}) {
  const minScore = Number.isFinite(opts.minScore) ? opts.minScore : 0;
  const subreddit = typeof opts.subreddit === 'string' ? opts.subreddit.trim() : '';
  const domain = typeof opts.domain === 'string' ? opts.domain.trim().toLowerCase() : '';
  const hideQueued = opts.hideQueued === true;
  const prefillOnly = opts.prefillOnly === true;
  const hideSubmitted = opts.hideSubmitted === true;
  const queuedNames = opts.queuedNames instanceof Set ? opts.queuedNames : new Set();
  const queuedKeys = opts.queuedKeys instanceof Set ? opts.queuedKeys : new Set();
  const submittedKeys = opts.submittedKeys instanceof Set ? opts.submittedKeys : new Set();

  return posts.filter((post) => {
    if (minScore > 0 && post.score < minScore) return false;
    if (subreddit && post.subreddit.toLowerCase() !== subreddit.toLowerCase()) return false;
    if (domain && String(post.domain || '').toLowerCase() !== domain) return false;
    if (prefillOnly && classify(post) === 'self') return false;
    if (hideQueued && (queuedNames.has(post.name) || queuedKeys.has(contentKey(post)))) return false;
    if (hideSubmitted && submittedKeys.has(contentKey(post))) return false;
    return true;
  });
}

export function queueSets(queue) {
  const queuedNames = new Set();
  const queuedKeys = new Set();
  for (const [name, entry] of Object.entries(queue || {})) {
    queuedNames.add(name);
    if (entry && typeof entry.contentKey === 'string' && entry.contentKey) queuedKeys.add(entry.contentKey);
  }
  return { queuedNames, queuedKeys };
}
