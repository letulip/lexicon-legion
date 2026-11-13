// Crossword play state and scoring. Pure and DOM-free: the UI calls these and re-renders.
// A play: { puzzle, fill: {"x,y": letter}, revealed: {"x,y": true}, revealedWords: {id: true}, hints, startedAt }.
// Crosswords never touch word levels or the trouble list — only XP and the day streak.
import { advanceStreak } from './streak.js';

export const XP_PER_WORD = 5, XP_NO_HINTS = 20;
const key = (x, y) => x + ',' + y;
export function entryCells(e) {
  const out = [];
  for (let i = 0; i < e.word.length; i++) out.push({ x: e.x + (e.dir === 'a' ? i : 0), y: e.y + (e.dir === 'd' ? i : 0), ch: e.word[i] });
  return out;
}
export function newPlay(puzzle, now = Date.now()) {
  return { puzzle, fill: {}, revealed: {}, revealedWords: {}, hints: 0, startedAt: now };
}
// Put a letter (a–z, case-insensitive) into a cell of the grid; revealed cells are locked. Returns true if it changed.
export function setLetter(play, x, y, ch) {
  const k = key(x, y), c = String(ch || '').toLowerCase();
  if (!(k in play.puzzle.cells) || play.revealed[k] || !/^[a-z]$/.test(c)) return false;
  play.fill[k] = c; return true;
}
export function clearLetter(play, x, y) {
  const k = key(x, y);
  if (play.revealed[k] || !(k in play.fill)) return false;
  delete play.fill[k]; return true;
}
// Hints (free of penalties, but counted): open one cell, or a whole word.
export function revealCell(play, x, y) {
  const k = key(x, y);
  if (!(k in play.puzzle.cells) || play.revealed[k]) return false;
  play.fill[k] = play.puzzle.cells[k]; play.revealed[k] = true; play.hints++; return true;
}
export function revealWord(play, entry) {
  if (play.revealedWords[entry.id]) return false;
  for (const c of entryCells(entry)) { const k = key(c.x, c.y); play.fill[k] = c.ch; play.revealed[k] = true; }
  play.revealedWords[entry.id] = true; play.hints++; return true;
}
export function noteHint(play) { play.hints++; }   // e.g. the «Показать фразу» context hint
// { wrong: ["x,y"], empty: n, solved } — «Проверить» paints `wrong`; solved = every cell filled and right.
export function checkPlay(play) {
  const wrong = []; let empty = 0;
  for (const k in play.puzzle.cells) {
    if (!(k in play.fill)) empty++; else if (play.fill[k] !== play.puzzle.cells[k]) wrong.push(k);
  }
  return { wrong, empty, solved: !wrong.length && !empty };
}
export function entryFilled(play, e) { return entryCells(e).every(c => key(c.x, c.y) in play.fill); }
// XP: per word not opened by «Открыть слово», plus a bonus for a crossword with no hints at all.
export function scorePlay(play) {
  const clean = play.puzzle.entries.filter(e => !play.revealedWords[e.id]).length;
  return { words: play.puzzle.entries.length, cleanWords: clean, hints: play.hints, xp: clean * XP_PER_WORD + (play.hints ? 0 : XP_NO_HINTS) };
}
// Record a solved crossword in the store: XP, streak, done marks.
// ref = { kind: 'daily', date? } | { kind: 'pack', groupId, n, key? }. A daily is filed under the date it was made
// for (a puzzle opened before midnight and finished after it must not eat the next day's crossword); a pack under
// its content key. XP and the streak day belong to `today`, when the solving happened.
// Idempotent: solving the same crossword twice pays once. Returns { xp, already }.
export function applySolved(store, ref, play, today) {
  const cw = store.crosswords;
  if (ref.kind === 'daily') {
    const date = ref.date || today;
    if (cw.daily && cw.daily.date === date && cw.daily.done) return { xp: 0, already: true };
    cw.daily = { date, play, done: true };
  } else {
    const g = cw.packs[ref.groupId] || (cw.packs[ref.groupId] = { done: {}, current: null }), k = ref.key || ref.n;
    if (g.done[k]) return { xp: 0, already: true };
    g.done[k] = today;
    if (g.current && (g.current.key || g.current.n) === k) g.current = null;
  }
  const { xp } = scorePlay(play), st = store.stats;
  st.xp += xp; st.xwSolved = (st.xwSolved || 0) + 1;
  if (st.lastStudyDate !== today) {
    const s = advanceStreak(st.dayStreak, st.lastStudyDate, today, st.freezes);
    st.dayStreak = s.streak; st.freezes = s.freezes; st.bestStreak = Math.max(st.bestStreak || 0, s.streak); st.lastStudyDate = today;
  }
  return { xp, already: false };
}
