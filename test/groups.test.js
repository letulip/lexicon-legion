import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeGroups, pickDistractors, pickWordDistractors } from '../src/core/groups.js';
const g1 = { id: 'g1', words: [{ id: 'ledge', w: 'ledge', pos: 'n', ru: ['выступ, уступ'] }, { id: 'slum', w: 'slum', pos: 'n', ru: ['трущобы'] }] };
const g2 = { id: 'g2', words: [{ id: 'ledge', w: 'ledge', pos: 'n', ru: ['выступ'] }, { id: 'gully', w: 'gully', pos: 'n', ru: ['овраг'] }, { id: 'devour', w: 'devour', pos: 'v', ru: ['пожирать'] }] };
test('mergeGroups: one progress id across groups, custom words appended', () => {
  const all = mergeGroups([g1, g2], ['g1', 'g2'], { mine: { w: 'mine', pos: 'n', ru: ['моё'] } });
  assert.deepEqual(all.map(w => w.id), ['ledge', 'slum', 'gully', 'devour', 'mine']);
  assert.deepEqual(all[0].groups, ['g1', 'g2']);
  assert.equal(mergeGroups([g1, g2], ['g2']).length, 3);
});
test('distractors: same part of speech, never the answer', () => {
  const all = mergeGroups([g1, g2], ['g1', 'g2']);
  const d = pickDistractors(all[0], all, 3, () => 0.1);
  assert.ok(d.length <= 2); assert.ok(!d.includes('выступ, уступ')); assert.ok(!d.includes('пожирать'));
  const e = pickWordDistractors(all[0], all, 3, () => 0.1);
  assert.ok(!e.includes('ledge')); assert.ok(!e.includes('devour'));
});
