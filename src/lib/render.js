// All Reddit-derived strings are written with textContent only. Never innerHTML.

export function formatScore(n) {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(n));
}

export function formatAge(createdUtc, nowMs = Date.now()) {
  if (!Number.isFinite(createdUtc) || createdUtc <= 0) return 'unknown age';
  const seconds = Math.max(0, nowMs / 1000 - createdUtc);
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  const months = days / 30.44;
  if (months < 12) return `${Math.round(months)}mo`;
  return `${(months / 12).toFixed(1).replace(/\.0$/, '')}y`;
}

export function formatRatio(ratio) {
  if (!(typeof ratio === 'number' && Number.isFinite(ratio))) return 'ratio n/a';
  return `${Math.round(ratio * 100)}%`;
}

export function formatParts(scoreInfo) {
  const p = scoreInfo.parts;
  const one = (v) => (Number.isFinite(v) ? v.toFixed(2) : '0.00');
  return `score ${one(p.score)} · comments ${one(p.comments)} · ratio ${one(p.ratio)} · recency ${one(p.recency)}`;
}

export function safeExternalHref(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'http:') return String(url);
  } catch {
    /* fall through */
  }
  return null;
}

export function redditHref(post, origin = 'https://www.reddit.com') {
  const p = post.permalink || '';
  if (/^https?:\/\//i.test(p)) return p;
  if (!p) return null;
  return origin + (p.startsWith('/') ? p : '/' + p);
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function button(doc, label, className, onClick) {
  const btn = el(doc, 'button', className, label);
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}

function link(doc, text, href, className) {
  const a = el(doc, 'a', className, text);
  if (href) {
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  } else {
    a.removeAttribute ? a.removeAttribute('href') : (a.href = '');
  }
  return a;
}

export function buildRow(item, doc = globalThis.document) {
  const { post, rank, scoreInfo } = item;
  const row = el(doc, 'article', 'srr-row');

  const head = el(doc, 'div', 'srr-head');
  head.appendChild(el(doc, 'span', 'srr-rank', `#${rank}`));
  const total = el(doc, 'span', 'srr-total');
  total.appendChild(el(doc, 'strong', null, String(Math.round(scoreInfo.total))));
  total.appendChild(el(doc, 'span', 'srr-denom', '/100'));
  head.appendChild(total);
  if (post.over18) head.appendChild(el(doc, 'span', 'srr-nsfw', 'NSFW'));
  if (scoreInfo && scoreInfo.ratioMissing) {
    head.appendChild(el(doc, 'span', 'srr-na', 'ratio missing'));
  }
  row.appendChild(head);

  row.appendChild(link(doc, post.title || '(untitled)', redditHref(post), 'srr-title'));

  const meta = el(doc, 'div', 'srr-meta');
  meta.appendChild(el(doc, 'span', 'srr-sub', `r/${post.subreddit || '?'}`));
  meta.appendChild(el(doc, 'span', 'srr-score', `▲ ${formatScore(post.score)}`));
  meta.appendChild(el(doc, 'span', 'srr-ratio', formatRatio(post.upvoteRatio)));
  meta.appendChild(el(doc, 'span', 'srr-comments', `${formatScore(post.numComments)} comments`));
  meta.appendChild(el(doc, 'span', 'srr-age', formatAge(post.createdUtc)));
  row.appendChild(meta);

  row.appendChild(el(doc, 'div', 'srr-parts', formatParts(scoreInfo)));

  const actions = el(doc, 'div', 'srr-actions');
  actions.appendChild(button(doc, 'Repost', 'srr-btn srr-repost', () => item.actions.onRepost(post)));
  if (item.actions.onToggleQueue) {
    const queued = item.queued === true;
    actions.appendChild(
      button(doc, queued ? 'Unqueue' : 'Queue', 'srr-btn srr-queue', () => item.actions.onToggleQueue(post)),
    );
  }
  if (item.enableUnsave) {
    actions.appendChild(
      button(doc, 'Unsave', 'srr-btn srr-unsave', () => {
        if (item.actions.onUnsave) item.actions.onUnsave(post, item.submittedMatch || null);
      }),
    );
  }
  const external = safeExternalHref(post.url);
  const openHref = external || (post.url ? null : redditHref(post));
  if (openHref) actions.appendChild(link(doc, 'Open', openHref, 'srr-btn srr-open'));
  row.appendChild(actions);

  if (item.submittedMatch) {
    const b = el(doc, 'div', 'srr-badge');
    const a = link(doc, 'Already posted by you', redditHref({ permalink: item.submittedMatch.permalink }), 'srr-badge-link');
    b.appendChild(a);
    row.appendChild(b);
  }

  if (item.linkQueued) {
    row.appendChild(el(doc, 'div', 'srr-note', 'Same link already queued from another saved copy.'));
  }

  if (item.enableNotes && item.noteBlock) {
    row.appendChild(item.noteBlock);
  }
  return row;
}

export function renderRows(container, items, doc = globalThis.document) {
  container.textContent = '';
  for (const item of items) container.appendChild(buildRow(item, doc));
}
