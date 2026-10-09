export function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

export function toRatio(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) {
    return value;
  }
  return null;
}

export function normalizeThing(child) {
  if (!child || child.kind !== 't3' || !child.data || typeof child.data !== 'object') return null;
  const d = child.data;
  return {
    name: typeof d.name === 'string' ? d.name : '',
    id: typeof d.id === 'string' ? d.id : '',
    title: typeof d.title === 'string' ? d.title : '',
    author: typeof d.author === 'string' ? d.author : '',
    subreddit: typeof d.subreddit === 'string' ? d.subreddit : '',
    url: typeof d.url === 'string' ? d.url : '',
    permalink: typeof d.permalink === 'string' ? d.permalink : '',
    score: Math.max(-1000000, toNumber(d.score, 0)),
    upvoteRatio: toRatio(d.upvote_ratio),
    numComments: Math.max(0, toNumber(d.num_comments, 0)),
    createdUtc: Math.max(0, toNumber(d.created_utc, 0)),
    isSelf: d.is_self === true,
    isGallery: d.is_gallery === true,
    isVideo: d.is_video === true,
    over18: d.over_18 === true,
    domain: typeof d.domain === 'string' ? d.domain : '',
    crosspostParent: typeof d.crosspost_parent === 'string' ? d.crosspost_parent : null,
    selftext: typeof d.selftext === 'string' ? d.selftext : '',
  };
}

export function parseChildren(children) {
  if (!Array.isArray(children)) return [];
  const seen = new Set();
  const out = [];
  for (const child of children) {
    const post = normalizeThing(child);
    if (!post || !post.name || seen.has(post.name)) continue;
    seen.add(post.name);
    out.push(post);
  }
  return out;
}
