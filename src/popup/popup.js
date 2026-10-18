import { exportCSV, exportJSON, triggerDownload } from '../lib/export.js';
import { normalizeNote } from '../lib/notes.js';
import { FETCH } from '../lib/limits.js';
import { parseChildren } from '../lib/parse.js';
import { BASE_DISPLAY_LIMIT, getFiltered, queueSets } from '../lib/select.js';
import { contentKey, buildSubmitUrl, classify } from '../lib/submit.js';
import { renderRows } from '../lib/render.js';

function buildNoteBlock(key, note) {
  const wrapper = document.createElement('div');
  wrapper.className = 'srr-notes';
  const ta = document.createElement('textarea');
  ta.className = 'srr-note-ta';
  ta.placeholder = 'Note (max 2000)';
  ta.dataset.noteKey = key;
  // An in-progress draft survives re-renders (progress events rebuild the list);
  // once saved, the draft is cleared.
  const draft = state.noteDrafts[key];
  ta.value = typeof draft === 'string' ? draft : (note && note.note) || '';
  ta.addEventListener('input', () => {
    state.noteDrafts[key] = ta.value;
  });
  const save = () => {
    const nv = normalizeNote({ note: ta.value, tags: [], updatedAt: Date.now() });
    state.notes[key] = nv;
    delete state.noteDrafts[key];
    chrome.storage.local.set({ notes: state.notes }).catch(() => {});
  };
  ta.addEventListener('blur', save);
  ta.addEventListener('change', save);
  wrapper.appendChild(ta);
  return wrapper;
}

const ERROR_MESSAGES = {
  'not-logged-in': 'Not logged in to Reddit in this tab. Log in, then retry.',
  'rate-limited': 'Reddit rate-limited the requests. Wait a minute before retrying.',
  session: 'Reddit blocked the request (session expired?). Log in again and retry.',
  blocked: 'Reddit returned a non-JSON response (blocked?). Try again later.',
  network: 'Network error. Check your connection and retry.',
  http: 'Reddit returned an unexpected error. Try again later.',
  unknown: 'Something went wrong while fetching. Try again.',
};

const state = {
  tabId: null,
  meta: {},
  posts: [],
  notes: {},
  queue: {},
  filters: { minScore: 0, subreddit: '', hideQueued: false, prefillOnly: false, hideSubmitted: false },
  ui: { displayLimit: BASE_DISPLAY_LIMIT, enableUnsave: false, enableNotes: true },
  displayLimit: BASE_DISPLAY_LIMIT,
  unsaving: new Set(),
  noteDrafts: {},
  floorTimer: 0,
  lastStart: 0,
  toastTimer: 0,
  submitted: [],
  submittedMeta: {},
};

// Posts whose unsave is in flight stay hidden until background confirms.
function currentPosts() {
  return (state.posts || []).filter((p) => !state.unsaving.has(p.name));
}

function isRedditUrl(url) {
  return typeof url === 'string' && /^https?:\/\/([a-z0-9-]+\.)*reddit\.com\//i.test(url);
}

function $(id) {
  return document.getElementById(id);
}

function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.hidden = false;
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 2600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_e) {
    return false;
  }
}

// meta.fetching is only trusted while the fetch it describes can still be
// running. An interrupted fetch (tab navigated away mid-run, page crashed)
// leaves the flag set forever; the fetcher recovers such stale locks after
// LOCK_STALE_MS, and the popup must agree with it or the UI lies.
function isFetchingLive(meta) {
  if (!meta || !meta.fetching) return false;
  const startedAt = Number(meta.fetchStartedAt) || 0;
  return Date.now() - startedAt <= FETCH.LOCK_STALE_MS;
}

function fetchNote(meta) {
  if (isFetchingLive(meta)) return 'Fetching…';
  if (!meta.fetchedAt) return 'Not fetched yet.';
  const since = Date.now() - meta.fetchedAt;
  const minutes = Math.round(since / 60000);
  let base;
  if (minutes < 1) base = 'Fetched just now.';
  else if (minutes < 60) base = `Fetched ${minutes}m ago.`;
  else base = `Fetched ${Math.round(minutes / 60)}h ago.`;
  // Explain WHY the refresh button is locked instead of leaving it a mystery.
  if (!refreshEnabled(meta)) {
    if (meta.error && meta.error.kind === 'rate-limited') {
      const until = (meta.error.at || 0) + (meta.error.retryAfterMs || 0);
      const left = Math.max(1, Math.ceil((until - Date.now()) / 60000));
      return `${base} Rate-limited — retry in ${left}m.`;
    }
    const left = Math.ceil((FETCH.REFRESH_FLOOR_MS - since) / 60000);
    return `${base} Refresh in ${left}m.`;
  }
  return base;
}

function refreshEnabled(meta) {
  if (isFetchingLive(meta)) return false;
  if (meta.fetchedAt && !meta.error && Date.now() - meta.fetchedAt < FETCH.REFRESH_FLOOR_MS) return false;
  if (meta.error && meta.error.kind === 'rate-limited') {
    const until = (meta.error.at || 0) + (meta.error.retryAfterMs || 0);
    if (Date.now() < until) return false;
  }
  return true;
}

function renderProgress(meta) {
  const box = $('progress');
  if (!isFetchingLive(meta)) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const progress = meta.progress || { pages: 0, count: 0 };
  $('progress-text').textContent = `Fetching page ${progress.pages || 0}… (${progress.count || 0} posts)`;
  const pct = Math.min(100, Math.round(((progress.pages || 0) / FETCH.MAX_PAGES) * 100));
  $('progress-fill').style.width = `${Math.max(8, pct)}%`;
}

function renderError(meta) {
  const box = $('error');
  if (!meta.error) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.textContent = ERROR_MESSAGES[meta.error.kind] || ERROR_MESSAGES.unknown;
}

function rebuildSubredditOptions(posts) {
  const select = $('f-sub');
  const current = select.value;
  const subs = [...new Set(posts.map((p) => p.subreddit).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const existing = [...select.options].slice(1).map((o) => o.value);
  if (existing.join('\n') === subs.join('\n')) return;
  select.textContent = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'all';
  select.appendChild(all);
  for (const sub of subs) {
    const opt = document.createElement('option');
    opt.value = sub;
    opt.textContent = sub;
    select.appendChild(opt);
  }
  select.value = subs.includes(current) ? current : '';
  state.filters.subreddit = select.value;
}

async function onRepost(post) {
  const url = buildSubmitUrl(post);
  const res = await chrome.runtime.sendMessage({ type: 'SRR_OPEN_SUBMIT', url }).catch(() => null);
  if (!res || !res.ok) {
    toast('Could not open the Reddit submit page.');
    return;
  }
  if (classify(post) === 'self' && post.selftext) {
    const copied = await copyText(post.selftext);
    toast(copied ? 'Draft opened — post body copied, paste it into the form.' : 'Draft opened — copy the body manually.');
  } else {
    toast('Draft opened — review it and click submit yourself.');
  }
  await markQueued(post, true);
}

async function markQueued(post, queued) {
  const meta = state.meta || {};
  void meta;
  const res = await chrome.storage.local.get('queue');
  const queue = res.queue || {};
  if (queued) {
    queue[post.name] = { queuedAt: Date.now(), contentKey: contentKey(post) };
  } else {
    delete queue[post.name];
  }
  await chrome.storage.local.set({ queue });
}

async function onToggleQueue(post) {
  const sets = queueSets(state.queue || {});
  const queued = sets.queuedNames.has(post.name);
  await markQueued(post, !queued);
  toast(queued ? 'Removed from queue.' : 'Marked as queued.');
}

function unsaveErrorMessage(res) {
  const reason = res && res.reason;
  const messages = {
    'bad-id': 'Could not unsave (unexpected post id).',
    'no-tab': 'Open a reddit.com tab and try again.',
    'no-api': 'Could not reach the Reddit tab — reload it and retry.',
    'rate-limited': 'Reddit rate-limited the unsave. Try again in a minute.',
    session: 'Reddit blocked the unsave (session expired?). Log in again and retry.',
    network: 'Network error — the post was not unsaved.',
    http: 'Reddit returned an error — the post was not unsaved.',
    error: 'Could not unsave the post.',
  };
  return messages[reason] || 'Could not unsave the post.';
}

async function onUnsave(post) {
  if (!state.ui.enableUnsave || !post || !post.name) return;
  // Optimistic: hide the row while background runs fetchUnsave in the tab.
  state.unsaving.add(post.name);
  const q = { ...(state.queue || {}) };
  delete q[post.name];
  state.queue = q;
  chrome.storage.local.set({ queue: q }).catch(() => {});
  refreshView();

  const res = await chrome.runtime
    .sendMessage({ type: 'SRR_UNSAVE', id: post.name, tabId: state.tabId })
    .catch(() => null);
  if (res && res.ok === true) {
    // Background already dropped the post from stored `raw`; clear the
    // in-flight marker so the set can't grow unbounded.
    state.unsaving.delete(post.name);
    toast('Unsaved from your saved list.');
  } else {
    state.unsaving.delete(post.name);
    toast(unsaveErrorMessage(res));
    refreshView();
  }
}

async function refreshView() {
  const stored = await chrome.storage.local.get(['raw', 'meta', 'queue', 'submitted', 'submittedMeta']);
  state.meta = stored.meta || {};
  state.queue = stored.queue || {};
  state.posts = parseChildren(stored.raw);
  state.submitted = stored.submitted || [];
  state.submittedMeta = stored.submittedMeta || {};

  const meta = state.meta;
  $('user').textContent = meta.username ? `u/${meta.username}` : '';
  $('fetch-note').textContent = fetchNote(meta) + (state.submittedMeta && state.submittedMeta.fetchedAt ? ` · submitted ${Math.round((Date.now()-state.submittedMeta.fetchedAt)/60000)}m ago.` : '');
  $('refresh').disabled = !refreshEnabled(meta);
  $('fetch-submitted').disabled = isFetchingLive(state.submittedMeta) || isFetchingLive(meta);
  // The refresh floor is purely a clock wait: schedule a one-shot re-render at
  // expiry so the button re-enables itself even when no storage event fires
  // while the popup stays open.
  if (state.floorTimer) {
    clearTimeout(state.floorTimer);
    state.floorTimer = 0;
  }
  if ($('refresh').disabled && !isFetchingLive(meta) && meta.fetchedAt && !meta.error) {
    const wait = meta.fetchedAt + FETCH.REFRESH_FLOOR_MS + 500 - Date.now();
    if (wait > 0) state.floorTimer = setTimeout(refreshView, wait);
  }
  renderProgress(meta);
  renderError(meta);
  rebuildSubredditOptions(state.posts);

  const { sets, filtered, shown, limit } = getFiltered({ ...state, posts: currentPosts() });

  const list = $('list');
  // Remember which note textarea (if any) is being edited so the re-render
  // below doesn't yank focus mid-typing.
  const active = document.activeElement;
  const focusNote =
    active && active.classList && active.classList.contains('srr-note-ta') ? active : null;
  const focusKey = focusNote ? focusNote.dataset.noteKey : null;
  const selStart = focusNote ? focusNote.selectionStart : null;
  const selEnd = focusNote ? focusNote.selectionEnd : null;

  renderRows(
    list,
    shown.map((post, index) => {
      const key = post.name;
      const note = state.notes && state.notes[key] ? normalizeNote(state.notes[key]) : { note: '', tags: [] };
      return {
        post: post,
        rank: index + 1,
        scoreInfo: post.scoreInfo,
        actions: {
          onRepost: onRepost,
          onToggleQueue: onToggleQueue,
          onUnsave: onUnsave,
        },
        queued: sets.queuedNames.has(post.name),
        linkQueued: !sets.queuedNames.has(post.name) && sets.queuedKeys.has(post.contentKey),
        submittedMatch: post.submittedMatch || null,
        note: note,
        enableUnsave: state.ui.enableUnsave,
        enableNotes: state.ui.enableNotes,
        noteBlock: state.ui.enableNotes ? buildNoteBlock(key, note) : null,
      };
    }),
    document
  );

  if (focusKey) {
    const ta = list.querySelector('[data-note-key="' + focusKey + '"]');
    if (ta) {
      ta.focus();
      if (selStart != null) {
        try {
          ta.setSelectionRange(selStart, selEnd);
        } catch (_e) {
          /* selection unsupported */
        }
      }
    }
  }

  const empty = $('empty');
  if (state.posts.length === 0) {
    empty.hidden = false;
    empty.textContent = isFetchingLive(meta) ? '' : 'No saved posts loaded yet — click "Fetch saved posts".';
  } else if (filtered.length === 0) {
    empty.hidden = false;
    empty.textContent = 'No posts match the current filters.';
  } else {
    empty.hidden = true;
  }

  const more = $('more');
  more.hidden = filtered.length <= limit;
  $('truncated').hidden = !meta.truncated;
}

async function onFetchSubmitted() {
  if (state.tabId == null) return;
  if (isFetchingLive(state.submittedMeta) || isFetchingLive(state.meta)) {
    toast('Already fetching…');
    return;
  }
  const res = await chrome.runtime
    .sendMessage({ type: 'SRR_FETCH_SUBMITTED', tabId: state.tabId })
    .catch((err) => ({ ok: false, reason: 'error', message: String(err) }));
  if (res && res.ok === false) {
    toast(res.message || 'Could not start fetching submitted.');
    return;
  }
  toast('Checking your submitted posts…');
  await refreshView();
}

async function onRefresh() {
  if (state.tabId == null) return;
  const now = Date.now();
  if (isFetchingLive(state.meta) || now - state.lastStart < 1500) {
    toast('Already fetching…');
    return;
  }
  if (!refreshEnabled(state.meta)) {
    toast('Please wait a bit between fetches.');
    return;
  }
  state.lastStart = now;
  const res = await chrome.runtime
    .sendMessage({ type: 'SRR_START_FETCH', tabId: state.tabId })
    .catch((err) => ({ ok: false, reason: 'error', message: String(err) }));
  if (res && res.ok === false && res.reason === 'busy') {
    toast('Already fetching…');
    return;
  }
  if (res && res.ok === false) {
    toast(res.message || 'Could not start fetching.');
    return;
  }
  await refreshView();
}

function resetPaging() {
  state.displayLimit = (state.ui && state.ui.displayLimit) || BASE_DISPLAY_LIMIT;
}

function bindFilters() {
  $('f-minscore').addEventListener('change', (e) => {
    const v = Number(e.target.value);
    state.filters.minScore = Number.isFinite(v) && v > 0 ? v : 0;
    resetPaging();
    refreshView();
  });
  $('f-sub').addEventListener('change', (e) => {
    state.filters.subreddit = e.target.value;
    resetPaging();
    refreshView();
  });
  $('f-hidequeued').addEventListener('change', (e) => {
    state.filters.hideQueued = e.target.checked;
    resetPaging();
    refreshView();
  });
  $('f-prefill').addEventListener('change', (e) => {
    state.filters.prefillOnly = e.target.checked;
    resetPaging();
    refreshView();
  });
  $('f-hidesubmitted').addEventListener('change', (e) => {
    state.filters.hideSubmitted = e.target.checked;
    resetPaging();
    refreshView();
  });
  $('f-enableunsave').addEventListener('change', (e) => {
    state.ui.enableUnsave = e.target.checked;
    chrome.storage.local.set({ ui: state.ui }).catch(() => {});
    refreshView();
  });
  const en = $('f-enablenotes');
  if (en) {
    en.addEventListener('change', (e) => {
      state.ui.enableNotes = e.target.checked;
      chrome.storage.local.set({ ui: state.ui }).catch(() => {});
      refreshView();
    });
  }
}

async function init() {
  $('refresh').addEventListener('click', onRefresh);
  $('fetch-submitted').addEventListener('click', onFetchSubmitted);
  $('more').addEventListener('click', () => {
    state.displayLimit += BASE_DISPLAY_LIMIT;
    refreshView();
  });
  bindFilters();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.meta || changes.raw || changes.queue || changes.submitted || changes.submittedMeta) refreshView();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && (msg.type === 'SRR_PROGRESS' || msg.type === 'SRR_DONE' || msg.type === 'SRR_SUBMITTED_PROGRESS' || msg.type === 'SRR_SUBMITTED_DONE')) refreshView();
  });

  try {
    const s = await chrome.storage.local.get(['ui', 'notes']);
    if (s.ui) {
      if (s.ui.displayLimit) state.displayLimit = Number(s.ui.displayLimit) || BASE_DISPLAY_LIMIT;
      if (typeof s.ui.enableUnsave === 'boolean') state.ui.enableUnsave = s.ui.enableUnsave;
      $('f-enableunsave').checked = !!state.ui.enableUnsave;
      if (typeof s.ui.enableNotes === 'boolean') state.ui.enableNotes = s.ui.enableNotes;
      $('f-enablenotes').checked = !!state.ui.enableNotes;
    }
    if (s.notes) state.notes = s.notes;
  } catch (_e) {}

  $('btn-export-csv').addEventListener('click', () => {
    const { filtered } = getFiltered({ ...state, posts: currentPosts() });
    const csv = exportCSV(filtered, { username: state.meta && state.meta.username }, Date.now());
    triggerDownload('srr-saved-' + new Date().toISOString().slice(0,19).replace(/[:]/g,'-') + '.csv', 'text/csv', csv);
  });
  $('btn-export-json').addEventListener('click', () => {
    const { filtered } = getFiltered({ ...state, posts: currentPosts() });
    const json = exportJSON(filtered, { username: state.meta && state.meta.username }, Date.now());
    triggerDownload('srr-saved-' + new Date().toISOString().slice(0,19).replace(/[:]/g,'-') + '.json', 'application/json', json);
  });

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  state.tabId = tab && typeof tab.id === 'number' ? tab.id : null;

  if (!tab || !isRedditUrl(tab.url)) {
    $('view-guidance').hidden = false;
    $('view-app').hidden = true;
    return;
  }
  $('view-guidance').hidden = true;
  $('view-app').hidden = false;
  await refreshView();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

export { isRedditUrl, refreshEnabled, fetchNote, isFetchingLive, ERROR_MESSAGES };

