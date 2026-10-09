import { SCORE } from './limits.js';

export function normalizedWeights(weights) {
  const w = { ...SCORE.DEFAULT_WEIGHTS, ...(weights || {}) };
  for (const key of Object.keys(w)) {
    if (!Number.isFinite(w[key]) || w[key] < 0) w[key] = SCORE.DEFAULT_WEIGHTS[key];
  }
  const sum = w.score + w.comments + w.ratio + w.recency;
  if (!(sum > 0)) return { ...SCORE.DEFAULT_WEIGHTS };
  return {
    score: w.score / sum,
    comments: w.comments / sum,
    ratio: w.ratio / sum,
    recency: w.recency / sum,
  };
}

export function scorePost(post, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const w = normalizedWeights(opts.weights);

  const sScore = Math.min(1, Math.log10(Math.max(post.score, 0) + 1) / SCORE.CAP_LOG10);
  const sComments = Math.min(1, Math.log10(Math.max(post.numComments, 0) + 1) / SCORE.COMMENTS_CAP_LOG10);

  const ratioMissing = !(typeof post.upvoteRatio === 'number' && Number.isFinite(post.upvoteRatio));
  const ratio = ratioMissing ? SCORE.RATIO_NEUTRAL : Math.min(1, Math.max(0, post.upvoteRatio));

  const ageDays =
    post.createdUtc > 0 ? Math.max(0, (now / 1000 - post.createdUtc) / 86400) : SCORE.RECENCY_HALF_LIFE_DAYS * 100;
  const sRecency = Math.pow(0.5, ageDays / SCORE.RECENCY_HALF_LIFE_DAYS);

  const raw = 100 * (w.score * sScore + w.comments * sComments + w.ratio * ratio + w.recency * sRecency);
  const total = Math.min(100, Math.max(0, raw));

  if (!Number.isFinite(total)) {
    return { total: 0, parts: { score: 0, comments: 0, ratio: SCORE.RATIO_NEUTRAL, recency: 0 }, ratioMissing };
  }
  return {
    total,
    parts: { score: sScore, comments: sComments, ratio, recency: sRecency },
    ratioMissing,
  };
}

export function rankPosts(posts, opts = {}) {
  return posts
    .map((post) => ({ post, scoreInfo: scorePost(post, opts) }))
    .sort((a, b) => b.scoreInfo.total - a.scoreInfo.total || (a.post.name < b.post.name ? -1 : 1))
    .map(({ post, scoreInfo }) => ({ ...post, scoreInfo }));
}
