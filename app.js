// Lexicon Legion — app shell: store I/O, screens, session loop. Core logic lives in src/core/*.
import { SCHEMA_VERSION, defaultStore, migrate, looksLikeStore } from './src/core/store-migrate.js';
import { applyAnswer, newProgress, decay, seedLevel, rankOf, SCHEDULE_GATE } from './src/core/srs.js';
import { buildSession, summary } from './src/core/selection.js';
import { checkAnswer } from './src/core/matching.js';
import { levelFromXp, xpIntoLevel, xpForNextLevel, rankTitle } from './src/core/leveling.js';
import { advanceStreak, todayStr } from './src/core/streak.js';
import { mergeGroups, pickDistractors, pickWordDistractors, shuffle } from './src/core/groups.js';

export const APP_VERSION = '0.1.1';
const STORE_KEY = 'lexicon.store';
const $ = (s) => document.querySelector(s);
const MODE_NAMES = { pick: 'узнавание', reverse: 'обратное', type: 'письмо', cloze: 'контекст' };
const POS = { n: 'сущ.', v: 'глаг.', adj: 'прил.', adv: 'нареч.' };

// ---------- store ----------
let store = loadStore();
function loadStore() {
  let raw = null, s = null;
  try { raw = localStorage.getItem(STORE_KEY); s = raw ? JSON.parse(raw) : null; } catch (e) { s = null; }
  if (!s || !looksLikeStore(s)) return defaultStore();
  if ((s.schemaVersion || 1) < SCHEMA_VERSION) { try { localStorage.setItem(STORE_KEY + '.bak', raw); } catch (e) {} }
  return migrate(s);
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {} }

// ---------- data ----------
let catalog = { groups: [] }, groupsData = [], words = [];
async function loadData() {
  catalog = await (await fetch('data/catalog.json')).json();
  groupsData = await Promise.all(catalog.groups.map(g => fetch(g.file).then(r => r.json())));
  for (const g of catalog.groups) if (!store.groups[g.id]) store.groups[g.id] = { enabled: true, addedAt: Date.now(), triage: { pos: 0, done: false } };
  rebuildWords();
  const now = Date.now();
  for (const id in store.progress) decay(store.progress[id], now);
  save();
}
function rebuildWords() {
  const enabled = Object.keys(store.groups).filter(id => store.groups[id].enabled);
  words = mergeGroups(groupsData, enabled, store.custom);
}
function newLeft() {
  const t = todayStr();
  if (store.stats.newToday.date !== t) store.stats.newToday = { date: t, n: 0 };
  return Math.max(0, store.settings.dailyNew - store.stats.newToday.n);
}

// ---------- navigation ----------
function go(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  $('#screen-' + id).classList.remove('hidden');
  window.scrollTo(0, 0);
  if (id === 'home') renderHome();
  if (id === 'settings') renderSettings();
}

// ---------- home ----------
function renderHome() {
  const now = Date.now(), sm = summary(words, store, now);
  const xp = store.stats.xp, lvl = levelFromXp(xp);
  $('#home-streak').textContent = store.stats.dayStreak;
  $('#home-level').textContent = lvl; $('#home-rank').textContent = rankTitle(lvl);
  $('#home-learned').textContent = sm.learned;
  $('#home-xpfill').style.width = (100 * xpIntoLevel(xp) / xpForNextLevel(xp)) + '%';
  $('#home-xptext').textContent = xp + ' XP'; $('#home-xpnext').textContent = `до ${lvl + 1}: ${xpForNextLevel(xp) - xpIntoLevel(xp)}`;
  const nl = newLeft();
  $('#t-due').textContent = sm.due; $('#t-learning').textContent = sm.learning; $('#t-new').textContent = `${store.stats.newToday.n} / ${store.settings.dailyNew}`;
  const planned = Math.min(store.settings.sessionSize, sm.due + sm.learning + Math.min(nl, sm.fresh));
  $('#t-hint').textContent = words.length ? (planned ? `В бою ${planned} карточек: повторения, слова в работе, новые.` : 'На сегодня всё. Новые слова — завтра, или поднимите бюджет в настройках.') : 'Нет подключённых легионов.';
  $('#btn-fight').disabled = !planned;
  $('#groups-sub').textContent = `${words.length} слов в строю`;
  const box = $('#groups'); box.innerHTML = '';
  for (const g of catalog.groups) {
    const st = store.groups[g.id], gd = groupsData.find(x => x.id === g.id);
    const gs = summary(gd.words, store, now);
    const el = document.createElement('div'); el.className = 'group';
    el.innerHTML = `<div class="group-head"><span class="group-title">${g.title}</span><input type="checkbox" class="switch" ${st.enabled ? 'checked' : ''}></div>
      <div class="group-meta">${g.source} · ${g.level} · ${g.count} слов · в строю ${gs.learned}, в работе ${gs.learning}, не начато ${gs.fresh}</div>
      <div class="gbar"><i class="l" style="width:${100 * gs.learned / gs.total}%"></i><i class="w" style="width:${100 * gs.learning / gs.total}%"></i></div>`;
    el.querySelector('.switch').onchange = (e) => { st.enabled = e.target.checked; rebuildWords(); save(); renderHome(); };
    box.appendChild(el);
  }
  $('#version-line').textContent = `Lexicon Legion v${APP_VERSION}`;
}

// ---------- session ----------
let queue = [], qi = 0, cur = null, locked = false, hintUsed = false, result = null, t0 = 0;
function startSession() {
  queue = buildSession(words, store, { now: Date.now(), size: store.settings.sessionSize, newLeft: newLeft() });
  if (!queue.length) return;
  qi = 0; result = { correct: 0, total: 0, xp: 0, fresh: 0, missed: [] };
  go('session'); question();
}
function question() {
  if (qi >= queue.length) return endSession();
  cur = queue[qi]; locked = false; hintUsed = false; t0 = Date.now();
  const { word, mode } = cur;
  $('#s-counter').textContent = `${qi + 1} / ${queue.length}`;
  $('#s-prog').style.width = (100 * qi / queue.length) + '%';
  $('#q-mode').textContent = MODE_NAMES[mode];
  $('#q-feedback').classList.add('hidden'); $('#btn-dk').classList.remove('hidden');
  const opts = $('#q-options'), form = $('#q-form'), inp = $('#q-input');
  opts.innerHTML = ''; form.classList.add('hidden'); opts.classList.add('hidden');
  inp.value = ''; inp.className = ''; inp.placeholder = 'введите слово';
  const ruList = `<ul class="q-ru">${word.ru.map(r => `<li>${r}</li>`).join('')}</ul>`;
  if (mode === 'pick') {
    $('#q-prompt').innerHTML = `<span class="q-word">${word.w}</span><span class="q-pos">${POS[word.pos] || ''}</span>`;
    renderOptions(shuffle([word.ru[0], ...pickDistractors(word, words)]), (v) => v === word.ru[0]);
  } else if (mode === 'reverse') {
    $('#q-prompt').innerHTML = `<div class="q-pos">${POS[word.pos] || ''}</div>${ruList}`;
    renderOptions(shuffle([word.w, ...pickWordDistractors(word, words)]), (v) => v === word.w);
  } else {
    let html = `<div class="q-pos">${POS[word.pos] || ''}</div>${ruList}`;
    if (mode === 'cloze') html += `<div class="q-cloze">${clozeText(word)}</div>`;
    $('#q-prompt').innerHTML = html;
    form.classList.remove('hidden'); setTimeout(() => inp.focus(), 50);
  }
}
function clozeText(word) {
  const ex = word.ex[0].t;
  return ex.replace(/\[(.+?)\]/, (m, f) => `<b>${'_'.repeat(Math.max(4, f.length))}</b>`);
}
function renderOptions(list, isRight) {
  const box = $('#q-options'); box.classList.remove('hidden');
  list.forEach(v => { const b = document.createElement('button'); b.className = 'opt'; b.textContent = v; b.onclick = () => answer(isRight(v), v); box.appendChild(b); });
}
function answer(ok, given) {
  if (locked) return; locked = true;
  const { word, mode } = cur, now = Date.now();
  const had = !!store.progress[word.id];
  const prev = store.progress[word.id] || newProgress(now);
  if (!had) { store.progress[word.id] = prev; store.stats.newToday.n++; result.fresh++; }
  const r = applyAnswer(prev, { ok, mode, now });
  r.p.src = prev.src || word.groups[0];
  store.progress[word.id] = r.p;
  // stats, streak, xp
  store.stats.totalAnswers++; if (ok) store.stats.totalCorrect++;
  store.stats.xp += r.xp; result.xp += r.xp; result.total++; if (ok) result.correct++; else result.missed.push(word);
  const t = todayStr();
  store.stats.history[t] = (store.stats.history[t] || 0) + 1;
  if (store.stats.lastStudyDate !== t) {
    const s = advanceStreak(store.stats.dayStreak, store.stats.lastStudyDate, t, store.stats.freezes);
    store.stats.dayStreak = s.streak; store.stats.freezes = s.freezes; store.stats.bestStreak = Math.max(store.stats.bestStreak, s.streak);
    store.stats.lastStudyDate = t;
  }
  save();
  // feedback
  document.querySelectorAll('.opt').forEach(b => {
    b.disabled = true;
    const right = mode === 'pick' ? b.textContent === word.ru[0] : b.textContent === word.w;
    if (right) b.classList.add('ok'); else if (b.textContent === given) b.classList.add('bad');
  });
  const inp = $('#q-input'); if (!$('#q-form').classList.contains('hidden')) { inp.className = ok ? 'ok' : 'bad'; inp.blur(); }
  $('#btn-dk').classList.add('hidden');
  $('#fb-verdict').innerHTML = ok ? `<span class="ok">Верно${given === '__typo__' ? ' (с опечаткой)' : ''}</span>` : given == null ? '<span class="bad">Не знаю</span>' : '<span class="bad">Мимо</span>';
  $('#fb-srs').textContent = r.hint || `${rankOf(r.p.lvl).title} · ур. ${r.p.lvl}`;
  $('#fb-word').textContent = word.w; $('#fb-pos').textContent = POS[word.pos] || '';
  $('#fb-ru').innerHTML = `<ul>${word.ru.map(x => `<li>${x}</li>`).join('')}</ul>`;
  const ex = word.ex && word.ex[0] ? word.ex[0].t.replace(/\[(.+?)\]/, '<mark>$1</mark>') : '';
  $('#fb-ex').innerHTML = ex; $('#fb-ex').classList.toggle('hidden', !ex);
  $('#q-feedback').classList.remove('hidden');
  speak(word.w);
  setTimeout(() => $('#btn-next').focus(), 30);   // no auto-advance: the card stays until «Дальше» / Enter
}
function next() { qi++; question(); }
function endSession() {
  $('#r-correct').textContent = `${result.correct} / ${result.total}`; $('#r-xp').textContent = '+' + result.xp; $('#r-new').textContent = result.fresh;
  const sm = summary(words, store);
  $('#r-note').textContent = sm.due ? `Ещё ${sm.due} к повторению сегодня.` : 'Повторения на сегодня закрыты.';
  $('#r-missed').innerHTML = result.missed.length ? '<p class="muted small">Промахи:</p>' + result.missed.map(w => `<div><b>${w.w}</b><span>${w.ru[0]}</span></div>`).join('') : '';
  $('#btn-again').disabled = !buildSession(words, store, { size: store.settings.sessionSize, newLeft: newLeft() }).length;
  go('results');
}

// ---------- speech ----------
let voices = [];
function loadVoices() { voices = window.speechSynthesis ? speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)) : []; }
function speak(text) {
  if (!store.settings.sound || !window.speechSynthesis) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find(x => x.voiceURI === store.settings.voiceURI) || voices.find(x => x.lang.replace('_', '-') === store.settings.accent) || voices[0];
    if (v) u.voice = v; u.lang = store.settings.accent; u.rate = store.settings.rate || 1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) {}
}

// ---------- settings ----------
function renderSettings() {
  const s = store.settings;
  $('#set-dailyNew').value = s.dailyNew; $('#set-sessionSize').value = s.sessionSize; $('#set-accent').value = s.accent;
  $('#set-rate').value = s.rate; $('#set-sound').checked = s.sound; $('#set-dark').value = s.dark;
  loadVoices();
  const sel = $('#set-voice'); sel.innerHTML = '<option value="">системный</option>' + voices.map(v => `<option value="${v.voiceURI}">${v.name} (${v.lang})</option>`).join('');
  sel.value = s.voiceURI || '';
  $('#settings-version').textContent = `Lexicon Legion v${APP_VERSION} · схема стора ${store.schemaVersion}`;
}
function applyTheme() { const d = store.settings.dark; document.documentElement.dataset.theme = d === 'auto' ? '' : d; }
function bindSettings() {
  const on = (id, fn) => $(id).addEventListener('change', (e) => { fn(e.target); save(); });
  on('#set-dailyNew', t => store.settings.dailyNew = +t.value);
  on('#set-sessionSize', t => store.settings.sessionSize = +t.value);
  on('#set-accent', t => store.settings.accent = t.value);
  on('#set-voice', t => store.settings.voiceURI = t.value);
  on('#set-rate', t => store.settings.rate = +t.value);
  on('#set-sound', t => store.settings.sound = t.checked);
  on('#set-dark', t => { store.settings.dark = t.value; applyTheme(); });
  $('#btn-export').onclick = () => download(`lexicon-legion-progress-${todayStr()}.json`, JSON.stringify(store, null, 1));
  $('#file-import').onchange = (e) => readFile(e.target.files[0], (data) => {
    if (!looksLikeStore(data)) return alert('Это не файл прогресса Lexicon Legion.');
    if (!confirm('Заменить текущий прогресс содержимым файла?')) return;
    try { localStorage.setItem(STORE_KEY + '.bak', JSON.stringify(store)); } catch (x) {}
    store = migrate(data); save(); rebuildWords(); alert('Импортировано.'); go('home');
  });
  $('#file-assess').onchange = (e) => readFile(e.target.files[0], importAssess);
  $('#btn-reset').onclick = () => { if (confirm('Удалить весь прогресс? Сначала сделайте экспорт.')) { try { localStorage.setItem(STORE_KEY + '.bak', JSON.stringify(store)); } catch (x) {} store = defaultStore(); save(); loadData().then(() => go('home')); } };
}
function importAssess(data) {
  if (!data || data.app !== 'lexicon-legion/assess' || !Array.isArray(data.answers)) return alert('Это не JSON разведки.');
  const now = Date.now(); let seeded = 0, unknown = 0;
  const known = new Set(words.map(w => w.id));
  for (const a of data.answers) {
    if (!a.a || !known.has(a.w)) continue;
    const p = store.progress[a.w];
    if (a.a === 'ok' && !a.ctx) { if (!p) { store.progress[a.w] = seedLevel(null, SCHEDULE_GATE, now); seeded++; } }
    else if (!p) { store.progress[a.w] = { ...newProgress(now), wrong: 0, lastSeen: now - 1 }; store.progress[a.w].lastSeen = 0; unknown++; }
  }
  // unknown words sit at level 0 with lastSeen 0 → "in work", served before any new word
  store.flags.assessImported = true; save();
  alert(`Разведка учтена: ${unknown} незнакомых слов встали в очередь первыми, ${seeded} известных — в расписание повторений. Остальные слова теста в подключённые легионы пока не входят.`);
  go('home');
}
function readFile(file, cb) { if (!file) return; const r = new FileReader(); r.onload = () => { try { cb(JSON.parse(r.result)); } catch (e) { alert('Не удалось прочитать JSON.'); } }; r.readAsText(file); }
function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

// ---------- wiring ----------
function wire() {
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  $('#btn-fight').onclick = startSession; $('#btn-again').onclick = startSession;
  $('#btn-exit').onclick = () => go('home');
  $('#btn-next').onclick = next;
  $('#btn-dk').onclick = () => answer(false, null);
  $('#btn-speak').onclick = () => cur && speak(cur.word.w);
  $('#q-form').onsubmit = (e) => { e.preventDefault(); if (locked) return; const v = $('#q-input').value; if (!v.trim()) return; const c = checkAnswer(v, cur.word.w); answer(c.ok, c.ok ? (c.typo ? '__typo__' : cur.word.w) : v); };
  $('#btn-hint').onclick = () => { const inp = $('#q-input'); if (!hintUsed) { hintUsed = true; inp.placeholder = cur.word.w[0] + '…'; inp.value = inp.value || cur.word.w[0]; inp.focus(); } else { inp.value = cur.word.w.slice(0, Math.min(cur.word.w.length - 1, inp.value.length + 1)); inp.focus(); } };
  document.addEventListener('keydown', (e) => {
    if ($('#screen-session').classList.contains('hidden')) return;
    if (!$('#q-feedback').classList.contains('hidden')) { if (e.key === 'Enter') { e.preventDefault(); next(); } return; }
    if (document.activeElement === $('#q-input')) return;
    if (/^[1-4]$/.test(e.key)) { const b = document.querySelectorAll('.opt')[+e.key - 1]; if (b) b.click(); }
    else if (e.key === '0') $('#btn-dk').click();
  });
  bindSettings();
  if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

applyTheme();
wire();
loadData().then(() => go('home')).catch((e) => { $('#t-hint').textContent = 'Не удалось загрузить словарь: ' + e.message; go('home'); });
