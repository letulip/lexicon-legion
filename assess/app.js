/* Lexicon Legion · vocabulary reconnaissance test. Plain JS, no deps, works over file:// too. */
(() => {
  'use strict';
  const KEY = 'll.assess.v1';
  const WORDS = window.LL_WORDS;
  const META = window.LL_META;
  const BAND_ORDER = ['A','B','C','D','E','F','G'];
  const $ = (id) => document.getElementById(id);
  const byW = Object.fromEntries(WORDS.map(w => [w.w, w]));

  // ---------- state ----------
  let S = load();
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.order) return s; } catch (e) {}
    return null;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function fresh() {
    const order = WORDS.map(w => w.w);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    S = { v: 1, order, pos: 0, answers: {}, startedAt: Date.now() };
    save();
  }
  const answered = () => S ? Object.keys(S.answers).length : 0;

  // ---------- screens ----------
  function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden')); $(id).classList.remove('hidden'); window.scrollTo(0, 0); }
  function intro() {
    const n = answered();
    $('btn-resume').classList.toggle('hidden', !(S && n > 0 && n < WORDS.length));
    $('resume-n').textContent = S ? `(${n} / ${WORDS.length})` : '';
    $('btn-results').classList.toggle('hidden', !(S && n >= WORDS.length));
    $('btn-start').textContent = S && n > 0 ? 'Начать заново' : 'Начать';
    $('intro-stats').textContent = `Книга: ${META.book} · ${META.tokens.toLocaleString('ru')} слов текста · ${META.lemmas.toLocaleString('ru')} разных лемм.`;
    show('scr-intro');
  }

  // ---------- question ----------
  let cur = null, ctxShown = false, t0 = 0, locked = false;
  function question() {
    while (S.pos < S.order.length && S.answers[S.order[S.pos]]) S.pos++;
    if (S.pos >= S.order.length) { save(); return results(); }
    const w = byW[S.order[S.pos]]; cur = w; ctxShown = false; locked = false; t0 = Date.now();
    $('counter').textContent = `${answered() + 1} / ${WORDS.length}`;
    $('prog').style.width = (100 * answered() / WORDS.length) + '%';
    $('word').textContent = w.w;
    $('pos').textContent = { n: 'сущ.', v: 'глаг.', adj: 'прил.', adv: 'нареч.' }[w.pos] || w.pos;
    $('ctx').classList.add('hidden'); $('btn-ctx').classList.remove('hidden');
    $('ctx').innerHTML = w.ex.replace(/\[(.+?)\]/, '<mark>$1</mark>');
    $('feedback').classList.add('hidden'); $('btn-dk').classList.remove('hidden');
    const opts = shuffle([w.ru, ...distractors(w)]);
    const box = $('options'); box.innerHTML = '';
    opts.forEach(ru => {
      const b = document.createElement('button'); b.className = 'opt'; b.textContent = ru;
      b.onclick = () => answer(ru === w.ru ? 'ok' : 'wrong', ru);
      box.appendChild(b);
    });
  }
  function stems(ru) { return ru.toLowerCase().replace(/[^а-яё ]/g, ' ').split(/\s+/).filter(x => x.length > 3).map(x => x.slice(0, 5)); }
  function distractors(w) {
    const mine = new Set(stems(w.ru));
    const pool = WORDS.filter(o => o.w !== w.w && o.pos === w.pos && !stems(o.ru).some(s => mine.has(s)));
    // prefer neighbours in difficulty so the odd one out isn't obvious
    const bi = BAND_ORDER.indexOf(w.band);
    const near = pool.filter(o => Math.abs(BAND_ORDER.indexOf(o.band) - bi) <= 2);
    const src = near.length >= 8 ? near : pool;
    const out = [], used = new Set([w.ru]);
    while (out.length < 3 && src.length) {
      const c = src[Math.floor(Math.random() * src.length)];
      if (!used.has(c.ru)) { used.add(c.ru); out.push(c.ru); }
    }
    return out;
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function answer(res, picked) {
    if (locked) return; locked = true;
    S.answers[cur.w] = { a: res, ctx: ctxShown, t: Date.now() - t0, pick: picked || null };
    save();
    document.querySelectorAll('.opt').forEach(b => {
      b.disabled = true;
      if (b.textContent === cur.ru) b.classList.add('ok');
      else if (b.textContent === picked) b.classList.add('bad');
    });
    $('btn-dk').classList.add('hidden');
    const fb = $('fb-text');
    if (res === 'ok') { fb.innerHTML = '<span class="ok">Верно</span>'; setTimeout(() => { S.pos++; question(); }, 650); return; }
    fb.innerHTML = (res === 'dk' ? '<span class="bad">Не знаю</span>' : '<span class="bad">Мимо</span>') + ` · <b>${cur.w}</b> — ${cur.ru}`;
    $('feedback').classList.remove('hidden');
  }

  // ---------- results ----------
  function bandStats() {
    const st = {};
    BAND_ORDER.forEach(b => st[b] = { n: 0, ok: 0, wrong: 0, dk: 0, ctxOk: 0 });
    for (const w of WORDS) {
      const a = S.answers[w.w]; if (!a) continue;
      const s = st[w.band]; s.n++; s[a.a]++; if (a.a === 'ok' && a.ctx) s.ctxOk++;
    }
    for (const b of BAND_ORDER) {
      const s = st[b];
      s.known = s.n ? Math.max(0, Math.min(1, (s.ok - s.wrong / 3) / s.n)) : 0;  // guess-corrected (4 options)
      s.knownNoCtx = s.n ? Math.max(0, Math.min(1, (s.ok - s.ctxOk - s.wrong / 3) / s.n)) : 0;
    }
    return st;
  }
  function results() {
    const st = bandStats();
    const tot = BAND_ORDER.reduce((a, b) => ({ n: a.n + st[b].n, ok: a.ok + st[b].ok, wrong: a.wrong + st[b].wrong, dk: a.dk + st[b].dk, ctx: a.ctx + st[b].ctxOk }), { n: 0, ok: 0, wrong: 0, dk: 0, ctx: 0 });
    const knownAll = tot.n ? Math.max(0, (tot.ok - tot.wrong / 3) / tot.n) : 0;
    $('k-known').textContent = pct(knownAll);
    // unknown share of running text: Σ share_b × (1 − known_b); ultra-rare follows band A; names reported separately
    const sh = META.tokenShare;
    let unk = (sh.ultra || 0) * (1 - st.A.known);
    for (const b of BAND_ORDER) unk += (sh[b] || 0) * (1 - st[b].known);
    $('k-unknown-share').textContent = pct(unk) + ` <span class="muted">+ ${pct(sh.names)} имён</span>`;
    $('k-unknown-share').innerHTML = $('k-unknown-share').textContent;
    // vocabulary size: band lexicon × known rate, plus everything above Zipf 5 (~1 000) assumed known
    let vocab = 1000;
    for (const b of BAND_ORDER) vocab += META.lexiconSize[b] * st[b].known;
    $('k-vocab').textContent = '≈ ' + (Math.round(vocab / 500) * 500).toLocaleString('ru');
    $('k-ctx-note').textContent = tot.ctx ? `Контекст открыт и помог в ${tot.ctx} случаях из ${tot.ok} верных — эти слова «на подходе»: узнаёте в тексте, но не в отрыве от него.` : 'Контекст не использовался.';
    // table
    let html = '<tr><th>Полоса</th><th>Zipf</th><th>В книге</th><th>Слов</th><th>Верно</th><th>Мимо</th><th>Не знаю</th><th>Знание</th><th class="barcell"></th></tr>';
    for (const b of BAND_ORDER) {
      const s = st[b], k = s.known, cls = k < .5 ? 'low' : k < .8 ? 'mid' : '';
      html += `<tr><td>${META.bandNames[b]}</td><td>${META.bands[b].lo}–${META.bands[b].hi}</td><td>${pct(sh[b])}</td><td>${s.n}</td><td>${s.ok}</td><td>${s.wrong}</td><td>${s.dk}</td><td><b>${pct(k)}</b></td><td class="barcell"><span class="hbar ${cls}" style="width:${Math.round(k * 110)}px"></span></td></tr>`;
    }
    $('bands').innerHTML = html;
    // verdict: first band (from common to rare) where knowledge drops below 70 %
    let drop = null;
    for (const b of [...BAND_ORDER].reverse()) if (st[b].known < .7) { drop = b; break; }
    let target = BAND_ORDER.filter(b => st[b].known < .85 && st[b].known >= .3);
    const v = [];
    if (drop) v.push(`Знание проваливается на полосе «${META.bandNames[drop]}» (Zipf ${META.bands[drop].lo}–${META.bands[drop].hi}).`);
    else v.push('Ни одна полоса не упала ниже 70 % — тест для вас лёгкий, книгу читаете почти свободно.');
    if (target.length) v.push(`Ядро словаря для приложения: полосы ${target.map(b => `«${META.bandNames[b]}»`).join(', ')} — слова, которые вы частично знаете; быстрее всего переходят в актив.`);
    v.push(`Непонятных слов в тексте ≈ ${pct(unk)} (без имён и терминов вселенной). При 2 % читают свободно, при 5 % — со словарём, выше 10 % — тяжело.`);
    $('verdict').textContent = v.join(' ');
    renderUnknown(); show('scr-results');
  }
  function pct(x) { return (100 * x).toFixed(x < .1 ? 1 : 0).replace('.', ',') + ' %'; }
  function unknownList(withCtx) {
    return WORDS.filter(w => { const a = S.answers[w.w]; return a && (a.a !== 'ok' || (withCtx && a.ctx)); });
  }
  function renderUnknown() {
    const list = unknownList($('chk-ctx').checked);
    $('unk-n').textContent = `(${list.length})`;
    let html = '';
    for (const b of BAND_ORDER) {
      const ws = list.filter(w => w.band === b); if (!ws.length) continue;
      html += `<div class="unk-band">${META.bandNames[b]} · Zipf ${META.bands[b].lo}–${META.bands[b].hi}</div>`;
      for (const w of ws) {
        const a = S.answers[w.w];
        const tag = a.a === 'dk' ? 'не знаю' : a.a === 'wrong' ? 'мимо' : 'по контексту';
        html += `<div class="unk"><b>${w.w}</b><span class="ru">${w.ru}</span><span class="tag">${tag}</span></div>`;
      }
    }
    $('unknown').innerHTML = html;
  }
  function exportJSON() {
    const st = bandStats();
    return JSON.stringify({
      app: 'lexicon-legion/assess', version: 1, book: META.book, startedAt: S.startedAt, finishedAt: Date.now(),
      bands: Object.fromEntries(BAND_ORDER.map(b => [b, { ...META.bands[b], name: META.bandNames[b], share: META.tokenShare[b], ...st[b] }])),
      answers: WORDS.map(w => ({ w: w.w, pos: w.pos, ru: w.ru, band: w.band, zipf: w.zipf, ...(S.answers[w.w] || { a: null }) })),
      unknown: unknownList(true).map(w => w.w),
    }, null, 1);
  }

  // ---------- wiring ----------
  $('btn-start').onclick = () => { if (S && answered() > 0 && !confirm('Начать заново? Текущий прогресс будет удалён.')) return; fresh(); show('scr-test'); question(); };
  $('btn-resume').onclick = () => { show('scr-test'); question(); };
  $('btn-results').onclick = results;
  $('btn-exit').onclick = intro;
  $('btn-ctx').onclick = () => { ctxShown = true; $('ctx').classList.remove('hidden'); $('btn-ctx').classList.add('hidden'); };
  $('btn-dk').onclick = () => answer('dk');
  $('btn-next').onclick = () => { S.pos++; question(); };
  $('chk-ctx').onchange = renderUnknown;
  $('btn-restart').onclick = () => { if (confirm('Пройти заново? Результат будет удалён — скачайте JSON заранее.')) { fresh(); show('scr-test'); question(); } };
  $('btn-export').onclick = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `lexicon-legion-assess-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('btn-copy').onclick = async () => { try { await navigator.clipboard.writeText(exportJSON()); $('btn-copy').textContent = 'Скопировано ✓'; } catch (e) { alert('Буфер недоступен — используйте «Скачать».'); } };
  document.addEventListener('keydown', (e) => {
    if ($('scr-test').classList.contains('hidden')) return;
    if (!$('feedback').classList.contains('hidden') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); $('btn-next').click(); return; }
    if (locked) return;
    if (/^[1-4]$/.test(e.key)) { const b = document.querySelectorAll('.opt')[+e.key - 1]; if (b) b.click(); }
    else if (e.key === '0' || e.key === 'n') $('btn-dk').click();
    else if (e.key === 'c') $('btn-ctx').click();
  });
  intro();
})();
