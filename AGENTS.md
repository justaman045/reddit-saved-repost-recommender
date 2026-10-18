# AGENTS.md

Local-only, read-only Chrome MV3 extension that ranks saved Reddit posts and opens
pre-filled repost drafts. Plain ES modules, no bundler, no build step.

## Commands
- Node >= 18 (v24 verified). `package.json` is `"type": "module"`.
- `npm test` — runs all 85 `node:test` tests (all green). `jsdom` is a devDependency
  for `test/render.test.js`; run `npm install` first.
- `npm run icons` — regenerate PNGs in `icons/`; `npm run social` — regenerate `assets/social-preview.png`.
- `npm run test:e2e` — uses `playwright-core` only (no browser download required); headful,
  needs a display. Browser resolution: `CHROME_EXECUTABLE` → Playwright-managed Chromium if
  installed → newest `~/.cache/ms-playwright/chromium-*` → `/usr/bin/google-chrome`. Branded
  Chrome >= 137 ignores `--load-extension`, so the system-Chrome fallback may fail there.

## Architecture
- `manifest.json`: permissions exactly `activeTab,scripting,storage`; no `host_permissions`,
  no `content_scripts`, no `cookies`; background is a service-worker module.
- `src/background.js` only routes: injects the fetcher into the active tab, opens
  submit tabs, and runs unsaves (`SRR_UNSAVE`).
- Fetching runs in the injected classic script `src/content/fetcher.js` (no ES imports; exposes
  `globalThis.__SRR__`). Popup (`src/popup/popup.js`) imports ES modules from `src/lib/*`.
- The popup list AND both export buttons go through `getFiltered` (`src/lib/select.js`):
  rank → compute `contentKey` → filter → attach `submittedMatch` → paginate by the single
  running `state.displayLimit` (base 100). Don't reintroduce a second pipeline; the old
  `globalThis.__filtered` shortcut crashed and is guarded out in `test/build.test.js`.
- Storage: `chrome.storage.local` only. UI toggles persist under the `ui` key
  (`enableUnsave` default false, `enableNotes` default true); notes under `notes`.
- Dedupe/queue key: `contentKey` strips `utm_*` and the fragment; falls back to `name` when no
  url/permalink exists.

## Fetch semantics
- Sequential only; delay `900 + rand*500` ms (900–1400); max 12 pages × 100 = ~1000 cap.
- `LIMITS` is **duplicated** in `fetcher.js` because a classic script cannot import
  `src/lib/limits.js`. `test/limits-sync.test.js` enforces the 5 shared keys match — change both.
- Lock via `fetching`/`fetchStartedAt`; stale >120000 ms recovered. Errors: 429 → rate-limited
  (honor `Retry-After`, stop, no auto-retry), 401/403 → session, non-JSON → blocked (HTML challenge).

## Scoring (`src/lib/score.js`, constants in `limits.js`)
- log10 with fixed denominators; 180-day recency half-life; clamp [0,100]; missing
  `upvote_ratio` → neutral 0.5 (flagged in UI); weights normalized to sum 1.

## Submit / unsave
- `src/lib/submit.js` `classify`: self → `/submit?title` (+ body copied to clipboard);
  external link → original url; Reddit media/gallery/crosspost → `permalink` in `url=`.
- Unsave is the ONLY write, opt-in per item: `POST https://www.reddit.com/api/unsave` with
  modhash + `X-Modhash`. Keep it that way; `test/security.test.js` guards the posture.
  Routing: popup sends `SRR_UNSAVE` (with `tabId`) → background `handleUnsave` ensures the
  fetcher is injected → `__SRR__.fetchUnsave(id)` runs in the page → on success background
  removes the post from stored `raw`. The popup hides the row while the unsave is in flight
  (`state.unsaving`) and restores it with a toast on failure.

## Gotchas
- The domain filter was removed from the popup UI, but `src/lib/select.js` still supports
  `opts.domain` and `test/select.test.js` covers it. Don't delete the lib support.
- `test/security.test.js` endpoint allowlist only matches single/double-quoted root-relative
  strings, so backtick template literals (`/user/{name}/submitted.json`) and absolute URLs
  (`/api/unsave`) bypass it. New endpoints won't be caught automatically.
- Security test forbids anywhere in `src/`: `storage.sync`, `chrome.cookies`, Reddit write APIs,
  `innerHTML`/`outerHTML`, `eval`/`new Function`, `setInterval`, `chrome.alarms`, MAIN-world injection.
- Fixture is synthetic only (`test/fixtures/saved-synthetic.json`); never commit real Reddit data.
- Note textareas are rebuilt on every refresh: in-progress text lives in `state.noteDrafts`
  (cleared on save) and `refreshView` restores focus/caret after the re-render. Break either
  half and typing is lost mid-fetch.

## render.js invariants (enforced by test/render.test.js — don't regress)
- The "ratio missing" badge keys off `scoreInfo.ratioMissing` on the item-level `scoreInfo`
  popup passes into `renderRows`, NOT `post.scoreInfo`.
- `safeExternalHref` returns the ORIGINAL string (validated http(s) only), not the
  URL-normalized form — the Open link's `href` must equal `post.url` exactly.
- The Open button renders only for a safe external `url`. Fallback to the reddit
  permalink happens ONLY when the post has no `url` at all; an unsafe url
  (e.g. `javascript:`) means no Open button.

## CI / publishing
- Repo: github.com/justaman045/reddit-saved-repost-recommender (public, remote `origin`).
- CI matrix = Node 18/20/22 (`npm ci` + `npm test`); release workflow zips
  `manifest.json` + `src/` + `icons/` on `v*` tags. Both in `.github/workflows/`.
- `jsdom` must stay on `^25`: jsdom >= 26 needs Node > 20 and breaks the Node 18/20 CI
  legs. `.github/dependabot.yml` ignores jsdom major bumps — keep that rule if you touch it.
- GitHub has NO API for the social preview image: `npm run social` regenerates
  `assets/social-preview.png`, but uploading it in Settings → Social preview is manual.

## Manual smoke test
1. Load unpacked from the repo root in Chrome; be logged into reddit.com in the active tab.
2. Popup → Fetch saved posts; verify progress, ranking, ratio "n/a" cases, queue behavior.
3. With >100 posts: "Show more" reveals the next 100; Export CSV/JSON downloads the
   currently filtered rows; "Check my posts" shows the "Already posted by you" badge.
4. Enable "Enable unsave actions" → Unsave removes the row and it stays gone after
   reopening the popup (and in Reddit's own saved list).
5. "Repost" opens reddit.com/submit (crosspost/gallery use permalink; self-posts copy the
   body to the clipboard) — the user submits manually.
