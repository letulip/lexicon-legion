import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReview, buildLearn, troubleList, troubleScore, modeFor, summary, newList } from '../src/core/selection.js';
import { DAY } from '../src/core/srs.js';
const NOW = 1_700_000_000_000;
const W = (id, ex = true) => ({ id, w: id, pos: 'n', ru: [id + '-ru'], ex: ex ? [{ t: `a [${id}] b` }] : [] });
const words = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => W(id));
const P = (o) => ({ lvl: 0, due: 0, peak: 0, correct: 0, wrong: 0, lastSeen: 0, ...o });

test('modeFor: pick → reverse → type/cloze by level', () => {
  assert.equal(modeFor(words[0], undefined), 'pick');
  assert.equal(modeFor(words[0], P({ lvl: 2, correct: 2 })), 'reverse');
  assert.equal(modeFor(words[0], P({ lvl: 3, correct: 3 })), 'cloze');
  assert.equal(modeFor(words[0], P({ lvl: 3, correct: 4 })), 'type');
  assert.equal(modeFor(W('x', false), P({ lvl: 3, correct: 3 })), 'type');
});

test('buildReview: due + in-work only, never new; shuffled by the given rnd', () => {
  const store = { progress: {
    a: P({ lvl: 4, due: NOW - 1, peak: 4, correct: 4, lastSeen: NOW - 5 * DAY }),   // due
    b: P({ lvl: 4, due: NOW + DAY, peak: 4, correct: 4 }),                          // not due
    c: P({ lvl: 1, peak: 1, correct: 1, lastSeen: NOW - DAY }),                     // in work
    d: P({}),                                                                       // seeded, never answered → new
  } };
  const ids = buildReview(words, store, { now: NOW, size: 10, rnd: () => 0 }).map(x => x.word.id).sort();
  assert.deepEqual(ids, ['a', 'c']);
  assert.equal(buildReview(words, store, { now: NOW, size: 1 }).length, 1);
});

test('buildLearn: seeded-unknown words first, then group order, capped by batch and budget', () => {
  const store = { progress: { d: P({}), a: P({ lvl: 3, correct: 3 }) } };
  assert.deepEqual(buildLearn(words, store, { count: 10, newLeft: 10 }).map(w => w.id), ['d', 'b', 'c', 'e', 'f']);
  assert.deepEqual(buildLearn(words, store, { count: 2, newLeft: 10 }).map(w => w.id), ['d', 'b']);
  assert.deepEqual(buildLearn(words, store, { count: 10, newLeft: 1 }).map(w => w.id), ['d']);
  assert.equal(newList(words, { progress: {} }).length, 6);
});

test('troubleList: missed words below the gate, worst first; fixed words drop out', () => {
  const store = { progress: {
    a: P({ lvl: 0, wrong: 3, correct: 1 }),
    b: P({ lvl: 2, wrong: 1, correct: 5 }),
    c: P({ lvl: 3, wrong: 2, correct: 6 }),   // back at the gate → fixed
    d: P({ lvl: 1, correct: 2 }),             // never missed
  } };
  assert.deepEqual(troubleList(words, store).map(w => w.id), ['a', 'b']);
  assert.equal(troubleScore(store.progress.c), 0);
});

test('summary counts statuses', () => {
  const store = { progress: {
    a: P({ lvl: 4, due: NOW - 1, correct: 4 }), b: P({ lvl: 7, due: NOW + DAY, correct: 9 }), c: P({ lvl: 1, correct: 1, wrong: 1 }), d: P({ lvl: 10, due: NOW + DAY, correct: 12 }),
  } };
  assert.deepEqual(summary(words, store, NOW), { due: 1, new: 2, learning: 1, known: 1, learned: 2, legate: 1, trouble: 1, total: 6 });
});
