# Saved Repost Recommender

> Reddit Saved **re-Post** Recommender

[![CI](https://github.com/justaman045/reddit-saved-repost-recommender/actions/workflows/ci.yml/badge.svg)](https://github.com/justaman045/reddit-saved-repost-recommender/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-green.svg)](manifest.json)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)

![Saved Repost Recommender](assets/social-preview.png)

A local-only Chrome (Manifest V3) extension that ranks your **saved Reddit posts**
by engagement and opens Reddit's submit page pre-filled so you can manually repost.
No credentials, no API keys, no telemetry, and no remote resources.

It reads your saved list straight from the logged-in reddit.com tab using your
existing session, scores every post, and helps you find the ones worth sharing
again.

## Features

- **Engagement ranking** — a deterministic 0–100 score from upvotes, comments,
  upvote ratio, and recency, with a per-post breakdown.
- **Pre-filled repost drafts** — opens `reddit.com/submit` with the right URL or
  title. Self-posts also copy their body to your clipboard; you press submit.
- **Filters** — minimum score, subreddit, hide queued, hide posts you already
  submitted, and "prefill-ready only".
- **Queue** — track posts you plan to repost; deduped by name *and* by content key
  so the same URL saved twice can't sneak back in.
- **"Check my posts"** — fetch your submission history to detect posts you've
  already shared.
- **Notes & tags** — attach a note and up to a few tags to any saved post (opt-in,
  on by default).
- **Export** — download the current filtered view as CSV or JSON.
- **Opt-in unsave** — optionally unsave a post from the popup. This is the only
  write action and is off by default.

## Privacy & security

This extension is designed to be boringly private:

- Talks only to `reddit.com`, same-origin, from the tab you already have open.
- Never asks for credentials or API keys and never touches cookies directly.
- No `host_permissions`, no content scripts declared in the manifest, no
  `storage.sync`, no analytics, no remote assets.
- The popup renders with `textContent` only (no `innerHTML`), so post titles can't
  inject markup.
- The **only** write is the opt-in, per-item unsave (`POST /api/unsave`), gated
  behind a toggle and performed with the page's own modhash.
- `test/security.test.js` enforces this posture on every commit.

All data lives in `chrome.storage.local` and stays on your machine.

## Install (from source)

**Prerequisites:** Google Chrome (or a Chromium-based browser) and, for tests,
Node.js **≥ 18**.

1. Clone the repository:
   ```bash
   git clone https://github.com/justaman045/reddit-saved-repost-recommender.git
   cd reddit-saved-repost-recommender
   ```
2. (Optional) Verify the test suite:
   ```bash
   npm install
   npm test
   ```
3. Open `chrome://extensions` → enable **Developer mode** → **Load unpacked** and
   select the repository root.
4. Be logged into `https://www.reddit.com` in an active tab.
5. Click the extension icon, then **Fetch saved posts**.

## Usage

1. Open the popup while on a logged-in reddit.com tab. If you're elsewhere, it
   tells you to open Reddit first.
2. **Fetch saved posts** pages through your saved list sequentially, throttled to
   900–1400 ms between requests, deduplicated by post name, and capped at roughly
   the first 1000 items (Reddit's own limit).
3. The list is sorted by total score. Each row shows rank, title, subreddit, score,
   upvote ratio, comments, age, and the score breakdown. Posts with no
   `upvote_ratio` show "n/a" neutrally so they aren't unfairly penalized.
4. Use the filters to narrow things down, then hit **Repost** to open a pre-filled
   submit page. You always submit manually.
5. **Queue/Unqueue** keeps a shortlist and hides duplicates.

## How scoring works

Each post gets a weighted total in `[0, 100]`, using `log10` with fixed
denominators so typical Reddit numbers stay well-scaled:

| Component | Default weight | Basis |
| --- | --- | --- |
| Upvotes | 0.50 | `log10(score + 1) / 6` |
| Comments | 0.20 | `log10(comments + 1) / 4` |
| Upvote ratio | 0.20 | clamped `[0, 1]`, missing → neutral `0.5` |
| Recency | 0.10 | 180-day half-life |

Weights are normalized to sum to 1, the total is clamped to `[0, 100]`, and ties
break by post name for stable ordering. All tunables live in
[`src/lib/limits.js`](src/lib/limits.js).

## Development

```bash
npm test        # unit tests (scoring, parsing, submit URLs, filters, security, ...)
npm run test:e2e # headful Chrome E2E (needs a display; uses your local Chrome)
npm run icons   # regenerate icons/ PNGs
npm run social  # regenerate the social preview image
```

Fixtures are **synthetic only** (`test/fixtures/saved-synthetic.json`). Never commit
real Reddit data.

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions and the pull-request
checklist.

## Project structure

```
manifest.json          # MV3 manifest (permissions: activeTab, scripting, storage)
src/
  background.js        # service worker: routes fetch + open-submit requests
  content/fetcher.js   # injected classic script; performs the reddit.com GETs
  popup/               # popup UI (popup.html/js/css), imports src/lib/* modules
  lib/
    limits.js          # single source of tuning constants
    score.js           # ranking math
    select.js          # filtering
    submit.js          # classify + build /submit URLs + contentKey
    parse.js           # normalize saved JSON
    submitted.js       # "already posted" index
    notes.js           # per-post notes/tags
    export.js          # CSV/JSON export
    render.js          # safe (textContent-only) DOM rendering
scripts/               # icon + social-preview generators
test/                  # node:test unit tests + one Playwright E2E
```

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md) first.

## License

[MIT](LICENSE) © 2026 Aman
