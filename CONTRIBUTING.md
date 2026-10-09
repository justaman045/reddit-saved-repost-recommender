# Contributing

Thanks for your interest in improving Saved Repost Recommender! This project is a
dependency-light Chrome MV3 extension with a strong read-only default, so a few
conventions matter more than usual.

## Getting started

```bash
git clone https://github.com/justaman045/reddit-saved-repost-recommender.git
cd reddit-saved-repost-recommender
npm install
npm test
```

Then load the extension for manual testing:

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select the repository root.
3. Log into `https://www.reddit.com` in an active tab and click the extension icon.

## Project conventions

- **Plain ES modules, no bundler, no build step.** Don't add one.
- **`src/content/fetcher.js` is a classic script** (no `import`/`export`). It cannot
  import `src/lib/limits.js`, so fetch limits are duplicated there. If you change a
  shared limit, update **both** files — `test/limits-sync.test.js` will fail otherwise.
- **Read-only by default.** New code must not add `storage.sync`,
  `chrome.cookies`, `innerHTML`/`outerHTML`, `eval`/`new Function`, `setInterval`,
  `chrome.alarms`, MAIN-world injection, or Reddit write API calls. The opt-in
  per-item unsave is the sole exception.
- **Render with `textContent`** and the helpers in `src/lib/render.js`; never inject
  HTML.
- **Fixtures are synthetic only.** Never commit real Reddit data.
- Keep the popup UI and service worker thin: put logic in `src/lib/*` and test it.

## Before you open a PR

- [ ] `npm test` passes (all tests green).
- [ ] New behavior has unit tests under `test/`.
- [ ] No forbidden APIs were introduced (see the list above and
      `test/security.test.js`).
- [ ] If you added an external request, it's intentional and documented.

The pull request template repeats this checklist; please tick the boxes.

## Commit style

Short, imperative subject lines (e.g. `score: handle missing upvote ratio`). No
strict tooling is enforced.

## Reporting bugs / requesting features

Use the GitHub issue templates. For security issues, **do not** open a public
issue — see [SECURITY.md](SECURITY.md).
