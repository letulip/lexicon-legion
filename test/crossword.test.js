import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GEN_VERSION, GRID_W, GRID_H, MAX_LEN, MIN_MET, makeRng, generate, validate, buildPacks, packUnlocked, pickDailyWords, dailyPuzzle } from '../src/core/crossword.js';

const GROUPS = {};
for (const g of ['cestus-d', 'common-d']) GROUPS[g] = JSON.parse(readFileSync(new URL(`../data/groups/${g}.json`, import.meta.url))).words;
const ok = w => /^[a-z]+$/.test(w.w) && w.w.length <= MAX_LEN;
const REAL = [...GROUPS['cestus-d'], ...GROUPS['common-d']].filter(ok);
const sample = (seed, n = 24) => { const r = makeRng(seed); return [...REAL].map(x => [r(), x]).sort((a, b) => a[0] - b[0]).slice(0, n).map(p => p[1]); };
const FIXED = 'tiger rinse eagle gleam mango lemon onion nacho hello ghost wheat plain'.split(' ').map((w, i) => ({ id: 'f' + i, w }));
const GOLDEN = [["f9", 0, 0, "d", 1], ["f0", 2, 1, "d", 2], ["f6", 0, 2, "a", 3], ["f10", 6, 2, "d", 4], ["f2", 2, 4, "a", 5], ["f3", 4, 4, "d", 6], ["f8", 8, 4, "d", 7], ["f4", 4, 8, "a", 8]];
const med = a => [...a].sort((x, y) => x - y)[a.length >> 1];

test('makeRng is deterministic, in [0,1), and generate never calls Math.random', () => {
  const a = makeRng('x'), b = makeRng('x'), c = makeRng(5);
  for (let i = 0; i < 50; i++) { const v = a(); assert.equal(v, b()); assert.ok(v >= 0 && v < 1); }
  assert.notEqual(makeRng('x')(), c());
  const orig = Math.random;
  Math.random = () => { throw new Error('Math.random used'); };
  try { assert.deepEqual(generate(FIXED, { seed: 's1' }), generate(FIXED, { seed: 's1' })); } finally { Math.random = orig; }
});

test('rules: 200 seeds give valid puzzles that fit the grid', () => {
  for (let s = 0; s < 200; s++) {
    const p = generate(sample('r' + s), { seed: 'r' + s });
    assert.deepEqual(validate(p), [], 'seed r' + s);
    for (const e of p.entries) {
      const [dx, dy] = e.dir === 'a' ? [1, 0] : [0, 1];
      assert.ok(e.x >= 0 && e.y >= 0 && e.x + dx * (e.word.length - 1) < GRID_W && e.y + dy * (e.word.length - 1) < GRID_H);
      for (let i = 0; i < e.word.length; i++) assert.equal(p.cells[(e.x + dx * i) + ',' + (e.y + dy * i)], e.word[i]);
    }
  }
});

test('golden: fixed words + seed give a pinned layout', () => {
  const p = generate(FIXED, { seed: 'golden-1' });
  assert.deepEqual(p.entries.map(e => [e.id, e.x, e.y, e.dir, e.num]), GOLDEN);
});

test('quality floor on 9x10 with 24 real words', () => {
  const n = [];
  for (let s = 0; s < 100; s++) n.push(generate(sample('q' + s), { seed: 'q' + s }).entries.length);
  assert.ok(med(n) >= 6, 'median ' + med(n));
  assert.ok(Math.min(...n) >= 4, 'min ' + Math.min(...n));
});

test('validate catches breakage', () => {
  const fresh = () => structuredClone(generate(sample('v'), { seed: 'v' }));
  assert.deepEqual(validate(fresh()), []);
  let p = fresh(); const k = Object.keys(p.cells)[0]; p.cells[k] = p.cells[k] === 'q' ? 'z' : 'q';
  assert.ok(validate(p).length);
  p = fresh(); const e = p.entries[0]; if (e.dir === 'a') e.y += 1; else e.x += 1;
  assert.ok(validate(p).length);
  p = fresh(); p.entries.push({ ...p.entries[1] });
  assert.ok(validate(p).length);
});

for (const g of Object.keys(GROUPS)) {
  test('buildPacks on ' + g, () => {
    const t = Date.now();
    const packs = buildPacks(GROUPS[g], { groupId: g });
    assert.ok(Date.now() - t < 3000, 'too slow');
    assert.deepEqual(packs, buildPacks(GROUPS[g], { groupId: g }));
    const seen = new Set();
    packs.forEach((p, i) => {
      assert.equal(p.n, i + 1);
      assert.equal(p.seed, `pack:${GEN_VERSION}:${g}:${p.n}`);
      assert.ok(p.entries.length >= 3);
      assert.deepEqual(validate(p), []);
      for (const id of p.wordIds) { assert.ok(!seen.has(id), 'word in two packs: ' + id); seen.add(id); }
    });
    const elig = GROUPS[g].filter(ok);
    const first24 = new Set(elig.slice(0, 24).map(x => x.id));
    assert.ok(packs[0].wordIds.every(id => first24.has(id)));
    // Unplaced words roll over (dropped only after 12 skips), so nearly every eligible word lands in some pack.
    assert.ok(seen.size / elig.length >= 0.9, 'coverage ' + seen.size / elig.length);
  });
}

test('packUnlocked', () => {
  const pack = { wordIds: ['a', 'b'] };
  assert.equal(packUnlocked(pack, () => true), true);
  assert.equal(packUnlocked(pack, id => id === 'a'), false);
  assert.equal(packUnlocked(pack, () => false), false);
});

const NOW = 1_700_000_000_000, DAYMS = 86400000;
const prog = (words, lvl = 0, lastSeen = NOW - 3 * DAYMS) => Object.fromEntries(words.map(w => [w.id, { lvl, lastSeen, correct: 1, wrong: 0 }]));

test('daily puzzle: needs MIN_MET met words, stable per date', () => {
  const words = REAL.slice(0, 60);
  assert.equal(MIN_MET, 15);
  assert.equal(dailyPuzzle(words, prog(words.slice(0, 14)), '2026-11-13', { now: NOW }), null);
  const pr = prog(words.slice(0, 40));
  const a = dailyPuzzle(words, pr, '2026-11-13', { now: NOW });
  assert.ok(a && a.entries.length >= 3);
  assert.deepEqual(validate(a), []);
  assert.deepEqual(a, dailyPuzzle(words, pr, '2026-11-13', { now: NOW }));
  const b = dailyPuzzle(words, pr, '2026-11-14', { now: NOW });
  assert.notDeepEqual(a.entries, b.entries);
});

test('daily picking favours low-level words', () => {
  const low = REAL.slice(0, 30), high = REAL.slice(30, 60);
  const pr = { ...prog(low, 0), ...prog(high, 10) };
  const lowIds = new Set(low.map(x => x.id));
  let lo = 0, hi = 0;
  for (let s = 0; s < 50; s++) for (const x of pickDailyWords([...low, ...high], pr, { seed: 'd' + s, now: NOW, count: 20 })) lowIds.has(x.id) ? lo++ : hi++;
  assert.ok(lo > hi * 1.5, `low ${lo} vs high ${hi}`);
});

test('pack keys: unique, deterministic, and stable for early packs when words are appended to the group', () => {
  const base = GROUPS['cestus-d'], packs = buildPacks(base, { groupId: 'cestus-d' });
  assert.equal(new Set(packs.map(p => p.key)).size, packs.length);
  assert.deepEqual(buildPacks(base, { groupId: 'cestus-d' }).map(p => p.key), packs.map(p => p.key));
  // the owner appends words to the end of a group: every pack whose window never reached the old tail keeps its key,
  // and a pack whose content did change gets a NEW key (so an old ✓ cannot land on an unseen puzzle)
  const extra = GROUPS['common-d'].slice(0, 120).map(w => ({ ...w, id: 'x-' + w.id }));
  const grown = buildPacks([...base, ...extra], { groupId: 'cestus-d' });
  const same = packs.filter((p, i) => grown[i] && grown[i].key === p.key).length;
  assert.ok(same >= packs.length - 6, `only ${same} of ${packs.length} packs kept their key`);
  for (let i = 0; i < packs.length; i++) {
    const a = packs[i], b = grown[i];
    assert.equal(a.key === b.key, JSON.stringify(a.entries) === JSON.stringify(b.entries), 'key must change exactly when the puzzle changes, pack ' + a.n);
  }
});
