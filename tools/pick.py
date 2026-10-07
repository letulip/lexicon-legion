#!/usr/bin/env python3
"""pick: lemmas.json -> candidates TSV for one Zipf band, ready for glossing.

Usage: python3 tools/pick.py lemmas.json --band 3.0 3.5 [--first words.txt] [--min-count 1] > words.tsv
Columns: lemma  count  zipf  example   (pos and ru are filled by hand; see make_group.py)
Order: words listed in --first (one per line) come first, then by count desc, then rarer first.
Filters out names (cap_ratio >= 0.3), hyphenated/short tokens, and words not in wordfreq.
"""
import sys, json, re, argparse
ap = argparse.ArgumentParser()
ap.add_argument('lemmas'); ap.add_argument('--band', nargs=2, type=float, required=True)
ap.add_argument('--first', default=None); ap.add_argument('--min-count', type=int, default=1)
a = ap.parse_args()
lo, hi = a.band
first = [l.strip() for l in open(a.first)] if a.first else []
rows = json.load(open(a.lemmas))['rows']
ok = [r for r in rows if lo <= r['zipf'] < hi and r['zipf'] > 0 and r['cap_ratio'] < 0.3
      and re.fullmatch(r'[a-z]{3,}', r['lemma']) and r['count'] >= a.min_count]
rank = {w: i for i, w in enumerate(first)}
ok.sort(key=lambda r: (rank.get(r['lemma'], 10**6), -r['count'], r['zipf']))
def example(r):
    forms = sorted(r['forms'], key=len, reverse=True)
    pat = re.compile(r'\b(' + '|'.join(map(re.escape, forms)) + r')\b', re.I)
    exs = [e for e in r['examples'] if pat.search(e)] or r['examples']
    if not exs: return ''
    ex = sorted(exs, key=len)[0].replace('“', '"').replace('”', '"').replace('’', "'")
    if len(ex) > 160: ex = ex[:157].rsplit(' ', 1)[0] + '…'
    m = pat.search(ex)
    return ex[:m.start()] + '[' + m.group(0) + ']' + ex[m.end():] if m else ex
for r in ok:
    print(f"{r['lemma']}\t{r['count']}\t{r['zipf']:.2f}\t{example(r)}")
print(f'{len(ok)} candidates', file=sys.stderr)
