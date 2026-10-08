// Spaced repetition for ONE word (one form). Ported from Tense Titans srs.js (two forms per verb).
// Progress shape: { lvl, due, peak, correct, wrong, lastSeen }. Pure and DOM-free.

export const DAY = 86400000;
export const LVL_MAX = 10;        // top level
export const PICK_CAP = 3;        // recognition (pick / reverse) can raise a word only this high
export const SCHEDULE_GATE = 3;   // at lvl >= gate a word advances only when due
// Days to wait after REACHING a level before the word is due again (index = level).
export const INTERVAL_DAYS = [0, 0, 0, 1, 2, 3, 3, 4, 5, 6, 21];
// Word ranks (heroic ladder) read from the level.
export const RANKS = [
  { id: 'recruit', min: 0, title: 'Рекрут' },
  { id: 'legionary', min: 3, title: 'Легионер' },
  { id: 'centurion', min: 5, title: 'Центурион' },
  { id: 'veteran', min: 7, title: 'Ветеран' },
  { id: 'legate', min: 10, title: 'Легат' },
];
export const RECALL_MODES = new Set(['type', 'cloze', 'trouble']);
export const LEARNED_MIN = 6;     // "выучено": ≥ 3 spaced recalls without hints
// Word status for the home counters. Recognition tops out at 3; recall climbs to 10.
export function statusOf(p) {
  if (!p || (p.correct + p.wrong) === 0) return 'new';
  if (p.lvl < SCHEDULE_GATE) return 'learning';
  if (p.lvl < LEARNED_MIN) return 'known';
  if (p.lvl < LVL_MAX) return 'learned';
  return 'legate';
}

export function newProgress(now = 0) { return { lvl: 0, due: 0, peak: 0, correct: 0, wrong: 0, lastSeen: now }; }

export function rankOf(lvl) { let r = RANKS[0]; for (const x of RANKS) if (lvl >= x.min) r = x; return r; }

// Ready to advance right now? Low levels are instant; from the gate on — scheduled.
export function isDue(p, now = Date.now()) { return p.lvl < SCHEDULE_GATE || now >= (p.due || 0); }
// Due for a scheduled review (already learned past the gate).
export function isReviewDue(p, now = Date.now()) { return p.lvl >= SCHEDULE_GATE && now >= (p.due || 0); }
// "In work": seen at least once but not yet past the gate.
export function isLearning(p) { return p.lvl < SCHEDULE_GATE && (p.correct + p.wrong) > 0; }

export const GRACE_MIN = 5;
export function graceDays(lvl) { return Math.max(GRACE_MIN, 2 * (INTERVAL_DAYS[lvl] || 0)); }

// Forgetting curve: an overdue word slips levels (peak kept → faster relearn). Never below 1 once
// genuinely learned (peak >= 2). Mutates p.
export function decay(p, now = Date.now()) {
  const floor = (p.peak || 0) >= 2 ? 1 : 0;
  let guard = 0;
  while (p.lvl > floor && p.due && now > p.due + graceDays(p.lvl) * DAY && guard++ < 30) {
    p.due += graceDays(p.lvl) * DAY;
    p.lvl -= 1;
  }
  return p;
}

// Seed a level without an answer (triage "знаю", assessment import). Returns a NEW progress.
export function seedLevel(p, lvl, now = Date.now()) {
  const q = { ...(p || newProgress(now)) };
  q.lvl = Math.max(0, Math.min(LVL_MAX, lvl));
  q.peak = Math.max(q.peak || 0, q.lvl);
  q.due = now + (INTERVAL_DAYS[q.lvl] || 0) * DAY;
  return q;
}

// Apply one answer. Pure: returns { p (new progress), hint, xp, recall }.
// mode: 'pick' | 'reverse' (recognition, capped at PICK_CAP) | 'type' | 'cloze' (recall, to LVL_MAX)
//     | 'trouble' (recall drill: a clean answer lifts the word straight back to the gate).
// hinted: the answer used letter hints — counts, but the level does not move.
export function applyAnswer(progress, { ok, mode, now = Date.now(), hinted = false }) {
  const recall = RECALL_MODES.has(mode);
  const p = { ...(progress || newProgress(now)) };
  let hint = '', xp = 0;
  p.lastSeen = now;
  if (ok && hinted) {
    p.correct++; xp = 5; p.due = now;
    hint = 'С подсказкой: засчитано, уровень не растёт';
  } else if (ok && mode === 'trouble') {
    p.correct++; xp = 15;
    if (p.lvl < SCHEDULE_GATE) { p.lvl = SCHEDULE_GATE; p.peak = Math.max(p.peak, p.lvl); hint = 'Исправлено!'; }
    p.due = now + (INTERVAL_DAYS[p.lvl] || 0) * DAY;
  } else if (ok) {
    p.correct++;
    xp = recall ? 15 : 10;
    const cap = recall ? LVL_MAX : PICK_CAP;
    if (p.lvl >= cap) {
      hint = recall ? '' : 'Дальше — только письмом';
      p.due = now + (INTERVAL_DAYS[p.lvl] || 0) * DAY;   // capped: reschedule so it leaves the queue
    } else if (p.lvl >= SCHEDULE_GATE && now < (p.due || 0)) {
      hint = 'Засчитано, вернётся по расписанию';
    } else {
      p.lvl++;
      p.peak = Math.max(p.peak, p.lvl);
      let wait = INTERVAL_DAYS[p.lvl] || 0;
      if (p.lvl < p.peak) wait = Math.ceil(wait / 2);   // relearning below the peak is faster
      p.due = now + wait * DAY;
      if (p.lvl === LEARNED_MIN) hint = 'Выучено!';
      else if (p.lvl === LVL_MAX) hint = 'Легат!';
      else if (p.lvl === SCHEDULE_GATE) hint = 'Узнаю — дальше по расписанию';
    }
  } else {
    p.wrong++;
    p.lvl = Math.max(0, p.lvl - 2);
    p.due = now;
  }
  return { p, hint, xp, recall };
}
