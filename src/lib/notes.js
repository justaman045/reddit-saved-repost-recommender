export function normalizeNote(n) {
  if (!n || typeof n !== 'object') return { note: '', tags: [], updatedAt: 0 };
  const note = typeof n.note === 'string' ? n.note.trim() : '';
  const tags = [];
  if (Array.isArray(n.tags)) {
    for (const t of n.tags) {
      if (typeof t !== 'string') continue;
      const tt = t.trim();
      if (!tt) continue;
      const lt = tt.toLowerCase();
      if (!tags.find((x) => x.toLowerCase() === lt)) tags.push(tt.slice(0, 24));
      if (tags.length > 8) break;
    }
  }
  const updatedAt = typeof n.updatedAt === 'number' && Number.isFinite(n.updatedAt) ? n.updatedAt : 0;
  return { note: note.slice(0, 2000), tags, updatedAt };
}

export function mergeNotes(current = {}, incoming = {}) {
  const out = { ...current };
  for (const [k, v] of Object.entries(incoming || {})) {
    const nv = normalizeNote(v);
    const cv = normalizeNote(out[k]);
    if (nv.updatedAt >= cv.updatedAt) out[k] = nv;
    else out[k] = cv;
  }
  return out;
}

export function filterByTag(notesMap, names, tag) {
  const res = [];
  const t = typeof tag === 'string' ? tag.toLowerCase() : '';
  if (!t) return res;
  for (const name of names || []) {
    const nm = normalizeNote(notesMap[name]);
    if (nm.tags.some((x) => x.toLowerCase() === t)) res.push(name);
  }
  return res;
}
