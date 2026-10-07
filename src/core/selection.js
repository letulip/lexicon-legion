// What to ask next: the daily session queue. Pure; words and store are passed in.
import { isReviewDue, isDue, SCHEDULE_GATE, PICK_CAP } from './srs.js';

// Which mode fits a word's level: recognition first, then recall. Alternates type / cloze.
export function modeFor(word, p) {
  const lvl = p ? p.lvl : 0;
  if (lvl < 2) return 'pick';
  if (lvl < PICK_CAP) return 'reverse';
  const hasEx = word.ex && word.ex.length;
  return hasEx && ((p.correct + p.wrong) % 2 === 1) ? 'cloze' : 'type';
}

export function dueList(words, store, now = Date.now()) {
  return words.filter(w => { const p = store.progress[w.id]; return p && isReviewDue(p, now); })
    .sort((a, b) => (store.progress[a.id].lastSeen || 0) - (store.progress[b.id].lastSeen || 0));
}
export function dueCount(words, store, now = Date.now()) { return dueList(words, store, now).length; }

// Words in work (below the gate, seen) that are ready again — least recently seen first.
export function learningList(words, store, now = Date.now()) {
  return words.filter(w => { const p = store.progress[w.id]; return p && p.lvl < SCHEDULE_GATE && (p.correct + p.wrong) > 0 && isDue(p, now); })
    .sort((a, b) => (store.progress[a.id].lastSeen || 0) - (store.progress[b.id].lastSeen || 0));
}

// Brand-new words in group order (words array is already priority-ordered).
export function newList(words, store) { return words.filter(w => !store.progress[w.id]); }

// Build a session: due reviews → words in work → new words (within the daily budget).
// Returns an array of { word, mode }. `newLeft` = how many new words may still be introduced today.
export function buildSession(words, store, { now = Date.now(), size = 20, newLeft = 10 } = {}) {
  const out = [], used = new Set();
  const push = (w) => { if (!used.has(w.id) && out.length < size) { used.add(w.id); out.push({ word: w, mode: modeFor(w, store.progress[w.id]) }); } };
  dueList(words, store, now).forEach(push);
  learningList(words, store, now).forEach(push);
  let n = Math.max(0, newLeft);
  for (const w of newList(words, store)) { if (!n || out.length >= size) break; push(w); n--; }
  return out;
}

// Session counts for the home screen.
export function summary(words, store, now = Date.now()) {
  let learned = 0, learning = 0, fresh = 0;
  for (const w of words) {
    const p = store.progress[w.id];
    if (!p) fresh++; else if (p.lvl >= SCHEDULE_GATE) learned++; else learning++;
  }
  return { due: dueCount(words, store, now), learned, learning, fresh, total: words.length };
}
