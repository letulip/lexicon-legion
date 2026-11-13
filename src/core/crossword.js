// Classic (sparse, criss-cross) crossword generator. Pure, DOM-free, seeded: one seed = one puzzle anywhere.
// Entry: { id, word, x, y, dir: 'a' | 'd', num }. cells: { "x,y": letter }.

export const GEN_VERSION = 1;
export const GRID_W = 9, GRID_H = 10, MAX_LEN = 10, MIN_MET = 15;
const DAY = 86400000;
const DIRS = { a: [1, 0], d: [0, 1] };

// Seeded rng: string/number -> 32-bit hash -> mulberry32. Floats in [0, 1).
export function makeRng(seed) {
  const s = String(seed);
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const eligible = (w, maxW = GRID_W) => /^[a-z]+$/.test(w.w) && w.w.length <= Math.min(MAX_LEN, maxW);

// One greedy attempt on a sparse grid; returns raw placements (unshifted) and crossing count.
function attempt(pool, w, h, rng) {
  const grid = new Map(); // "x,y" -> { ch, dirs }
  const placed = [];
  const free = (x, y) => !grid.has(x + ',' + y);
  // Crossings the word would make at (x,y,dir), or -1 when illegal.
  function score(word, x, y, dir) {
    const [dx, dy] = DIRS[dir], n = word.length;
    if (x < 0 || y < 0 || x + dx * (n - 1) >= w || y + dy * (n - 1) >= h) return -1;
    if (!free(x - dx, y - dy) || !free(x + dx * n, y + dy * n)) return -1;
    let cross = 0;
    for (let i = 0; i < n; i++) {
      const cx = x + dx * i, cy = y + dy * i, c = grid.get(cx + ',' + cy);
      if (c) {
        if (c.ch !== word[i] || c.dirs.includes(dir)) return -1;
        cross++;
      } else if (!free(cx + dy, cy + dx) || !free(cx - dy, cy - dx)) return -1;
    }
    return cross;
  }
  function put(item, x, y, dir) {
    const [dx, dy] = DIRS[dir];
    for (let i = 0; i < item.w.length; i++) {
      const k = (x + dx * i) + ',' + (y + dy * i), c = grid.get(k);
      if (c) c.dirs += dir; else grid.set(k, { ch: item.w[i], dirs: dir });
    }
    placed.push({ id: item.id, word: item.w, x, y, dir });
  }
  const cand = pool.map(it => ({ it, k: rng() })).sort((p, q) => p.k - q.k).map(p => p.it);
  const first = cand[0];
  if (first.w.length <= w) put(first, (w - first.w.length) >> 1, h >> 1, 'a');
  else put(first, w >> 1, (h - first.w.length) >> 1, 'd');
  for (let pass = 0, n = 0; pass < 6 && placed.length !== n; pass++) {
    n = placed.length;
    for (const item of cand) {
      if (placed.some(p => p.id === item.id)) continue;
      let best = null;
      for (const [k, c] of [...grid]) {
        const [cx, cy] = k.split(',').map(Number);
        for (let i = 0; i < item.w.length; i++) {
          if (item.w[i] !== c.ch) continue;
          for (const dir of ['a', 'd']) {
            if (c.dirs.includes(dir)) continue;
            const x = dir === 'a' ? cx - i : cx, y = dir === 'a' ? cy : cy - i;
            const s = score(item.w, x, y, dir);
            if (s >= 1 && (!best || s > best.s)) best = { s, x, y, dir };
          }
        }
      }
      if (best) put(item, best.x, best.y, best.dir);
    }
  }
  const crossings = [...grid.values()].filter(c => c.dirs.length === 2).length;
  return { placed, crossings };
}

// Shift the bounding box to the grid centre, build cells, number entries.
function finish(placed, w, h, seed) {
  const ends = placed.map(p => [p.x + (p.dir === 'a' ? p.word.length - 1 : 0), p.y + (p.dir === 'd' ? p.word.length - 1 : 0)]);
  const x0 = Math.min(...placed.map(p => p.x)), y0 = Math.min(...placed.map(p => p.y));
  const bw = Math.max(...ends.map(e => e[0])) - x0 + 1, bh = Math.max(...ends.map(e => e[1])) - y0 + 1;
  const ox = ((w - bw) >> 1) - x0, oy = ((h - bh) >> 1) - y0;
  const entries = placed.map(p => ({ ...p, x: p.x + ox, y: p.y + oy, num: 0 }));
  return { w, h, seed, entries: number(entries), cells: cellsOf(entries) };
}

function cellsOf(entries) {
  const cells = {};
  for (const e of entries) {
    const [dx, dy] = DIRS[e.dir];
    for (let i = 0; i < e.word.length; i++) cells[(e.x + dx * i) + ',' + (e.y + dy * i)] = e.word[i];
  }
  return cells;
}

// Standard numbering: row-major scan; a shared start cell shares its number. Returns sorted entries.
function number(entries) {
  const starts = [...new Set(entries.map(e => e.y * 1e3 + e.x))].sort((p, q) => p - q);
  for (const e of entries) e.num = starts.indexOf(e.y * 1e3 + e.x) + 1;
  return entries.sort((p, q) => p.num - q.num || (p.dir === 'a' ? -1 : 1) - (q.dir === 'a' ? -1 : 1));
}

export function generate(words, { w = GRID_W, h = GRID_H, seed, tries = 12 } = {}) {
  const seen = new Set();
  const pool = words.filter(x => eligible(x, Math.max(w, h)) && !seen.has(x.w) && seen.add(x.w));
  const rng = makeRng(seed);
  let best = null;
  if (pool.length) for (let t = 0; t < tries; t++) {
    const r = attempt(pool, w, h, rng);
    if (!best || r.placed.length > best.placed.length || (r.placed.length === best.placed.length && r.crossings > best.crossings)) best = r;
  }
  return best ? finish(best.placed, w, h, seed) : { w, h, seed, entries: [], cells: {} };
}

// Returns a list of violation strings; [] when the puzzle is valid.
export function validate(p) {
  const bad = [], { entries, cells, w, h } = p;
  const own = new Map(); // "x,y,dir" -> entry
  const ids = new Set();
  for (const e of entries) {
    if (ids.has(e.id)) bad.push(`duplicate word id ${e.id}`);
    ids.add(e.id);
    const [dx, dy] = DIRS[e.dir];
    const ex = e.x + dx * (e.word.length - 1), ey = e.y + dy * (e.word.length - 1);
    if (e.x < 0 || e.y < 0 || ex >= w || ey >= h) bad.push(`${e.word} out of bounds`);
    for (let i = 0; i < e.word.length; i++) {
      const k = (e.x + dx * i) + ',' + (e.y + dy * i);
      if (cells[k] !== e.word[i]) bad.push(`${e.word}: cell ${k} is "${cells[k] ?? ''}", expected "${e.word[i]}"`);
      if (own.has(k + e.dir)) bad.push(`cell ${k} used by two ${e.dir} entries`);
      own.set(k + e.dir, e);
    }
  }
  for (const k of Object.keys(cells)) if (!own.has(k + 'a') && !own.has(k + 'd')) bad.push(`cell ${k} belongs to no entry`);
  // Every maximal run of 2+ filled cells must be exactly one entry (covers parallel touching and start/end gaps).
  for (const dir of ['a', 'd']) {
    const [dx, dy] = DIRS[dir];
    for (const k of Object.keys(cells)) {
      const [x, y] = k.split(',').map(Number);
      if ((x - dx) + ',' + (y - dy) in cells) continue;
      let n = 1;
      while ((x + dx * n) + ',' + (y + dy * n) in cells) n++;
      const e = own.get(k + dir);
      if (n > 1 && !(e && e.x === x && e.y === y && e.word.length === n)) bad.push(`unclued ${dir === 'a' ? 'horizontal' : 'vertical'} run at ${k}`);
    }
  }
  // Connectivity: entries sharing a cell are linked.
  if (entries.length) {
    const seenE = new Set([entries[0]]), queue = [entries[0]];
    while (queue.length) {
      const e = queue.pop(), [dx, dy] = DIRS[e.dir], o = e.dir === 'a' ? 'd' : 'a';
      for (let i = 0; i < e.word.length; i++) {
        const f = own.get((e.x + dx * i) + ',' + (e.y + dy * i) + o);
        if (f && !seenE.has(f)) { seenE.add(f); queue.push(f); }
      }
    }
    if (seenE.size !== new Set(entries).size) bad.push('entries are not connected');
  }
  const want = number(entries.map(e => ({ ...e })));
  for (const e of want) {
    const got = entries.find(g => g.id === e.id && g.dir === e.dir);
    if (got && got.num !== e.num) bad.push(`${e.word}: number ${got.num}, expected ${e.num}`);
  }
  return bad;
}

// Pack queue: next `window` unused words -> puzzle; placed words leave, the rest roll over to the next puzzle.
// maxSkips is only a safety valve against a word that can never be placed: dropping after 3 skips capped
// coverage at 69 % of a group (measured), 12 gives ~97 %.
// Content identity of a pack. Done marks are stored under it, so if the puzzle at number n ever changes
// (words appended to the group shift the last few packs; a GEN_VERSION bump shifts all) an old ✓ never
// lands on a puzzle the user has not seen.
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
export const packKey = (n, entries) => n + '-' + hashStr(entries.map(e => e.id + ':' + e.x + ',' + e.y + e.dir).join('|'));

export function buildPacks(groupWords, { groupId, w = GRID_W, h = GRID_H, window = 24, maxSkips = 12, tries = 12 } = {}) {
  const queue = groupWords.filter(x => eligible(x, Math.max(w, h))).map(x => ({ x, skips: 0 }));
  const packs = [];
  while (queue.length) {
    const batch = queue.splice(0, window);
    const n = packs.length + 1, seed = `pack:${GEN_VERSION}:${groupId}:${n}`;
    const puz = generate(batch.map(b => b.x), { w, h, seed, tries });
    const ok = puz.entries.length >= 3;
    const used = new Set(ok ? puz.entries.map(e => e.id) : []);
    const back = batch.filter(b => !used.has(b.x.id)).map(b => ({ x: b.x, skips: b.skips + 1 })).filter(b => b.skips < maxSkips);
    queue.unshift(...back);
    if (ok) packs.push({ n, key: packKey(n, puz.entries), ...puz, wordIds: puz.entries.map(e => e.id) });
  }
  return packs;
}

export const packUnlocked = (pack, isMet) => pack.wordIds.every(id => isMet(id));

const isMet = p => !!p && (p.correct + p.wrong) > 0;

// Weighted sampling without replacement: weaker (lower lvl) and longer-unseen words are likelier.
export function pickDailyWords(words, progress, { seed, now = Date.now(), count = 40 } = {}) {
  const rng = makeRng(seed);
  const pool = words.filter(x => eligible(x) && isMet(progress[x.id])).map(x => {
    const p = progress[x.id];
    return { x, wt: (11 - p.lvl) + Math.min(10, Math.max(0, Math.floor((now - p.lastSeen) / DAY))) };
  });
  const out = [];
  while (pool.length && out.length < count) {
    let r = rng() * pool.reduce((s, c) => s + c.wt, 0), i = 0;
    while (i < pool.length - 1 && (r -= pool[i].wt) >= 0) i++;
    out.push(pool.splice(i, 1)[0].x);
  }
  return out;
}

export function dailyPuzzle(words, progress, dateStr, { now } = {}) {
  if (words.filter(x => eligible(x) && isMet(progress[x.id])).length < MIN_MET) return null;
  const seed = `daily:${GEN_VERSION}:${dateStr}`;
  return generate(pickDailyWords(words, progress, { seed, now }), { seed });
}
