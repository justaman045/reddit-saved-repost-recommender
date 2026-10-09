// Injected on demand into a reddit.com tab (classic script — no ES imports).
// Read-only: only GET /api/me.json and GET /saved.json. Never mutates anything.
// Limits below must match src/lib/limits.js FETCH (test/limits-sync.test.js enforces).
(function () {
  'use strict';
  if (globalThis.__SRR_INJECTED__) return;
  globalThis.__SRR_INJECTED__ = true;

  const LIMITS = {
    DELAY_MIN_MS: 900,
    DELAY_JITTER_MS: 500,
    MAX_PAGES: 12,
    PAGE_LIMIT: 100,
    LOCK_STALE_MS: 120000,
  };

  function defaultStore() {
    return {
      get: (key) => chrome.storage.local.get(key).then((obj) => obj[key]),
      set: (obj) => chrome.storage.local.set(obj),
    };
  }

  function defaultEmit(event) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const p = chrome.runtime.sendMessage(event);
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } catch (_e) {
        /* no receiver */
      }
    }
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function parseRetryAfter(res) {
    try {
      const raw = res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
      const seconds = raw ? parseInt(raw, 10) : NaN;
      return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60000;
    } catch (_e) {
      return 60000;
    }
  }

  function fail(kind, message, retryAfterMs) {
    const err = new Error(message || kind);
    err.kind = kind;
    if (Number.isFinite(retryAfterMs)) err.retryAfterMs = retryAfterMs;
    return err;
  }

  async function jsonRequest(fetchFn, url) {
    let res;
    try {
      res = await fetchFn(url);
    } catch (_e) {
      throw fail('network', 'network error');
    }
    if (!res || typeof res.status !== 'number') throw fail('network', 'bad response');
    if (res.status === 429) throw fail('rate-limited', 'rate limited', parseRetryAfter(res));
    if (res.status === 401 || res.status === 403) throw fail('session', 'blocked or signed out');
    if (res.status < 200 || res.status >= 300) throw fail('http', 'http ' + res.status);
    let text;
    try {
      text = await res.text();
    } catch (_e) {
      throw fail('network', 'read error');
    }
    try {
      return JSON.parse(text);
    } catch (_e) {
      throw fail('blocked', 'non-JSON response');
    }
  }

  function contentKeyFor(d) {
    const raw = d.url || d.permalink || '';
    if (!raw) return typeof d.name === 'string' ? d.name : '';
    try {
      const u = new URL(raw, 'https://www.reddit.com');
      for (const key of [...u.searchParams.keys()]) {
        if (key.toLowerCase().startsWith('utm_')) u.searchParams.delete(key);
      }
      u.hash = '';
      return u.origin + u.pathname + u.search;
    } catch (_e) {
      return raw;
    }
  }

  async function fetchAll(deps) {
    deps = deps || {};
    const store = deps.store || defaultStore();
    const fetchFn =
      deps.fetchFn ||
      ((url) =>
        fetch(url, {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        }));
    const delayFn = deps.delayFn || sleep;
    const now = deps.now || (() => Date.now());
    const random = deps.random || Math.random;
    const limits = Object.assign({}, LIMITS, deps.limits || {});
    const emit = deps.onEvent || defaultEmit;
    const endpoints = Object.assign(
      { me: '/api/me.json?raw_json=1', savedBase: '/saved.json?raw_json=1&limit=' + limits.PAGE_LIMIT },
      deps.endpoints || {},
    );

    const startedAt = now();
    const metaBefore = (await store.get('meta')) || {};
    if (metaBefore.fetching && startedAt - (metaBefore.fetchStartedAt || 0) < limits.LOCK_STALE_MS) {
      return { ok: false, reason: 'busy' };
    }
    await store.set({
      meta: Object.assign({}, metaBefore, {
        fetching: true,
        fetchStartedAt: startedAt,
        error: null,
        progress: { pages: 0, count: 0 },
      }),
    });

    try {
      const me = await jsonRequest(fetchFn, endpoints.me);
      const username =
        me && me.data && typeof me.data.name === 'string' && me.data.name.length > 0 ? me.data.name : null;
      if (!username) throw fail('not-logged-in', 'no logged-in user');

      const children = [];
      const seen = new Set();
      let after = null;
      let pages = 0;
      let truncated = false;
      let firstPage = true;

      for (;;) {
        if (firstPage) {
          firstPage = false;
        } else {
          await delayFn(limits.DELAY_MIN_MS + random() * limits.DELAY_JITTER_MS);
        }
        if (pages >= limits.MAX_PAGES) {
          truncated = true;
          break;
        }

        const url = endpoints.savedBase + (after ? '&after=' + encodeURIComponent(after) : '');
        const body = await jsonRequest(fetchFn, url);
        const data = (body && body.data) || {};
        const pageChildren = Array.isArray(data.children) ? data.children : [];
        if (pageChildren.length === 0) break;

        for (const child of pageChildren) {
          const name = child && child.data && child.data.name;
          if (!name || seen.has(name)) continue;
          seen.add(name);
          children.push(child);
        }

        pages += 1;
        emit({ type: 'SRR_PROGRESS', pages: pages, count: children.length });
        const metaNow = (await store.get('meta')) || {};
        await store.set({ meta: Object.assign({}, metaNow, { progress: { pages: pages, count: children.length } }) });

        after = typeof data.after === 'string' && data.after.length > 0 ? data.after : null;
        if (!after) break;
      }

      const fetchedAt = now();
      await store.set({
        raw: children,
        meta: {
          username: username,
          fetchedAt: fetchedAt,
          count: children.length,
          pages: pages,
          truncated: truncated,
          fetching: false,
          fetchStartedAt: startedAt,
          error: null,
          progress: null,
          schema: 1,
        },
      });
      emit({ type: 'SRR_DONE', ok: true, count: children.length, truncated: truncated });
      return { ok: true, count: children.length, truncated: truncated };
    } catch (e) {
      const error = {
        kind: (e && e.kind) || 'unknown',
        message: String((e && e.message) || e),
        at: now(),
      };
      if (e && Number.isFinite(e.retryAfterMs)) error.retryAfterMs = e.retryAfterMs;
      const metaNow = (await store.get('meta')) || {};
      await store.set({
        meta: Object.assign({}, metaNow, { fetching: false, progress: null, error: error }),
      });
      emit({ type: 'SRR_DONE', ok: false, error: error });
      return { ok: false, reason: error.kind, error: error };
    }
  }
  async function fetchSubmitted(username, deps) {
    deps = deps || {};
    const store = deps.store || defaultStore();
    const fetchFn =
      deps.fetchFn ||
      ((url) =>
        fetch(url, {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        }));
    const delayFn = deps.delayFn || sleep;
    const now = deps.now || (() => Date.now());
    const random = deps.random || Math.random;
    const limits = Object.assign({}, LIMITS, deps.limits || {});
    const emit = deps.onEvent || defaultEmit;
    const base = `/user/${encodeURIComponent(username)}/submitted.json?raw_json=1&limit=${limits.PAGE_LIMIT}`;

    const startedAt = now();
    const sMetaBefore = (await store.get('submittedMeta')) || {};
    if (sMetaBefore.fetching && startedAt - (sMetaBefore.fetchStartedAt || 0) < limits.LOCK_STALE_MS) {
      return { ok: false, reason: 'busy' };
    }
    await store.set({
      submittedMeta: Object.assign({}, sMetaBefore, {
        fetching: true,
        fetchStartedAt: startedAt,
        error: null,
        progress: { pages: 0, count: 0 },
      }),
    });

    try {
      const children = [];
      const seen = new Set();
      let after = null;
      let pages = 0;
      let truncated = false;
      let first = true;
      for (;;) {
        if (first) first = false;
        else await delayFn(limits.DELAY_MIN_MS + random() * limits.DELAY_JITTER_MS);
        if (pages >= limits.MAX_PAGES) {
          truncated = true;
          break;
        }
        const url = base + (after ? '&after=' + encodeURIComponent(after) : '');
        const body = await jsonRequest(fetchFn, url);
        const data = (body && body.data) || {};
        const pageChildren = Array.isArray(data.children) ? data.children : [];
        if (pageChildren.length === 0) break;
        for (const child of pageChildren) {
          const name = child && child.data && child.data.name;
          if (!name || seen.has(name)) continue;
          if (child.kind !== 't3') continue;
          seen.add(name);
          children.push({
            name: name,
            title: child.data.title || '',
            permalink: child.data.permalink || '',
            url: child.data.url || '',
            domain: child.data.domain || '',
            createdUtc: child.data.created_utc,
            isSelf: !!child.data.is_self,
            contentKey: contentKeyFor(child.data),
          });
        }
        pages += 1;
        emit({ type: 'SRR_SUBMITTED_PROGRESS', pages: pages, count: children.length });
        await store.set({ submittedMeta: { fetching: true, fetchStartedAt: startedAt, progress: { pages: pages, count: children.length } } });
        after = typeof data.after === 'string' && data.after.length > 0 ? data.after : null;
        if (!after) break;
      }
      const fetchedAt = now();
      await store.set({
        submitted: children,
        submittedMeta: {
          username: username,
          fetchedAt: fetchedAt,
          count: children.length,
          pages: pages,
          truncated: truncated,
          fetching: false,
          fetchStartedAt: startedAt,
          error: null,
          progress: null,
        },
      });
      emit({ type: 'SRR_SUBMITTED_DONE', ok: true, count: children.length, truncated: truncated });
      return { ok: true, count: children.length, truncated: truncated };
    } catch (e) {
      const error = {
        kind: (e && e.kind) || 'unknown',
        message: String((e && e.message) || e),
        at: now(),
      };
      if (e && Number.isFinite(e.retryAfterMs)) error.retryAfterMs = e.retryAfterMs;
      await store.set({ submittedMeta: { fetching: false, progress: null, error: error } });
      emit({ type: 'SRR_SUBMITTED_DONE', ok: false, error: error });
      return { ok: false, reason: error.kind, error: error };
    }
  }


  async function fetchUnsave(id, deps) {
    deps = deps || {};
    const store = deps.store || defaultStore();
    const fetchFn =
      deps.fetchFn ||
      ((url, opts) =>
        fetch(url, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, opts)));
    const now = deps.now || (() => Date.now());
    const delayFn = deps.delayFn || sleep;
    const random = deps.random || Math.random;
    const limits = Object.assign({}, LIMITS, deps.limits || {});
    const emit = deps.onEvent || defaultEmit;

    if (typeof id !== 'string' || !id.startsWith('t3_')) {
      throw fail('bad-id', 'bad id');
    }
    const last = globalThis.__SRR_LAST_UNSAVE__ || 0;
    const gap = now() - last;
    const minGap = limits.DELAY_MIN_MS + random() * limits.DELAY_JITTER_MS;
    if (gap < minGap) await delayFn(minGap - gap);

    let modhash = deps.modhash || globalThis.__SRR_MODHASH__;
    if (!modhash) {
      try {
        const me = await jsonRequest(fetchFn, '/api/me.json?raw_json=1');
        modhash = me && me.data && me.data.modhash ? me.data.modhash : null;
        if (modhash) globalThis.__SRR_MODHASH__ = modhash;
      } catch (_e) {
      }
    }
    if (!modhash) throw fail('session', 'no modhash');

    let res;
    try {
      res = await fetchFn('https://www.reddit.com/api/unsave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Modhash': modhash,
        },
        body: 'id=' + encodeURIComponent(id) + '&uh=' + encodeURIComponent(modhash),
      });
    } catch (_e) {
      throw fail('network', 'network error');
    }
    globalThis.__SRR_LAST_UNSAVE__ = now();
    if (res.status === 429) throw fail('rate-limited', 'rate limited', parseRetryAfter(res));
    if (res.status === 401 || res.status === 403) throw fail('session', 'blocked');
    if (res.status < 200 || res.status >= 300) throw fail('http', 'http ' + res.status);
    emit({ type: 'SRR_UNSAVE_DONE', ok: true, id: id });
    return { ok: true };
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== 'SRR_FETCH') return false;
      sendResponse({ ok: true, started: true });
      fetchAll({}).catch(() => {});
      return false;
    });
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== 'SRR_FETCH_SUBMITTED') return false;
      sendResponse({ ok: true, started: true });
      (async () => {
        try {
          const meta = await (function() {
            return (async function() {
              const s = await defaultStore();
              return await s.get('meta');
            })();
          })();
          const username = meta && meta.username ? meta.username : null;
          if (!username) {
            const err = { kind: 'not-logged-in', message: 'need username', at: Date.now() };
            defaultEmit({ type: 'SRR_SUBMITTED_DONE', ok: false, error: err });
            return;
          }
          await fetchSubmitted(username, {});
        } catch (_e) {
          defaultEmit({ type: 'SRR_SUBMITTED_DONE', ok: false, error: { kind: 'unknown', message: String(_e), at: Date.now() } });
        }
      })();
      return false;
    });

  }

  globalThis.__SRR__ = { fetchAll: fetchAll, fetchSubmitted: fetchSubmitted, fetchUnsave: fetchUnsave, LIMITS: LIMITS };
})();
