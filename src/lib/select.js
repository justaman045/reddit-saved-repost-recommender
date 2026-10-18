import { rankPosts } from './score.js';
import { submittedIndex } from './submitted.js';
import { classify, contentKey } from './submit.js';

export const BASE_DISPLAY_LIMIT = 100;

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

// Single source of truth for the popup's rank -> filter -> paginate pipeline.
// refreshView and the export buttons both go through this so the exported rows
// can never disagree with what the list shows.
export function getFiltered(state) {
  const posts = Array.isArray(state.posts) ? state.posts : [];
  const filters = state.filters || {};
  // parseChildren does not store contentKey on each post; compute it once here
  // so queue/submitted matching and the "already posted" badge all key off the
  // same value.
  const ranked = rankPosts(posts).map((p) => (p.contentKey ? p : { ...p, contentKey: contentKey(p) }));
  const sets = queueSets(state.queue);
  const sIndex = submittedIndex(state.submitted);
  const filtered = applyFilters(ranked, {
    minScore: filters.minScore,
    subreddit: filters.subreddit,
    hideQueued: filters.hideQueued,
    prefillOnly: filters.prefillOnly,
    hideSubmitted: filters.hideSubmitted,
    queuedNames: sets.queuedNames,
    queuedKeys: sets.queuedKeys,
    submittedKeys: sIndex.keys,
  }).map((p) => {
    const match = p.contentKey ? sIndex.byKey.get(p.contentKey) : undefined;
    return match ? { ...p, submittedMatch: match } : p;
  });
  const limit =
    Number.isFinite(state.displayLimit) && state.displayLimit > 0 ? state.displayLimit : BASE_DISPLAY_LIMIT;
  return { ranked, sets, sIndex, filtered, shown: filtered.slice(0, limit), limit };
}
