// What to ask next: review / learn / trouble queues. Pure; words and store are passed in.
import { isReviewDue, isDue, SCHEDULE_GATE, PICK_CAP, statusOf } from './srs.js';
import { shuffle } from './groups.js';

// Which mode fits a word's level: recognition first, then recall. Alternates type / cloze.
export function modeFor(word, p) {
  const lvl = p ? p.lvl : 0;
  if (lvl < 2) return 'pick';
  if (lvl < PICK_CAP) return 'reverse';
  const hasEx = word.ex && word.ex.length;
  return hasEx && ((p.correct + p.wrong) % 2 === 1) ? 'cloze' : 'type';
}

const seen = (p) => p && (p.correct + p.wrong) > 0;
const byStale = (store) => (a, b) => (store.progress[a.id].lastSeen || 0) - (store.progress[b.id].lastSeen || 0);

export function dueList(words, store, now = Date.now()) {
  return words.filter(w => { const p = store.progress[w.id]; return seen(p) && isReviewDue(p, now); }).sort(byStale(store));
}
export function dueCount(words, store, now = Date.now()) { return dueList(words, store, now).length; }

// Words in work (below the gate, answered at least once) that are ready again.
export function learningList(words, store, now = Date.now()) {
  return words.filter(w => { const p = store.progress[w.id]; return seen(p) && p.lvl < SCHEDULE_GATE && isDue(p, now); }).sort(byStale(store));
}

// Never answered: no progress, or progress with zero answers (assessment import / triage seeds).
// Group order = priority order; seeded-unknown words (progress present, lastSeen 0) go first.
export function newList(words, store) {
  const fresh = words.filter(w => !seen(store.progress[w.id]));
  const seeded = fresh.filter(w => store.progress[w.id]);
  return [...seeded, ...fresh.filter(w => !store.progress[w.id])];
}

// Review session: due reviews, then words in work. No new words. Stalest first, then shuffled.
export function buildReview(words, store, { now = Date.now(), size = 20, rnd = Math.random } = {}) {
  const out = [], used = new Set();
  const push = (w) => { if (!used.has(w.id) && out.length < size) { used.add(w.id); out.push(w); } };
  dueList(words, store, now).forEach(push);
  learningList(words, store, now).forEach(push);
  return shuffle(out, rnd).map(w => ({ word: w, mode: modeFor(w, store.progress[w.id]) }));
}

// Learn session: the next `count` new words (within the daily budget), in priority order.
export function buildLearn(words, store, { count = 10, newLeft = 10 } = {}) {
  return newList(words, store).slice(0, Math.max(0, Math.min(count, newLeft)));
}

// "Trouble": missed words that have not climbed back to the gate. Worst first.
export function troubleScore(p) {
  if (!p || !p.wrong || p.lvl >= SCHEDULE_GATE) return 0;
  const total = p.wrong + p.correct, acc = total ? p.correct / total : 1;
  return p.wrong * 2 + (1 - acc) * 10 + (SCHEDULE_GATE - p.lvl) * 2;
}
export function troubleList(words, store) {
  return words.filter(w => troubleScore(store.progress[w.id]) > 0)
    .sort((a, b) => troubleScore(store.progress[b.id]) - troubleScore(store.progress[a.id]));
}

// Legacy combined session (review + new), kept for tests / fallbacks.
export function buildSession(words, store, { now = Date.now(), size = 20, newLeft = 10, rnd = Math.random } = {}) {
  const out = buildReview(words, store, { now, size, rnd });
  for (const w of buildLearn(words, store, { count: size - out.length, newLeft })) out.push({ word: w, mode: 'pick' });
  return out;
}

// Counts for the home screen.
export function summary(words, store, now = Date.now()) {
  const c = { due: dueCount(words, store, now), new: 0, learning: 0, known: 0, learned: 0, legate: 0, trouble: 0, total: words.length };
  for (const w of words) { c[statusOf(store.progress[w.id])]++; if (troubleScore(store.progress[w.id]) > 0) c.trouble++; }
  c.learned += c.legate;   // "выучено" on the home screen includes legates
  return c;
}
