function escapeCsv(value) {
  const s = String(value == null ? '' : value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function ageDays(createdUtc, nowMs = Date.now()) {
  if (!Number.isFinite(createdUtc) || createdUtc <= 0) return '';
  const days = (nowMs / 1000 - createdUtc) / 86400;
  if (!Number.isFinite(days) || days < 0) return '';
  return Math.round(days * 10) / 10;
}

export function exportJSON(filtered, meta = {}, nowMs = Date.now()) {
  const items = filtered.map((p, i) => ({
    rank: i + 1,
    name: p.name,
    title: p.title,
    subreddit: p.subreddit,
    domain: p.domain,
    score: p.score,
    upvote_ratio: p.upvoteRatio,
    num_comments: p.numComments,
    created_utc: p.createdUtc,
    permalink: p.permalink,
    url: p.url,
    contentKey: p.contentKey,
    scoreInfo: p.scoreInfo,
    submitted_matched: p.submittedMatch ? true : false,
    submitted_permalink: p.submittedMatch ? p.submittedMatch.permalink : null,
  }));
  return JSON.stringify({ exportedAt: nowMs, meta: meta || {}, items }, null, 2);
}

export function exportCSV(filtered, meta = {}, nowMs = Date.now()) {
  void meta; void nowMs;
  const headers = [
    'rank','title','subreddit','domain','score','upvote_ratio','num_comments','age_days','permalink','url','contentKey','submitted_matched','submitted_permalink'
  ];
  const lines = [headers.join(',')];
  filtered.forEach((p, i) => {
    const row = [
      i + 1,
      p.title || '',
      p.subreddit || '',
      p.domain || '',
      p.score ?? '',
      (typeof p.upvoteRatio === 'number' ? p.upvoteRatio : ''),
      p.numComments ?? '',
      ageDays(p.createdUtc, Date.now()),
      p.permalink || '',
      p.url || '',
      p.contentKey || '',
      p.submittedMatch ? 'true' : 'false',
      p.submittedMatch ? (p.submittedMatch.permalink || '') : '',
    ].map((v) => escapeCsv(v));
    lines.push(row.join(','));
  });
  return lines.join('\r\n');
}

export function triggerDownload(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
