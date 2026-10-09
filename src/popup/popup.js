import { exportCSV, exportJSON, triggerDownload } from '../lib/export.js';
import { normalizeNote } from '../lib/notes.js';
import { FETCH } from '../lib/limits.js';
import { parseChildren } from '../lib/parse.js';
import { rankPosts } from '../lib/score.js';
import { applyFilters, queueSets } from '../lib/select.js';
import { contentKey, buildSubmitUrl, classify } from '../lib/submit.js';
import { renderRows } from '../lib/render.js';
import { submittedIndex } from '../lib/submitted.js';

function buildNoteBlock(key, note) {
  const wrapper = document.createElement("div");
  wrapper.className = "srr-notes";
  const ta = document.createElement("textarea");
  ta.className = "srr-note-ta";
  ta.placeholder = "Note (max 2000)";
  ta.value = (note && note.note) || "";
  const save = () => {
    const nv = normalizeNote({ note: ta.value, tags: [], updatedAt: Date.now() });
    state.notes[key] = nv;
    chrome.storage.local.set({ notes: state.notes }).catch(() => {});
  };
  ta.addEventListener("blur", save);
  ta.addEventListener("change", save);
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
  filters: { minScore: 0, subreddit: '', hideQueued: false, prefillOnly: false, hideSubmitted: false },
  ui: { displayLimit: 100, enableUnsave: false, enableNotes: true },
  displayLimit: 100,
  lastStart: 0,
  toastTimer: 0,
  submitted: [],
  submittedMeta: {},
};

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

function fetchNote(meta) {
  if (meta.fetching) return 'Fetching…';
  if (!meta.fetchedAt) return 'Not fetched yet.';
  const minutes = Math.round((Date.now() - meta.fetchedAt) / 60000);
  if (minutes < 1) return 'Fetched just now.';
  if (minutes < 60) return `Fetched ${minutes}m ago.`;
  return `Fetched ${Math.round(minutes / 60)}h ago.`;
}

function refreshEnabled(meta) {
  if (meta.fetching) return false;
  if (meta.fetchedAt && !meta.error && Date.now() - meta.fetchedAt < FETCH.REFRESH_FLOOR_MS) return false;
  if (meta.error && meta.error.kind === 'rate-limited') {
    const until = (meta.error.at || 0) + (meta.error.retryAfterMs || 0);
    if (Date.now() < until) return false;
  }
  return true;
}

function renderProgress(meta) {
  const box = $('progress');
  if (!meta.fetching) {
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
  $('fetch-submitted').disabled = state.submittedMeta && state.submittedMeta.fetching || (meta && meta.fetching);
  renderProgress(meta);
  renderError(meta);
  rebuildSubredditOptions(state.posts);

  const ranked = rankPosts(state.posts);
  const sets = queueSets(state.queue);
  const sIndex = submittedIndex(state.submitted);
  const filtered = applyFilters(ranked, {
    minScore: state.filters.minScore,
    subreddit: state.filters.subreddit,
    hideQueued: state.filters.hideQueued,
    prefillOnly: state.filters.prefillOnly,
    hideSubmitted: state.filters.hideSubmitted,
    queuedNames: sets.queuedNames,
    queuedKeys: sets.queuedKeys,
    submittedKeys: sIndex.keys,
  });
  const shown = filtered.slice(0, (state.ui && state.ui.displayLimit) || state.displayLimit);

  const list = $('list');
  renderRows(
    list,
    shown.map((post, index) => {
      const sm = (sIndex.byKey || sIndex.map).get(post.contentKey);
      const key = post.name;
      const note = state.notes && state.notes[key] ? normalizeNote(state.notes[key]) : { note: '', tags: [] };
      return {
        post: post,
        rank: index + 1,
        scoreInfo: post.scoreInfo,
        actions: {
          onRepost: (p) => {
            chrome.runtime
              .sendMessage({ type: 'SRR_OPEN_SUBMIT', url: buildSubmitUrl(p), title: p.title })
              .catch(() => {});
          },
          onToggleQueue: onToggleQueue,
          onUnsave: (p) => {
            if (!state.ui.enableUnsave) return;
            chrome.runtime.sendMessage({ type: 'SRR_UNSAVE', id: p.name }).catch(() => {});
            const q = { ...state.queue };
            delete q[p.name];
            const raw = (state.posts || []).filter((x) => x.name !== p.name);
            chrome.storage.local.set({ queue: q }).catch(() => {});
            state.queue = q;
            state.posts = raw;
            refreshView();
          },
        },
        queued: sets.queuedNames.has(post.name),
        linkQueued: !sets.queuedNames.has(post.name) && sets.queuedKeys.has(contentKey(post)),
        submittedMatch: sm || null,
        note: note,
        enableUnsave: state.ui.enableUnsave,
        enableNotes: state.ui.enableNotes,
        noteBlock: buildNoteBlock(key, note),
      };
    }),
    document
  );

  const empty = $('empty');
  if (state.posts.length === 0) {
    empty.hidden = false;
    empty.textContent = meta.fetching ? '' : 'No saved posts loaded yet — click "Fetch saved posts".';
  } else if (filtered.length === 0) {
    empty.hidden = false;
    empty.textContent = 'No posts match the current filters.';
  } else {
    empty.hidden = true;
  }

  const more = $('more');
  more.hidden = filtered.length <= ((state.ui && state.ui.displayLimit) || state.displayLimit);
  $('truncated').hidden = !meta.truncated;
}

async function onFetchSubmitted() {
  if (state.tabId == null) return;
  if (state.submittedMeta.fetching || (state.meta && state.meta.fetching)) {
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
  if (state.meta.fetching || now - state.lastStart < 1500) {
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

function bindFilters() {
  $('f-minscore').addEventListener('change', (e) => {
    const v = Number(e.target.value);
    state.filters.minScore = Number.isFinite(v) && v > 0 ? v : 0;
    state.displayLimit = (state.ui && state.ui.displayLimit) || 100;
    refreshView();
  });
  $('f-sub').addEventListener('change', (e) => {
    state.filters.subreddit = e.target.value;
    state.displayLimit = (state.ui && state.ui.displayLimit) || 100;
    refreshView();
  });
  $('f-hidequeued').addEventListener('change', (e) => {
    state.filters.hideQueued = e.target.checked;
    state.displayLimit = (state.ui && state.ui.displayLimit) || 100;
    refreshView();
  });
  $('f-prefill').addEventListener('change', (e) => {
    state.filters.prefillOnly = e.target.checked;
    state.displayLimit = (state.ui && state.ui.displayLimit) || 100;
    refreshView();
  });
  $('f-hidesubmitted').addEventListener('change', (e) => {
    state.filters.hideSubmitted = e.target.checked;
    state.displayLimit = (state.ui && state.ui.displayLimit) || 100;
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
    state.displayLimit = ((state.ui && state.ui.displayLimit) || 100) + 100;
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
      if (s.ui.displayLimit) state.ui.displayLimit = s.ui.displayLimit;
      if (typeof s.ui.enableUnsave === 'boolean') state.ui.enableUnsave = s.ui.enableUnsave;
      $('f-enableunsave').checked = !!state.ui.enableUnsave;
      if (typeof s.ui.enableNotes === 'boolean') state.ui.enableNotes = s.ui.enableNotes;
      $('f-enablenotes').checked = !!state.ui.enableNotes;
    }
    if (s.notes) state.notes = s.notes;
  } catch (_e) {}

  $('btn-export-csv').addEventListener('click', () => {
    const items = (globalThis.__filtered || [])(state);
    const csv = exportCSV(items, {}, Date.now());
    triggerDownload('srr-saved-' + new Date().toISOString().slice(0,19).replace(/[:]/g,'-') + '.csv', 'text/csv', csv);
  });
  $('btn-export-json').addEventListener('click', () => {
    const items = (globalThis.__filtered || [])(state);
    const json = exportJSON(items, {}, Date.now());
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

export { isRedditUrl, refreshEnabled, fetchNote, ERROR_MESSAGES };

