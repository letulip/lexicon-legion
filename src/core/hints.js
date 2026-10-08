// Letter hints for the typing modes. Pure.
// revealed = sorted array of letter indices shown; each step opens `step` more random positions.
export const HINT_STEPS = 2;
export function revealMore(word, revealed = [], step = 2, rnd = Math.random) {
  const hidden = [];
  for (let i = 0; i < word.length; i++) if (!revealed.includes(i) && /[a-z]/i.test(word[i])) hidden.push(i);
  const out = [...revealed];
  while (hidden.length && out.length - revealed.length < step) {
    const k = Math.floor(rnd() * hidden.length);
    out.push(hidden.splice(k, 1)[0]);
  }
  return out.sort((a, b) => a - b);
}
// "_ a _ _ e" — the mask shown above the input.
export function mask(word, revealed = []) {
  return [...word].map((ch, i) => revealed.includes(i) || !/[a-z]/i.test(ch) ? ch : '_').join(' ');
}
