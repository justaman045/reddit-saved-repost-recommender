// Pure helpers for the user's submitted posts.
// Works with t3 children from /user/{username}/submitted.json.
import { contentKey } from './submit.js';

export function normalizeSubmitted(child) {
  if (!child || child.kind !== 't3' || !child.data || typeof child.data !== 'object') return null;
  const d = child.data;
  return {
    name: typeof d.name === 'string' ? d.name : '',
    title: typeof d.title === 'string' ? d.title : '',
    permalink: typeof d.permalink === 'string' ? d.permalink : '',
    url: typeof d.url === 'string' ? d.url : '',
    domain: typeof d.domain === 'string' ? d.domain : '',
    createdUtc: typeof d.created_utc === 'number' && Number.isFinite(d.created_utc) ? d.created_utc : 0,
    isSelf: d.is_self === true,
  };
}

export function parseSubmitted(children) {
  if (!Array.isArray(children)) return [];
  const seen = new Set();
  const out = [];
  for (const child of children) {
    const p = normalizeSubmitted(child);
    if (!p || !p.name || seen.has(p.name)) continue;
    seen.add(p.name);
    const key = contentKey({
      url: p.url,
      permalink: p.permalink,
      name: p.name,
      isSelf: p.isSelf,
      domain: p.domain,
    });
    out.push({ ...p, contentKey: key });
  }
  return out;
}

export function submittedIndex(submittedList) {
  const keys = new Set();
  const byKey = new Map();
  for (const p of submittedList || []) {
    if (p.contentKey) {
      keys.add(p.contentKey);
      if (!byKey.has(p.contentKey)) byKey.set(p.contentKey, p);
    }
  }
  return { keys, byKey, list: submittedList || [] };
}
