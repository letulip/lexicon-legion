// Typed-answer matching with spelling tolerance. Pure and DOM-free.
export function lettersOnly(s) { return String(s || '').toLowerCase().replace(/[^a-z]+/g, ''); }

// Fold British spellings to American so both are accepted (colour/color, realise/realize, centre/center).
export function foldSpelling(s) {
  return lettersOnly(s)
    .replace(/our(s|ed|ing|ful)?$/, 'or$1')
    .replace(/is(e|ed|es|ing|ation|ations)$/, 'iz$1')
    .replace(/ys(e|ed|es|ing)$/, 'yz$1')
    .replace(/(t|c)re$/, '$1er')
    .replace(/ll(ed|ing|er)$/, 'l$1')
    .replace(/ogue$/, 'og');
}

function editDistance(a, b) {
  if (a === b) return 0;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// { ok, typo } — exact (after folding) is ok; one slip in a long word (>= 8 letters) is ok but flagged.
export function checkAnswer(given, word) {
  const g = foldSpelling(given), w = foldSpelling(word);
  if (!g) return { ok: false, typo: false };
  if (g === w) return { ok: true, typo: false };
  if (w.length >= 8 && editDistance(g, w) === 1) return { ok: true, typo: true };
  return { ok: false, typo: false };
}
