# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-10

### Added

- Chrome MV3 extension that fetches your saved Reddit posts from the active
  logged-in tab (read-only, same-origin).
- Deterministic 0–100 engagement score (upvotes, comments, upvote ratio, recency)
  with per-post breakdown.
- Pre-filled repost drafts via `reddit.com/submit`; self-posts copy their body to
  the clipboard.
- Filters (min score, subreddit, hide queued, hide submitted, prefill-ready) and a
  content-key-aware queue.
- "Check my posts" submitted-history index.
- Per-post notes and tags (opt-in, on by default).
- CSV/JSON export of the filtered view.
- Opt-in, per-item unsave (the only write action; off by default).
- Test suite (`node:test`) including a security-posture test, plus an optional
  Playwright E2E smoke test.

[Unreleased]: https://github.com/justaman045/reddit-saved-repost-recommender/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/justaman045/reddit-saved-repost-recommender/releases/tag/v0.1.0
