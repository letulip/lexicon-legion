import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revealMore, mask, hintBudget, hintsLeft } from '../src/core/hints.js';
test('budget scales with length: a quarter per step, half at most', () => {
  assert.deepEqual(hintBudget('ebb'), { step: 1, cap: 1 });          // 3 letters: one hint of one letter
  assert.deepEqual(hintBudget('ledge'), { step: 1, cap: 2 });        // 5: two hints of one letter
  assert.deepEqual(hintBudget('allotment'), { step: 2, cap: 4 });    // 9: two hints of two
  assert.deepEqual(hintBudget('superfluously'), { step: 3, cap: 6 }); // 13: two hints of three
  assert.equal(hintsLeft('ebb'), 1); assert.equal(hintsLeft('allotment'), 2); assert.equal(hintsLeft('allotment', [0, 1]), 1); assert.equal(hintsLeft('allotment', [0, 1, 2, 3]), 0);
});
test('revealMore opens step letters, never repeats, never passes the cap', () => {
  const r1 = revealMore('allotment', [], () => 0); assert.equal(r1.length, 2);
  const r2 = revealMore('allotment', r1, () => 0.99); assert.equal(r2.length, 4); assert.equal(new Set(r2).size, 4);
  assert.equal(revealMore('allotment', r2).length, 4);
  assert.equal(revealMore('ebb', [], () => 0).length, 1); assert.equal(revealMore('ebb', [0]).length, 1);
  assert.equal(revealMore('ledge', revealMore('ledge', [], () => 0), () => 0).length, 2);
});
test('mask shows revealed letters and underscores, keeps hyphens', () => {
  assert.equal(mask('ledge', []), '_ _ _ _ _');
  assert.equal(mask('ledge', [1, 4]), '_ e _ _ e');
  assert.equal(mask('re-do', [0]), 'r _ - _ _');
});
