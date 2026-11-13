import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPlay, setLetter, clearLetter, revealCell, revealWord, noteHint, checkPlay, entryFilled, scorePlay, applySolved, entryCells, XP_PER_WORD, XP_NO_HINTS } from '../src/core/xw-play.js';
import { defaultStore } from '../src/core/store-migrate.js';

// c a t      1a cat, 1d cow
// o
// w
const puzzle = { w: 3, h: 3, seed: 't', entries: [{ id: 'cat', word: 'cat', x: 0, y: 0, dir: 'a', num: 1 }, { id: 'cow', word: 'cow', x: 0, y: 0, dir: 'd', num: 1 }], cells: { '0,0': 'c', '1,0': 'a', '2,0': 't', '0,1': 'o', '0,2': 'w' } };
const fillAll = (p) => { for (const k in puzzle.cells) { const [x, y] = k.split(',').map(Number); setLetter(p, x, y, puzzle.cells[k]); } };

test('letters: only grid cells, only a–z, case folded; clear works', () => {
  const p = newPlay(puzzle, 1);
  assert.equal(setLetter(p, 1, 1, 'x'), false);            // not a cell
  assert.equal(setLetter(p, 0, 0, '1'), false);
  assert.equal(setLetter(p, 0, 0, 'C'), true); assert.equal(p.fill['0,0'], 'c');
  assert.equal(clearLetter(p, 0, 0), true); assert.equal(clearLetter(p, 0, 0), false);
  assert.deepEqual(entryCells(puzzle.entries[1]).map(c => c.x + ',' + c.y), ['0,0', '0,1', '0,2']);
});

test('check: wrong letters listed, empty counted, solved only when all right', () => {
  const p = newPlay(puzzle, 1);
  assert.deepEqual(checkPlay(p), { wrong: [], empty: 5, solved: false });
  fillAll(p); setLetter(p, 2, 0, 'r');
  assert.deepEqual(checkPlay(p), { wrong: ['2,0'], empty: 0, solved: false });
  assert.ok(entryFilled(p, puzzle.entries[0]));
  setLetter(p, 2, 0, 't'); assert.equal(checkPlay(p).solved, true);
});

test('hints: revealed cells lock, are counted, and cost the bonus — nothing else', () => {
  const p = newPlay(puzzle, 1);
  assert.equal(revealCell(p, 1, 0), true); assert.equal(revealCell(p, 1, 0), false);
  assert.equal(setLetter(p, 1, 0, 'z'), false); assert.equal(clearLetter(p, 1, 0), false); assert.equal(p.fill['1,0'], 'a');
  fillAll(p);
  assert.deepEqual(scorePlay(p), { words: 2, cleanWords: 2, hints: 1, xp: 2 * XP_PER_WORD });
  assert.equal(revealWord(p, puzzle.entries[1]), true); assert.equal(revealWord(p, puzzle.entries[1]), false);
  noteHint(p);
  assert.deepEqual(scorePlay(p), { words: 2, cleanWords: 1, hints: 3, xp: XP_PER_WORD });
  const clean = newPlay(puzzle, 1); fillAll(clean);
  assert.equal(scorePlay(clean).xp, 2 * XP_PER_WORD + XP_NO_HINTS);
});

test('applySolved: XP and streak once; levels and trouble untouched', () => {
  const store = defaultStore(); store.progress.cat = { lvl: 4, due: 7, peak: 4, correct: 4, wrong: 1, lastSeen: 5 };
  const before = JSON.stringify(store.progress);
  const p = newPlay(puzzle, 1); fillAll(p);
  const r = applySolved(store, { kind: 'daily' }, p, '2026-11-13');
  assert.deepEqual(r, { xp: 30, already: false });
  assert.equal(store.stats.xp, 30); assert.equal(store.stats.dayStreak, 1); assert.equal(store.stats.lastStudyDate, '2026-11-13'); assert.equal(store.stats.xwSolved, 1);
  assert.equal(store.crosswords.daily.done, true);
  assert.deepEqual(applySolved(store, { kind: 'daily' }, p, '2026-11-13'), { xp: 0, already: true }); assert.equal(store.stats.xp, 30);
  store.crosswords.packs.g = { done: {}, current: { n: 2, play: p } };
  assert.equal(applySolved(store, { kind: 'pack', groupId: 'g', n: 2 }, p, '2026-11-14').xp, 30);
  assert.equal(store.crosswords.packs.g.done[2], '2026-11-14'); assert.equal(store.crosswords.packs.g.current, null);
  assert.equal(store.stats.dayStreak, 2);
  assert.equal(applySolved(store, { kind: 'pack', groupId: 'g', n: 2 }, p, '2026-11-14').already, true);
  assert.equal(JSON.stringify(store.progress), before);
});
