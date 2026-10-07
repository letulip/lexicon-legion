// Word groups: merging enabled groups into one word list, distractors. Pure (fetch lives in app.js).
export function mergeGroups(groups, enabledIds, custom = {}) {
  const byId = new Map();
  for (const g of groups) {
    if (!enabledIds.includes(g.id)) continue;
    for (const w of g.words) {
      const prev = byId.get(w.id);
      if (prev) { prev.groups.push(g.id); continue; }
      byId.set(w.id, { ...w, groups: [g.id] });
    }
  }
  for (const id in custom) if (!byId.has(id)) byId.set(id, { ...custom[id], id, groups: ['custom'] });
  return [...byId.values()];
}

const stems = (ru) => ru.toLowerCase().replace(/[^а-яё ]/g, ' ').split(/\s+/).filter(x => x.length > 3).map(x => x.slice(0, 5));

// Three meaning-distractors for a word: same part of speech, no shared stems with the answer.
export function pickDistractors(word, all, n = 3, rnd = Math.random) {
  const mine = new Set(word.ru.flatMap(stems));
  const pool = all.filter(o => o.id !== word.id && o.pos === word.pos && !o.ru.flatMap(stems).some(s => mine.has(s)));
  const out = [], used = new Set([word.ru[0]]);
  let guard = 0;
  while (out.length < n && pool.length && guard++ < 200) {
    const c = pool[Math.floor(rnd() * pool.length)];
    if (!used.has(c.ru[0])) { used.add(c.ru[0]); out.push(c.ru[0]); }
  }
  return out;
}

// Three English-word distractors (reverse mode): same part of speech, similar length preferred.
export function pickWordDistractors(word, all, n = 3, rnd = Math.random) {
  const pool = all.filter(o => o.id !== word.id && o.pos === word.pos);
  pool.sort((a, b) => Math.abs(a.w.length - word.w.length) - Math.abs(b.w.length - word.w.length));
  const near = pool.slice(0, Math.max(12, n * 4));
  const out = [], used = new Set([word.w]);
  let guard = 0;
  while (out.length < n && near.length && guard++ < 200) {
    const c = near[Math.floor(rnd() * near.length)];
    if (!used.has(c.w)) { used.add(c.w); out.push(c.w); }
  }
  return out;
}

export function shuffle(a, rnd = Math.random) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
