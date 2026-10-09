// Single source of truth for tunables.
// src/content/fetcher.js is a classic script and cannot import this file;
// it carries an identical LIMITS object. test/limits-sync.test.js asserts
// the two copies never drift. Change values here AND in fetcher.js together.
export const FETCH = {
  DELAY_MIN_MS: 900,
  DELAY_JITTER_MS: 500,
  MAX_PAGES: 12,
  PAGE_LIMIT: 100,
  LOCK_STALE_MS: 120000,
  REFRESH_FLOOR_MS: 600000,
};

export const SCORE = {
  DEFAULT_WEIGHTS: { score: 0.5, comments: 0.2, ratio: 0.2, recency: 0.1 },
  CAP_LOG10: 6,
  COMMENTS_CAP_LOG10: 4,
  RECENCY_HALF_LIFE_DAYS: 180,
  RATIO_NEUTRAL: 0.5,
};
