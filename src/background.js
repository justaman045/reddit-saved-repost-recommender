// Background service worker: routes popup requests that need tab access.
// Fetching itself runs in the injected content script (see src/content/fetcher.js).

async function startFetch(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/content/fetcher.js'],
  });
  return await chrome.tabs.sendMessage(tabId, { type: 'SRR_FETCH' });
}

async function handleUnsave(msg) {
  const id = typeof msg.id === 'string' ? msg.id : '';
  if (!/^t3_[A-Za-z0-9_]+$/.test(id)) return { ok: false, reason: 'bad-id' };
  const tabId = msg.tabId;
  if (typeof tabId !== 'number') return { ok: false, reason: 'no-tab' };

  // Ensure the fetcher is injected: it owns fetchUnsave (throttle, modhash cache).
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/content/fetcher.js'],
  });
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async function (postId) {
      const api = globalThis.__SRR__;
      if (!api || typeof api.fetchUnsave !== 'function') return { ok: false, reason: 'no-api' };
      try {
        await api.fetchUnsave(postId);
        return { ok: true };
      } catch (e) {
        const out = { ok: false, reason: (e && e.kind) || 'unknown', message: String((e && e.message) || e) };
        if (e && Number.isFinite(e.retryAfterMs)) out.retryAfterMs = e.retryAfterMs;
        return out;
      }
    },
    args: [id],
  });
  const out = results && results[0] && results[0].result;
  if (!out || out.ok !== true) return out || { ok: false, reason: 'unknown' };

  // Reddit accepted the unsave; drop the post from the stored raw list so it
  // cannot reappear the next time the popup reads storage.
  const stored = await chrome.storage.local.get('raw');
  if (Array.isArray(stored.raw)) {
    const cleaned = stored.raw.filter((c) => !(c && c.data && c.data.name === id));
    if (cleaned.length !== stored.raw.length) await chrome.storage.local.set({ raw: cleaned });
  }
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;

  if (msg.type === 'SRR_START_FETCH') {
    startFetch(msg.tabId)
      .then((res) => sendResponse(res || { ok: true }))
      .catch((err) => sendResponse({ ok: false, reason: 'error', message: String(err && err.message ? err.message : err) }));
    return true;
  }

  if (msg.type === 'SRR_OPEN_SUBMIT') {
    if (typeof msg.url === 'string' && msg.url.startsWith('https://www.reddit.com/')) {
      chrome.tabs.create({ url: msg.url });
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, reason: 'bad-url' });
    }
    return false;
  }

  if (msg.type === 'SRR_UNSAVE') {
    handleUnsave(msg)
      .then((res) => sendResponse(res || { ok: false, reason: 'unknown' }))
      .catch((err) => sendResponse({ ok: false, reason: 'error', message: String(err && err.message ? err.message : err) }));
    return true;
  }

  if (msg.type === 'SRR_PING') {
    sendResponse({ ok: true, pong: true });
    return false;
  }

  return false;
});
