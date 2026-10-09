# Security Policy

## Supported versions

This is a small project; only the latest `main` (and the latest tagged release) is
supported.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead use GitHub's
private vulnerability reporting:

- <https://github.com/justaman045/reddit-saved-repost-recommender/security/advisories/new>

Or email **coderaman07@gmail.com**. Please include:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- the affected file(s)/commit, and
- any suggested fix.

You can expect an initial response within a few days.

## Security model (what to expect)

Saved Repost Recommender is intentionally local-only:

- It only makes same-origin requests to `reddit.com` from the tab you already have
  open, using your existing browser session.
- It never asks for credentials or API keys, and never reads or writes cookies
  directly.
- The manifest requests only `activeTab`, `scripting`, and `storage` — no
  `host_permissions`, no declared content scripts, no remote resources.
- All data stays in `chrome.storage.local`.
- The single write action is an **opt-in, per-item unsave**, which is disabled by
  default.

These properties are enforced by `test/security.test.js` on every commit. If you
find a way around them, that's a security bug worth reporting.
