#!/usr/bin/env python3
"""book2lemmas: EPUB or plain text -> lemmas.json (lemma, count, zipf, cap_ratio, forms, examples).

Usage: python3 tools/book2lemmas.py <book.epub|book.txt> <out.json>
Needs: pip install wordfreq simplemma beautifulsoup4 lxml   (see tools/requirements.txt)
"""
import re, sys, json, zipfile, collections, warnings
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
import simplemma
from wordfreq import zipf_frequency
warnings.filterwarnings('ignore', category=XMLParsedAsHTMLWarning)

def read_book(path):
    if path.lower().endswith('.epub'):
        z = zipfile.ZipFile(path); text = ''
        for n in sorted(z.namelist()):
            if re.search(r'\.(x?html?)$', n, re.I):
                soup = BeautifulSoup(z.read(n).decode('utf-8', 'ignore'), 'lxml')
                for t in soup(['script', 'style']): t.decompose()
                text += soup.get_text(' ') + '\n'
        return text
    return open(path, encoding='utf-8', errors='ignore').read()

TOK = re.compile(r"[A-Za-z][A-Za-z'’-]*[A-Za-z]|[A-Za-z]")

def main(src, out):
    text = re.sub(r'\s+', ' ', read_book(src))
    sents = re.split(r'(?<=[.!?])\s+(?=[A-Z"“])', text)
    stats, ntok = {}, 0
    for s in sents:
        toks = TOK.findall(s)
        for i, w in enumerate(toks):
            low = w.replace('’', "'").lower().split("'")[0]
            if len(low) < 2: continue
            ntok += 1
            lem = simplemma.lemmatize(low, lang='en')
            st = stats.setdefault(lem, {'count': 0, 'cap': 0, 'forms': collections.Counter(), 'ex': []})
            st['count'] += 1
            if w[0].isupper() and i > 0: st['cap'] += 1
            st['forms'][low] += 1
            if len(st['ex']) < 6 and 50 <= len(s) <= 170: st['ex'].append(s.strip())
    rows = []
    for lem, st in stats.items():
        rows.append({'lemma': lem, 'count': st['count'], 'zipf': zipf_frequency(lem, 'en'),
                     'cap_ratio': round(st['cap'] / st['count'], 2),
                     'forms': dict(st['forms'].most_common(4)), 'examples': st['ex']})
    rows.sort(key=lambda r: (-r['count'], r['lemma']))
    json.dump({'source': src.rsplit('/', 1)[-1], 'tokens': ntok, 'sentences': len(sents), 'rows': rows},
              open(out, 'w'), ensure_ascii=False)
    print(f'{src}: {ntok} tokens, {len(sents)} sentences, {len(rows)} lemmas -> {out}')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
