// Store shape, defaults and backward-compatible migrations. Pure — no localStorage here.
// Cardinal rule: a migration never drops the user's data. Tested in test/store-migrate.test.js.
export const SCHEMA_VERSION = 2;   // bump + add a migration step when the shape changes

export function defaultStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    progress: {},   // wordId -> { lvl, due, peak, correct, wrong, lastSeen, src }
    groups: {},     // groupId -> { enabled, addedAt, triage: { pos, done } }
    custom: {},     // wordId -> { w, pos, ru:[], ex:[] }  ("мои слова")
    stats: {
      xp: 0, dayStreak: 0, bestStreak: 0, lastStudyDate: null, freezes: 1,
      totalAnswers: 0, totalCorrect: 0, history: {},          // date -> answers
      newToday: { date: null, n: 0 },
    },
    settings: { dailyNew: 10, learnBatch: 10, reviewSize: 20, voiceURI: '', accent: 'en-US', rate: 1, sound: true, dark: 'auto' },
    flags: { onboarded: false, assessImported: false },
  };
}

// Fill gaps only — never overwrite or drop existing user fields.
export function fillDefaults(target, defaults) {
  for (const k in defaults) {
    if (defaults[k] && typeof defaults[k] === 'object' && !Array.isArray(defaults[k])) {
      if (typeof target[k] !== 'object' || target[k] === null) target[k] = {};
      fillDefaults(target[k], defaults[k]);
    } else if (!(k in target)) target[k] = defaults[k];
  }
  return target;
}

export function looksLikeStore(data) {
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  return isObj(data) && isObj(data.progress) && isObj(data.stats);
}

export function migrate(s) {
  // v1 -> v2: one session size becomes reviewSize (review) + learnBatch (new words). Keep the old value.
  if ((s.schemaVersion || 1) < 2) {
    s.settings = s.settings || {};
    if (s.settings.sessionSize && !s.settings.reviewSize) s.settings.reviewSize = s.settings.sessionSize;
    // v1 assessment import seeded "known" words at level 3 with zero answers; v2 treats zero-answer
    // progress as "new", so stamp one correct answer to keep them in the review schedule.
    for (const id in s.progress || {}) { const p = s.progress[id]; if (p && p.lvl >= 3 && !(p.correct + p.wrong)) p.correct = 1; }
  }
  s = fillDefaults(s, defaultStore());
  s.schemaVersion = SCHEMA_VERSION;
  return s;
}
