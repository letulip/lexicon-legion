import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revealMore, mask } from '../src/core/hints.js';
test('revealMore opens two new letter positions per step, never repeats, stops at the word length', () => {
  const r1 = revealMore('ledge', [], 2, () => 0);
  assert.equal(r1.length, 2);
  const r2 = revealMore('ledge', r1, 2, () => 0.99);
  assert.equal(r2.length, 4); assert.equal(new Set(r2).size, 4);
  const r3 = revealMore('ledge', r2, 2, () => 0); assert.equal(r3.length, 5);
  assert.equal(revealMore('ledge', r3, 2).length, 5);
});
test('mask shows revealed letters and underscores, keeps hyphens', () => {
  assert.equal(mask('ledge', []), '_ _ _ _ _');
  assert.equal(mask('ledge', [1, 4]), '_ e _ _ e');
  assert.equal(mask('re-do', [0]), 'r _ - _ _');
});
