import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, SCHEDULE_GATE, PICK_CAP, LVL_MAX, LEARNED_MIN, newProgress, isDue, isReviewDue, graceDays, decay, seedLevel, applyAnswer, rankOf, statusOf } from '../src/core/srs.js';
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

test('a hinted correct answer counts but never moves the level', () => {
  const p = { lvl: 4, due: NOW - 1, peak: 4, correct: 4, wrong: 0, lastSeen: 0 };
  const r = applyAnswer(p, { ok: true, mode: 'type', now: NOW, hinted: true });
  assert.equal(r.p.lvl, 4); assert.equal(r.p.correct, 5); assert.equal(r.xp, 5); assert.equal(r.p.due, NOW);
});

test('trouble drill: a clean answer lifts the word straight to the gate; a miss keeps it down', () => {
  const r = applyAnswer({ lvl: 0, due: 0, peak: 2, correct: 1, wrong: 3, lastSeen: 0 }, { ok: true, mode: 'trouble', now: NOW });
  assert.equal(r.p.lvl, SCHEDULE_GATE); assert.match(r.hint, /Исправлено/);
  const m = applyAnswer({ lvl: 1, due: 0, peak: 2, correct: 1, wrong: 3, lastSeen: 0 }, { ok: false, mode: 'trouble', now: NOW });
  assert.equal(m.p.lvl, 0); assert.equal(m.p.wrong, 4);
});

test('statuses: learned needs LEARNED_MIN, reached only through spaced recalls', () => {
  assert.equal(statusOf(undefined), 'new');
  assert.equal(statusOf({ lvl: 0, correct: 0, wrong: 0 }), 'new');       // seeded, unanswered
  assert.equal(statusOf({ lvl: 2, correct: 2, wrong: 0 }), 'learning');
  assert.equal(statusOf({ lvl: 3, correct: 3, wrong: 0 }), 'known');
  assert.equal(statusOf({ lvl: LEARNED_MIN, correct: 6, wrong: 0 }), 'learned');
  assert.equal(statusOf({ lvl: 10, correct: 12, wrong: 0 }), 'legate');
  // three recalls at the scheduled dates take a word from 3 to 6; recognition cannot
  let p = { lvl: 3, due: NOW, peak: 3, correct: 3, wrong: 0, lastSeen: 0 }, t = NOW;
  for (let i = 0; i < 3; i++) { const r = applyAnswer(p, { ok: true, mode: 'type', now: t }); p = r.p; t = p.due; }
  assert.equal(p.lvl, LEARNED_MIN); assert.equal(statusOf(p), 'learned');
  const q = applyAnswer({ lvl: 3, due: NOW - 1, peak: 3, correct: 3, wrong: 0, lastSeen: 0 }, { ok: true, mode: 'pick', now: NOW });
  assert.equal(q.p.lvl, 3);
});
