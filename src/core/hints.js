// Letter hints for the typing modes. Pure.
// Budget scales with the word: each step opens a quarter of the letters (at least one), and the
// hints never reveal more than half of the word — a short word gets one step, a long one two.
export const HINT_SHARE = 0.25, HINT_CAP = 0.5;
const letters = (word) => [...word].filter(ch => /[a-z]/i.test(ch)).length;
export function hintBudget(word) {
  const n = letters(word);
  return { step: Math.max(1, Math.round(n * HINT_SHARE)), cap: Math.max(1, Math.floor(n * HINT_CAP)) };
}
export function hintsLeft(word, revealed = []) {
  const { step, cap } = hintBudget(word);
  return Math.max(0, Math.ceil((cap - revealed.length) / step));
}
// revealed = sorted array of letter indices shown; one step opens `step` more random positions (up to cap).
export function revealMore(word, revealed = [], rnd = Math.random) {
  const { step, cap } = hintBudget(word);
  const hidden = [];
  for (let i = 0; i < word.length; i++) if (!revealed.includes(i) && /[a-z]/i.test(word[i])) hidden.push(i);
  const out = [...revealed];
  while (hidden.length && out.length < cap && out.length - revealed.length < step) {
    const k = Math.floor(rnd() * hidden.length);
    out.push(hidden.splice(k, 1)[0]);
  }
  return out.sort((a, b) => a - b);
}
// "_ a _ _ e" — the mask shown above the input.
export function mask(word, revealed = []) {
  return [...word].map((ch, i) => revealed.includes(i) || !/[a-z]/i.test(ch) ? ch : '_').join(' ');
}
