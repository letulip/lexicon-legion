import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, foldSpelling } from '../src/core/matching.js';
test('exact and case/punctuation-insensitive', () => {
  assert.deepEqual(checkAnswer(' Ledge ', 'ledge'), { ok: true, typo: false });
  assert.deepEqual(checkAnswer('', 'ledge'), { ok: false, typo: false });
  assert.deepEqual(checkAnswer('hedge', 'ledge'), { ok: false, typo: false });   // short word: no tolerance
});
test('british spellings fold to american', () => {
  assert.equal(foldSpelling('colour'), 'color'); assert.equal(foldSpelling('realise'), 'realize');
  assert.equal(foldSpelling('centre'), 'center'); assert.equal(foldSpelling('travelled'), 'traveled');
  assert.ok(checkAnswer('neutralise', 'neutralize').ok); assert.ok(checkAnswer('catalogue', 'catalog').ok);
});
test('one slip in a long word counts, but is flagged', () => {
  assert.deepEqual(checkAnswer('superfluos', 'superfluous'), { ok: true, typo: true });
  assert.deepEqual(checkAnswer('superfluuos', 'superfluous'), { ok: false, typo: false });
});
