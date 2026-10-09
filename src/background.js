// Background service worker: routes popup requests that need tab access.
// Fetching itself runs in the injected content script (see src/content/fetcher.js).

async function startFetch(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/content/fetcher.js'],
  });
  return await chrome.tabs.sendMessage(tabId, { type: 'SRR_FETCH' });
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

  if (msg.type === 'SRR_PING') {
    sendResponse({ ok: true, pong: true });
    return false;
  }

  return false;
});
