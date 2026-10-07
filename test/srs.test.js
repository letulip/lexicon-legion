import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, SCHEDULE_GATE, PICK_CAP, LVL_MAX, newProgress, isDue, isReviewDue, graceDays, decay, seedLevel, applyAnswer, rankOf } from '../src/core/srs.js';
const NOW = 1_700_000_000_000;

test('newProgress starts at zero', () => { assert.deepEqual(newProgress(NOW), { lvl: 0, due: 0, peak: 0, correct: 0, wrong: 0, lastSeen: NOW }); });

test('isDue: low levels instant, scheduled above the gate', () => {
  assert.ok(isDue({ lvl: 0, due: NOW + DAY }, NOW));
  assert.equal(isDue({ lvl: 5, due: NOW + DAY }, NOW), false);
  assert.ok(isDue({ lvl: 5, due: NOW - 1 }, NOW));
  assert.equal(isReviewDue({ lvl: 2, due: 0 }, NOW), false);
  assert.ok(isReviewDue({ lvl: SCHEDULE_GATE, due: NOW - 1 }, NOW));
});

test('pick mode climbs to PICK_CAP and stops; recall climbs further', () => {
  let p = newProgress(NOW);
  for (let i = 0; i < 6; i++) p = applyAnswer(p, { ok: true, mode: 'pick', now: NOW + i * 5 * DAY }).p;
  assert.equal(p.lvl, PICK_CAP);
  const r = applyAnswer(p, { ok: true, mode: 'pick', now: NOW + 40 * DAY });
  assert.equal(r.p.lvl, PICK_CAP); assert.match(r.hint, /письмом/);
  const t = applyAnswer(p, { ok: true, mode: 'type', now: NOW + 40 * DAY });
  assert.equal(t.p.lvl, PICK_CAP + 1); assert.equal(t.xp, 15); assert.ok(t.recall);
});

test('a correct answer before the due date does not advance past the gate', () => {
  const p = { lvl: 4, due: NOW + 2 * DAY, peak: 4, correct: 4, wrong: 0, lastSeen: 0 };
  const r = applyAnswer(p, { ok: true, mode: 'type', now: NOW });
  assert.equal(r.p.lvl, 4); assert.match(r.hint, /расписанию/);
});

test('a miss drops two levels and makes the word due now', () => {
  const r = applyAnswer({ lvl: 5, due: NOW + 9 * DAY, peak: 5, correct: 5, wrong: 0, lastSeen: 0 }, { ok: false, mode: 'type', now: NOW });
  assert.equal(r.p.lvl, 3); assert.equal(r.p.due, NOW); assert.equal(r.p.wrong, 1); assert.equal(r.xp, 0);
});

test('relearning below the peak waits half as long', () => {
  const r = applyAnswer({ lvl: 3, due: NOW - 1, peak: 6, correct: 5, wrong: 1, lastSeen: 0 }, { ok: true, mode: 'type', now: NOW });
  assert.equal(r.p.lvl, 4); assert.equal(r.p.due, NOW + 1 * DAY);   // INTERVAL_DAYS[4] = 2 → 1
});

test('decay slips overdue words but keeps a foothold once learned', () => {
  const p = { lvl: 5, due: NOW - 100 * DAY, peak: 5, correct: 5, wrong: 0 };
  decay(p, NOW);
  assert.equal(p.lvl, 1);
  const q = { lvl: 1, due: NOW - 100 * DAY, peak: 1, correct: 1, wrong: 0 };
  decay(q, NOW); assert.equal(q.lvl, 0);
});

test('seedLevel clamps and schedules', () => {
  const p = seedLevel(null, 3, NOW);
  assert.equal(p.lvl, 3); assert.equal(p.peak, 3); assert.equal(p.due, NOW + DAY);
  assert.equal(seedLevel(null, 99, NOW).lvl, LVL_MAX);
  assert.equal(graceDays(10), 42);
});

test('ranks', () => { assert.equal(rankOf(0).id, 'recruit'); assert.equal(rankOf(4).id, 'legionary'); assert.equal(rankOf(10).id, 'legate'); });
