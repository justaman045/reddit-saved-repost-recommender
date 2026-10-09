# AGENTS.md

Local-only, read-only Chrome MV3 extension that ranks saved Reddit posts and opens
pre-filled repost drafts. Plain ES modules, no bundler, no build step.

## Commands
- Node >= 18 (v24 verified). `package.json` is `"type": "module"`.
- `npm test` — runs all 70 `node:test` tests (all green). `jsdom` is a devDependency
  for `test/render.test.js`; run `npm install` first.
- `npm run icons` — regenerate PNGs in `icons/`; `npm run social` — regenerate `assets/social-preview.png`.
- `npm run test:e2e` — uses `playwright-core` only (no browser download); headful, needs a display.

## Architecture
- `manifest.json`: permissions exactly `activeTab,scripting,storage`; no `host_permissions`,
  no `content_scripts`, no `cookies`; background is a service-worker module.
- `src/background.js` only routes: injects the fetcher into the active tab and opens submit tabs.
- Fetching runs in the injected classic script `src/content/fetcher.js` (no ES imports; exposes
  `globalThis.__SRR__`). Popup (`src/popup/popup.js`) imports ES modules from `src/lib/*`.
- Storage: `chrome.storage.local` only. UI toggles persist under `.ui` (`enableUnsave` default
  false, `enableNotes` default true); notes under `.notes`.
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
- Unsave is the ONLY write, opt-in per item: `POST /api/unsave` with modhash + `X-Modhash`.
  README's "zero POST / no unsave" is stale — trust the code and `test/security.test.js`.

## Gotchas
- The domain filter was removed from the popup UI, but `src/lib/select.js` still supports
  `opts.domain` and `test/select.test.js` covers it. Don't delete the lib support.
- `test/security.test.js` endpoint allowlist only matches single/double-quoted root-relative
  strings, so backtick template literals (`/user/{name}/submitted.json`) and absolute URLs
  (`/api/unsave`) bypass it. New endpoints won't be caught automatically.
- Security test forbids anywhere in `src/`: `storage.sync`, `chrome.cookies`, Reddit write APIs,
  `innerHTML`/`outerHTML`, `eval`/`new Function`, `setInterval`, `chrome.alarms`, MAIN-world injection.
- Fixture is synthetic only (`test/fixtures/saved-synthetic.json`); never commit real Reddit data.

## render.js invariants (enforced by test/render.test.js — don't regress)
- The "ratio missing" badge keyed off `scoreInfo.ratioMissing` (the item-level object
  popup passes at popup.js:223), NOT `post.scoreInfo`.
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
3. "Repost" opens reddit.com/submit (crosspost/gallery use permalink) — the user submits manually.
