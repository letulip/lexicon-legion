import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSession, modeFor, summary, dueCount } from '../src/core/selection.js';
import { DAY } from '../src/core/srs.js';
const NOW = 1_700_000_000_000;
const W = (id, ex = true) => ({ id, w: id, pos: 'n', ru: [id + '-ru'], ex: ex ? [{ t: `a [${id}] b` }] : [] });
const words = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => W(id));

test('modeFor: pick → reverse → type/cloze by level', () => {
  assert.equal(modeFor(words[0], undefined), 'pick');
  assert.equal(modeFor(words[0], { lvl: 1, correct: 1, wrong: 0 }), 'pick');
  assert.equal(modeFor(words[0], { lvl: 2, correct: 2, wrong: 0 }), 'reverse');
  assert.equal(modeFor(words[0], { lvl: 3, correct: 3, wrong: 0 }), 'cloze');
  assert.equal(modeFor(words[0], { lvl: 3, correct: 4, wrong: 0 }), 'type');
  assert.equal(modeFor(W('x', false), { lvl: 3, correct: 3, wrong: 0 }), 'type');
});

test('buildSession: due first, then in-work, then new within budget', () => {
  const store = { progress: {
    a: { lvl: 4, due: NOW - 1, peak: 4, correct: 4, wrong: 0, lastSeen: NOW - 5 * DAY },   // due
    b: { lvl: 4, due: NOW + DAY, peak: 4, correct: 4, wrong: 0, lastSeen: 0 },            // not due
    c: { lvl: 1, due: 0, peak: 1, correct: 1, wrong: 0, lastSeen: NOW - DAY },             // in work
  } };
  const s = buildSession(words, store, { now: NOW, size: 10, newLeft: 2 });
  assert.deepEqual(s.map(x => x.word.id), ['a', 'c', 'd', 'e']);
  assert.equal(s[0].mode, 'type');
  const s2 = buildSession(words, store, { now: NOW, size: 10, newLeft: 0 });
  assert.deepEqual(s2.map(x => x.word.id), ['a', 'c']);
  assert.equal(buildSession(words, store, { now: NOW, size: 1, newLeft: 5 }).length, 1);
  assert.equal(dueCount(words, store, NOW), 1);
  assert.deepEqual(summary(words, store, NOW), { due: 1, learned: 2, learning: 1, fresh: 3, total: 6 });
});
