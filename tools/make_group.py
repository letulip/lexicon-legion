#!/usr/bin/env python3
"""make_group: glossed TSVs + candidates TSV -> data/groups/<id>.json, and update data/catalog.json.

Usage:
  python3 tools/make_group.py --id cestus-d --title "Cestus Deception · продвинутые" \
      --zipf 3.0 3.5 --label продвинутые --source-kind book --source-title "The Cestus Deception" \
      --candidates data/sources/cestus/band-d.tsv data/sources/cestus/gloss/d-*.tsv

Gloss TSV columns: lemma  pos  ru   (ru = meanings separated by ';'). Candidates TSV (from pick.py):
lemma  count  zipf  example. Words keep the candidates' order (priority); only glossed words are emitted.
A gloss line whose lemma is not among the candidates is still emitted (count 0, no example), after them.
"""
import sys, json, argparse, glob, os
ap = argparse.ArgumentParser()
ap.add_argument('--id', required=True); ap.add_argument('--title', required=True)
ap.add_argument('--zipf', nargs=2, type=float, required=True); ap.add_argument('--label', required=True)
ap.add_argument('--source-kind', default='book'); ap.add_argument('--source-title', required=True)
ap.add_argument('--src-tag', default=None, help='short source tag stored on examples (default: id prefix)')
ap.add_argument('--candidates', required=True); ap.add_argument('glosses', nargs='+')
ap.add_argument('--root', default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ap.add_argument('--description', default='')
a = ap.parse_args()
tag = a.src_tag or a.id.split('-')[0]
cands, order = {}, []
for line in open(a.candidates, encoding='utf-8'):
    p = line.rstrip('\n').split('\t')
    if len(p) < 3: continue
    cands[p[0]] = {'count': int(p[1]), 'zipf': float(p[2]), 'ex': p[3] if len(p) > 3 else ''}
    order.append(p[0])
gloss = {}
for path in a.glosses:
    for f in sorted(glob.glob(path)):
        for ln, line in enumerate(open(f, encoding='utf-8'), 1):
            if not line.strip() or line.startswith('#'): continue
            p = line.rstrip('\n').split('\t')
            if len(p) != 3: sys.exit(f'{f}:{ln}: expected 3 columns, got {len(p)}')
            lemma, pos, ru = p[0].strip(), p[1].strip(), [x.strip() for x in p[2].split(';') if x.strip()]
            if pos not in ('n', 'v', 'adj', 'adv'): sys.exit(f'{f}:{ln}: bad pos {pos!r}')
            if lemma in gloss: sys.exit(f'{f}:{ln}: duplicate gloss for {lemma}')
            gloss[lemma] = {'pos': pos, 'ru': ru}
words = []
seen = set()
for lemma in order + [g for g in gloss if g not in cands]:
    if lemma not in gloss or lemma in seen: continue
    seen.add(lemma)
    c = cands.get(lemma, {'count': 0, 'zipf': 0, 'ex': ''})
    w = {'id': lemma, 'w': lemma, 'pos': gloss[lemma]['pos'], 'ru': gloss[lemma]['ru'], 'zipf': c['zipf'], 'freq': c['count']}
    if c['ex']: w['ex'] = [{'t': c['ex'], 'src': tag}]
    words.append(w)
group = {'id': a.id, 'title': a.title, 'version': 1, 'description': a.description,
         'source': {'kind': a.source_kind, 'title': a.source_title, 'lang': 'en'},
         'level': {'zipf': a.zipf, 'label': a.label}, 'words': words}
gp = os.path.join(a.root, 'data', 'groups', a.id + '.json')
json.dump(group, open(gp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
cp = os.path.join(a.root, 'data', 'catalog.json')
cat = json.load(open(cp, encoding='utf-8')) if os.path.exists(cp) else {'version': 1, 'groups': []}
entry = {'id': a.id, 'title': a.title, 'description': a.description, 'count': len(words), 'level': a.label,
         'zipf': a.zipf, 'source': a.source_title, 'file': f'data/groups/{a.id}.json', 'version': 1}
cat['groups'] = [g for g in cat['groups'] if g['id'] != a.id] + [entry]
cat['groups'].sort(key=lambda g: (-g['zipf'][0], g['id']))
json.dump(cat, open(cp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{a.id}: {len(words)} words ({len(gloss)} glossed, {len(order)} candidates) -> {gp}; catalog {len(cat["groups"])} groups')
