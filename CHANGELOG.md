# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- The "Fetch saved posts" button could get stuck **disabled forever**: an
  interrupted fetch (tab navigated away mid-run) left `meta.fetching` set, and
  the popup had no stale-lock recovery even though the fetcher recovers such
  locks after 2 minutes. The popup now trusts the lock only while it can still
  be running (`isFetchingLive`), for both the saved and the submitted fetch.
- The 10-minute refresh floor disabled the button silently with no indication of
  when (or whether) it would come back. The note now explains the lock
  ("Refresh in Xm", or the rate-limit backoff) and a one-shot timer
  re-enables the button the moment the floor expires while the popup is open.

## [0.1.1] - 2026-10-18

### Fixed

- Export CSV/JSON buttons crashed on click — `globalThis.__filtered` was never
  defined. Exports now go through the same rank → filter → paginate pipeline
  (`getFiltered`) as the list view, so the exported rows always match the screen.
- The "Show more" button had no effect: the display limit was read from the
  persisted UI prefs instead of the running limit. Paging now has a single
  source of truth.
- The opt-in unsave never worked — the popup's `SRR_UNSAVE` message had no
  handler. It now runs `fetchUnsave` in the injected script and, on success,
  removes the post from the stored list so it stays gone.
- The Repost button skipped the documented flow (self-post body copied to the
  clipboard, confirmation toast, auto-queue): the rows wired an inline shortcut
  instead of the full handler.
- The "Already posted by you" badge and export's `submitted_matched` could never
  match — posts carried no `contentKey`, so the submitted index lookup always
  missed.
- "Check my posts" progress and error updates clobbered `submittedMeta`,
  dropping the username and fetched-at timestamp after an error.
- Note textareas are no longer built when notes are disabled, and in-progress
  edits survive the re-renders triggered by fetch progress events.
- `npm run test:e2e` actually runs now: the harness loaded `test/` instead of the
  repo root as the extension (no `manifest.json` there, so the service worker
  could never start), used `launch()` where extensions need
  `launchPersistentContext`, and called `assert` without importing it. The
  browser is also resolved explicitly (`CHROME_EXECUTABLE` → cached Playwright
  Chromium → system Chrome) because branded Chrome >= 137 ignores
  `--load-extension`.

### Changed

- README no longer advertises tags: the tag helpers exist in
  `src/lib/notes.js`, but there is no UI to set them.
- `manifest.json` / `package.json` descriptions now mention the opt-in unsave
  exception instead of claiming strict read-only.

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

[Unreleased]: https://github.com/justaman045/reddit-saved-repost-recommender/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/justaman045/reddit-saved-repost-recommender/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/justaman045/reddit-saved-repost-recommender/releases/tag/v0.1.0
