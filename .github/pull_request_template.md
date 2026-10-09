## Summary

What does this PR change and why?

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Refactor / maintenance

## Checklist

- [ ] `npm test` passes locally (all tests green).
- [ ] I did not introduce `innerHTML`/`outerHTML`, `eval`, `storage.sync`,
      `chrome.cookies`, or Reddit write API calls.
- [ ] If I changed fetch limits, I updated **both** `src/lib/limits.js` and
      `src/content/fetcher.js` (enforced by `test/limits-sync.test.js`).
- [ ] Any new external endpoints are intentional and covered by tests.
- [ ] No real Reddit data is committed (fixtures are synthetic only).

## Related issues

Closes #
