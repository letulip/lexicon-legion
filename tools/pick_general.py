#!/usr/bin/env python3
"""pick_general: candidates of one Zipf band from the GENERAL English frequency list (wordfreq),
excluding words already covered by other sources. For "same layer, not from this book" groups.

Usage: python3 tools/pick_general.py --band 3.0 3.5 --exclude data/cestus-lemmas.csv [--exclude more.csv] > out.tsv
Output: lemma  zipf   (ordered by frequency, most common first). Filters: lowercase dictionary word
(/usr/share/dict/words), not a transparent derivation of a more frequent word, own lemma, 3+ letters.
"""
import re, sys, argparse, csv
import simplemma
from wordfreq import iter_wordlist, zipf_frequency
ap = argparse.ArgumentParser(); ap.add_argument('--band', nargs=2, type=float, required=True)
ap.add_argument('--exclude', action='append', default=[]); a = ap.parse_args()
lo, hi = a.band
excl = set()
for f in a.exclude:
    for row in csv.DictReader(open(f, encoding='utf-8')): excl.add(row.get('lemma') or row.get('w'))
dic = set(w.strip() for w in open('/usr/share/dict/words') if w.strip().islower())
allw = [w for w in iter_wordlist('en', 'large') if re.fullmatch(r'[a-z]{3,}', w)]
zs = {w: zipf_frequency(w, 'en') for w in allw}
known = set(w for w in allw if w in dic)
SUF = ['ly','ness','ment','ful','less','able','ible','ish','ise','ize','ity','ous','ive','ist','ism','er','ers','ed','ing','es','s','ion','al','ation','ional','ably','ibly','ally','ingly','edly']
PRE = ['un','re','in','im','dis','non','over','under','pre','mis','out','sub','super','semi','anti','counter','inter']
def head(w):
    if simplemma.lemmatize(w, lang='en') != w: return False
    for s in SUF:
        if w.endswith(s) and len(w) - len(s) >= 3:
            b = w[:-len(s)]
            for c in (b, b + 'e', b[:-1] if len(b) > 3 and b[-1] == b[-2] else None, b[:-1] + 'y' if b.endswith('i') else None):
                if c and c in known and zs.get(c, 0) >= zs[w]: return False
    for p in PRE:
        if w.startswith(p) and len(w) - len(p) >= 3 and w[len(p):] in known and zs[w[len(p):]] >= zs[w]: return False
    return True
out = [w for w in allw if lo <= zs[w] < hi and w in known and w not in excl and head(w)]
out.sort(key=lambda w: -zs[w])
for w in out: print(f'{w}\t{zs[w]:.2f}')
print(f'{len(out)} candidates', file=sys.stderr)
