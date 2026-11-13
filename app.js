// Lexicon Legion — app shell: store I/O, screens, session loops. Core logic lives in src/core/*.
import { SCHEMA_VERSION, defaultStore, migrate, looksLikeStore } from './src/core/store-migrate.js';
import { applyAnswer, newProgress, decay, seedLevel, rankOf, SCHEDULE_GATE } from './src/core/srs.js';
import { buildReview, buildLearn, troubleList, summary, dueCount } from './src/core/selection.js';
import { checkAnswer } from './src/core/matching.js';
import { revealMore, mask, hintsLeft } from './src/core/hints.js';
import { levelFromXp, xpIntoLevel, xpForNextLevel, rankTitle } from './src/core/leveling.js';
import { advanceStreak, todayStr } from './src/core/streak.js';
import { GEN_VERSION, GRID_W, GRID_H, MAX_LEN, MIN_MET, buildPacks, packUnlocked, dailyPuzzle } from './src/core/crossword.js';
import { newPlay, setLetter, clearLetter, revealCell, revealWord, noteHint, checkPlay, entryFilled, entryCells, scorePlay, applySolved } from './src/core/xw-play.js';
import { mergeGroups, pickDistractors, pickWordDistractors, shuffle } from './src/core/groups.js';

export const APP_VERSION = '0.4.0';
const STORE_KEY = 'lexicon.store';
const $ = (s) => document.querySelector(s);
const MODE_NAMES = { pick: 'узнавание', reverse: 'обратное', type: 'письмо', cloze: 'контекст', trouble: 'разбор ошибки', intro: 'знакомство' };
const POS = { n: 'сущ.', v: 'глаг.', adj: 'прил.', adv: 'нареч.' };
const LEARN_STAGES = ['intro', 'pick', 'reverse', 'type'];

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
  ensureGroups(); rebuildWords();
  const now = Date.now();
  for (const id in store.progress) decay(store.progress[id], now);
  save();
}
function ensureGroups() { for (const g of catalog.groups) if (!store.groups[g.id]) store.groups[g.id] = { enabled: true, addedAt: Date.now(), triage: { pos: 0, done: false } }; }
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
  if (id !== 'xwplay') $('#xw-input').blur();   // leaving a crossword closes the system keyboard
  if (id === 'home') renderHome();
  if (id === 'settings') renderSettings();
  if (id === 'trouble') renderTrouble();
  if (id === 'xw') renderXw();
}

// ---------- home ----------
function renderHome() {
  const now = Date.now(), sm = summary(words, store, now);
  const xp = store.stats.xp, lvl = levelFromXp(xp);
  $('#home-streak').textContent = store.stats.dayStreak;
  $('#home-level').textContent = lvl; $('#home-rank').textContent = rankTitle(lvl);
  $('#home-due').textContent = sm.due;
  $('#home-xpfill').style.width = (100 * xpIntoLevel(xp) / xpForNextLevel(xp)) + '%';
  $('#home-xptext').textContent = xp + ' XP'; $('#home-xpnext').textContent = `до ${lvl + 1}: ${xpForNextLevel(xp) - xpIntoLevel(xp)}`;
  $('#t-new').textContent = sm.new; $('#t-learning').textContent = sm.learning; $('#t-known').textContent = sm.known; $('#t-learned').textContent = sm.learned;
  const reviewN = buildReview(words, store, { now, size: 999 }).length;
  const nl = newLeft(), batch = Math.min(store.settings.learnBatch, nl, sm.new);
  $('#mc-review').textContent = reviewN ? `${sm.due} по сроку + ${reviewN - sm.due} в работе · заход до ${store.settings.reviewSize}` : 'на сейчас пусто';
  $('#btn-review').disabled = !reviewN;
  $('#mc-learn').textContent = batch ? `порция ${batch} · сегодня осталось ${nl} из ${store.settings.dailyNew}` : (sm.new ? 'дневной бюджет исчерпан — завтра' : 'новых слов нет');
  $('#btn-learn').disabled = !batch;
  $('#mc-trouble').textContent = sm.trouble ? `${sm.trouble} слов с промахами` : 'промахов нет';
  $('#btn-trouble').disabled = !sm.trouble;
  $('#mc-xw').textContent = xwHomeText();
  if (!xwWarmed) { xwWarmed = true; setTimeout(warmXw, 1200); }   // after the first paint and first taps; packs come from the cache on later runs
  $('#t-hint').textContent = words.length ? '' : 'Нет подключённых легионов.';
  $('#groups-sub').textContent = `${words.length} слов в строю`;
  const box = $('#groups'); box.innerHTML = '';
  for (const g of catalog.groups) {
    const st = store.groups[g.id], gd = groupsData.find(x => x.id === g.id);
    const gs = summary(gd.words, store, now);
    const el = document.createElement('div'); el.className = 'group';
    el.innerHTML = `<div class="group-head"><span class="group-title">${g.title}</span><input type="checkbox" class="switch" ${st.enabled ? 'checked' : ''}></div>
      <div class="group-meta">${g.source} · ${g.level} · ${g.count} слов · выучено ${gs.learned}, узнаю ${gs.known}, в работе ${gs.learning}, новых ${gs.new}</div>
      <div class="gbar"><i class="l" style="width:${100 * gs.learned / gs.total}%"></i><i class="k" style="width:${100 * gs.known / gs.total}%"></i><i class="w" style="width:${100 * gs.learning / gs.total}%"></i></div>`;
    el.querySelector('.switch').onchange = (e) => { st.enabled = e.target.checked; rebuildWords(); save(); renderHome(); };
    box.appendChild(el);
  }
  $('#version-line').textContent = `Lexicon Legion v${APP_VERSION}`;
}

// ---------- trouble screen ----------
function renderTrouble() {
  const list = troubleList(words, store);
  $('#btn-trouble-start').disabled = !list.length;
  const ago = (t) => { const d = Math.floor((Date.now() - (t || 0)) / 86400000); return !t ? '' : d === 0 ? 'сегодня' : d === 1 ? 'вчера' : `${d} дн. назад`; };
  $('#trouble-list').innerHTML = list.length ? list.map(w => { const p = store.progress[w.id]; return `<div><b>${w.w}</b><span>${w.ru[0]}</span><span class="tag">промахов ${p.wrong} · ур. ${p.lvl} · ${ago(p.lastSeen)}</span></div>`; }).join('') : '<p class="muted">Список пуст.</p>';
}

// ---------- session ----------
// kind: 'review' | 'learn' | 'trouble'. queue = [{ word, mode }]; learn runs stages over its batch.
let kind = 'review', queue = [], qi = 0, cur = null, locked = false, revealed = [], result = null, batch = [], stage = 0, stageQueue = [], stageDone = 0, stageTotal = 0;

function startReview() {
  queue = buildReview(words, store, { now: Date.now(), size: store.settings.reviewSize });
  if (!queue.length) return;
  kind = 'review'; qi = 0; resetResult(); go('session'); question();
}
function startTrouble() {
  queue = troubleList(words, store).slice(0, store.settings.reviewSize).map(word => ({ word, mode: 'trouble' }));
  if (!queue.length) return;
  kind = 'trouble'; qi = 0; resetResult(); go('session'); question();
}
function startLearn() {
  batch = buildLearn(words, store, { count: store.settings.learnBatch, newLeft: newLeft() });
  if (!batch.length) return;
  kind = 'learn'; resetResult(); stage = 0; startStage(); go('session'); question();
}
function startStage() {
  const mode = LEARN_STAGES[stage];
  stageQueue = batch.map(word => ({ word, mode })); stageDone = 0; stageTotal = batch.length;
  queue = stageQueue; qi = 0;
}
function resetResult() { result = { correct: 0, total: 0, xp: 0, fresh: 0, missed: [], fixed: 0 }; }

function question() {
  if (qi >= queue.length) {
    if (kind === 'learn' && stage < LEARN_STAGES.length - 1) { stage++; startStage(); }
    else return endSession();
  }
  cur = queue[qi]; locked = false; revealed = [];
  const { word, mode } = cur;
  const total = kind === 'learn' ? stageTotal : queue.length, done = kind === 'learn' ? stageDone : qi;
  $('#s-counter').textContent = `${Math.min(done + 1, total)} / ${total}`;
  $('#s-prog').style.width = (100 * done / total) + '%';
  $('#q-mode').textContent = MODE_NAMES[mode];
  $('#q-stage').textContent = kind === 'learn' ? `этап ${stage + 1} / ${LEARN_STAGES.length}` : kind === 'trouble' ? 'ошибки' : 'повторение';
  $('#q-feedback').classList.add('hidden'); $('#btn-dk').classList.remove('hidden');
  const opts = $('#q-options'), form = $('#q-form'), inp = $('#q-input'), intro = $('#q-intro'), prompt = $('#q-prompt');
  opts.innerHTML = ''; form.classList.add('hidden'); opts.classList.add('hidden'); intro.classList.add('hidden'); prompt.classList.remove('hidden');
  inp.value = ''; inp.className = ''; $('#q-mask').textContent = ''; renderHintButton();
  const ruList = `<ul class="q-ru">${word.ru.map(r => `<li>${r}</li>`).join('')}</ul>`;
  if (mode === 'intro') {
    prompt.classList.add('hidden'); $('#btn-dk').classList.add('hidden'); intro.classList.remove('hidden');
    $('#i-word').textContent = word.w; $('#i-pos').textContent = POS[word.pos] || '';
    $('#i-ru').innerHTML = word.ru.map(r => `<li>${r}</li>`).join('');
    const ex = word.ex && word.ex[0] ? word.ex[0].t.replace(/\[(.+?)\]/, '<mark>$1</mark>') : '';
    $('#i-ex').innerHTML = ex; $('#i-ex').classList.toggle('hidden', !ex);
    speak(word.w); setTimeout(() => $('#btn-i-next').focus(), 30);
  } else if (mode === 'pick') {
    prompt.innerHTML = `<span class="q-word">${word.w}</span><span class="q-pos">${POS[word.pos] || ''}</span>`;
    renderOptions(shuffle([word.ru[0], ...pickDistractors(word, words)]), (v) => v === word.ru[0]);
  } else if (mode === 'reverse') {
    prompt.innerHTML = `<div class="q-pos">${POS[word.pos] || ''}</div>${ruList}`;
    renderOptions(shuffle([word.w, ...pickWordDistractors(word, words)]), (v) => v === word.w);
  } else {
    let html = `<div class="q-pos">${POS[word.pos] || ''}</div>${ruList}`;
    if (mode === 'cloze') html += `<div class="q-cloze">${clozeText(word)}</div>`;
    prompt.innerHTML = html;
    $('#q-mask').textContent = mask(word.w, revealed);
    form.classList.remove('hidden'); setTimeout(() => inp.focus(), 50);
  }
}
function clozeText(word) { return word.ex[0].t.replace(/\[(.+?)\]/, (m, f) => `<b>${'_'.repeat(Math.max(4, f.length))}</b>`); }
function renderOptions(list, isRight) {
  const box = $('#q-options'); box.classList.remove('hidden');
  list.forEach(v => { const b = document.createElement('button'); b.className = 'opt'; b.textContent = v; b.onclick = () => answer(isRight(v), v); box.appendChild(b); });
}
function hintStep() {
  if (!hintsLeft(cur.word.w, revealed)) return;
  revealed = revealMore(cur.word.w, revealed);
  $('#q-mask').textContent = mask(cur.word.w, revealed);
  $('#q-input').classList.add('hinted');
  renderHintButton();
  $('#q-input').focus();
}
function renderHintButton() {
  const left = hintsLeft(cur.word.w, revealed), b = $('#btn-hint');
  b.disabled = !left;
  b.textContent = !left ? 'Подсказок больше нет' : revealed.length ? `Подсказка (ещё ${left})` : `Подсказка (${left})`;
}
let introLock = 0;
function introNext() { const t = Date.now(); if (t - introLock < 350) return; introLock = t; stageDone++; qi++; question(); }

function answer(ok, given) {
  if (locked) return; locked = true;
  const { word, mode } = cur, now = Date.now(), hinted = revealed.length > 0;
  const prev = store.progress[word.id] || newProgress(now);
  const fresh = (prev.correct + prev.wrong) === 0;
  if (fresh) { newLeft(); store.stats.newToday.n++; result.fresh++; }   // newLeft() rolls the date first
  const r = (kind === 'learn' && !ok)
    ? { p: { ...prev, wrong: prev.wrong + 1, lastSeen: now, due: now }, hint: 'Вернётся в этом же этапе', xp: 0, recall: false }   // learning: a miss repeats, it does not demote
    : applyAnswer(prev, { ok, mode, now, hinted });
  r.p.src = prev.src || word.groups[0];
  store.progress[word.id] = r.p;
  if (mode === 'trouble' && ok && !hinted) result.fixed++;
  store.stats.totalAnswers++; if (ok) store.stats.totalCorrect++;
  store.stats.xp += r.xp; result.xp += r.xp; result.total++;
  if (ok) result.correct++; else if (!result.missed.includes(word)) result.missed.push(word);
  const t = todayStr();
  store.stats.history[t] = (store.stats.history[t] || 0) + 1;
  if (store.stats.lastStudyDate !== t) {
    const s = advanceStreak(store.stats.dayStreak, store.stats.lastStudyDate, t, store.stats.freezes);
    store.stats.dayStreak = s.streak; store.stats.freezes = s.freezes; store.stats.bestStreak = Math.max(store.stats.bestStreak, s.streak);
    store.stats.lastStudyDate = t;
  }
  // learn: a miss re-queues the word at the end of the same stage; a hit completes it for this stage
  if (kind === 'learn') { if (ok && !hinted) stageDone++; else queue.push({ word, mode }); }
  save();
  document.querySelectorAll('.opt').forEach(b => {
    b.disabled = true;
    const right = mode === 'pick' ? b.textContent === word.ru[0] : b.textContent === word.w;
    if (right) b.classList.add('ok'); else if (b.textContent === given) b.classList.add('bad');
  });
  const inp = $('#q-input'); if (!$('#q-form').classList.contains('hidden')) { inp.className = ok ? 'ok' : 'bad'; inp.blur(); $('#q-mask').textContent = word.w; }
  $('#btn-dk').classList.add('hidden');
  $('#fb-verdict').innerHTML = ok ? `<span class="ok">Верно${given === '__typo__' ? ' (с опечаткой)' : ''}${hinted ? ' · с подсказкой' : ''}</span>` : given == null ? '<span class="bad">Не знаю</span>' : '<span class="bad">Мимо</span>';
  $('#fb-srs').textContent = r.hint || `${rankOf(r.p.lvl).title} · ур. ${r.p.lvl}`;
  $('#fb-word').textContent = word.w; $('#fb-pos').textContent = POS[word.pos] || '';
  $('#fb-ru').innerHTML = `<ul>${word.ru.map(x => `<li>${x}</li>`).join('')}</ul>`;
  const ex = word.ex && word.ex[0] ? word.ex[0].t.replace(/\[(.+?)\]/, '<mark>$1</mark>') : '';
  $('#fb-ex').innerHTML = ex; $('#fb-ex').classList.toggle('hidden', !ex);
  $('#q-feedback').classList.remove('hidden');
  speak(word.w);
  setTimeout(() => $('#btn-next').focus(), 30);
}
function next() { qi++; question(); }
function endSession() {
  const sm = summary(words, store);
  $('#r-correct').textContent = `${result.correct} / ${result.total}`; $('#r-xp').textContent = '+' + result.xp;
  const reviewLeft = buildReview(words, store, { size: 999 }).length;
  $('#r-new').textContent = kind === 'learn' ? result.fresh : kind === 'trouble' ? result.fixed : reviewLeft;
  $('#r-new').nextElementSibling.textContent = kind === 'learn' ? 'новых слов' : kind === 'trouble' ? 'исправлено' : 'ещё к повторению';
  $('#r-note').textContent = kind === 'learn' ? `Порция пройдена: слова на уровне «узнаю», дальше — повторения по расписанию. Сегодня осталось новых: ${newLeft()}.`
    : kind === 'trouble' ? (sm.trouble ? `В списке ошибок осталось ${sm.trouble}.` : 'Список ошибок пуст.')
    : (reviewLeft ? `Ещё ${reviewLeft} к повторению (${sm.due} по сроку, ${reviewLeft - sm.due} в работе).` : 'Повторения на сегодня закрыты.');
  $('#r-missed').innerHTML = result.missed.length ? '<p class="muted small">Промахи:</p>' + result.missed.map(w => `<div><b>${w.w}</b><span>${w.ru[0]}</span></div>`).join('') : '';
  const more = kind === 'learn' ? buildLearn(words, store, { count: store.settings.learnBatch, newLeft: newLeft() }).length
    : kind === 'trouble' ? troubleList(words, store).length : buildReview(words, store, { size: 1 }).length;
  $('#btn-again').disabled = !more;
  go('results');
}
function again() { if (kind === 'learn') startLearn(); else if (kind === 'trouble') startTrouble(); else startReview(); }

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
  $('#set-dailyNew').value = s.dailyNew; $('#set-learnBatch').value = s.learnBatch; $('#set-reviewSize').value = s.reviewSize; $('#set-accent').value = s.accent;
  $('#set-rate').value = s.rate; $('#set-sound').checked = s.sound; $('#set-dark').value = s.dark; $('#set-xwKeyboard').value = s.xwKeyboard || 'system';
  loadVoices();
  const sel = $('#set-voice'); sel.innerHTML = '<option value="">системный</option>' + voices.map(v => `<option value="${v.voiceURI}">${v.name} (${v.lang})</option>`).join('');
  sel.value = s.voiceURI || '';
  $('#settings-version').textContent = `Lexicon Legion v${APP_VERSION} · схема стора ${store.schemaVersion}`;
}
function applyTheme() { const d = store.settings.dark; document.documentElement.dataset.theme = d === 'auto' ? '' : d; }
function bindSettings() {
  const on = (id, fn) => $(id).addEventListener('change', (e) => { fn(e.target); save(); });
  on('#set-dailyNew', t => store.settings.dailyNew = +t.value);
  on('#set-learnBatch', t => store.settings.learnBatch = +t.value);
  on('#set-reviewSize', t => store.settings.reviewSize = +t.value);
  on('#set-accent', t => store.settings.accent = t.value);
  on('#set-voice', t => store.settings.voiceURI = t.value);
  on('#set-rate', t => store.settings.rate = +t.value);
  on('#set-sound', t => store.settings.sound = t.checked);
  on('#set-xwKeyboard', t => store.settings.xwKeyboard = t.value);
  on('#set-dark', t => { store.settings.dark = t.value; applyTheme(); });
  $('#btn-export').onclick = () => download(`lexicon-legion-progress-${todayStr()}.json`, JSON.stringify(store, null, 1));
  $('#file-import').onchange = (e) => readFile(e.target.files[0], (data) => {
    if (!looksLikeStore(data)) return alert('Это не файл прогресса Lexicon Legion.');
    if (!confirm('Заменить текущий прогресс содержимым файла?')) return;
    try { localStorage.setItem(STORE_KEY + '.bak', JSON.stringify(store)); } catch (x) {}
    store = migrate(data); ensureGroups(); save(); rebuildWords(); alert('Импортировано.'); go('home');
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
    if (p && (p.correct + p.wrong) > 0) continue;
    if (a.a === 'ok' && !a.ctx) { store.progress[a.w] = seedLevel(null, SCHEDULE_GATE, now); store.progress[a.w].correct = 1; seeded++; }
    else { store.progress[a.w] = newProgress(0); unknown++; }   // unanswered at level 0 → served first among new words
  }
  store.flags.assessImported = true; save();
  alert(`Разведка учтена: ${unknown} незнакомых слов встали первыми в «Новые слова», ${seeded} известных — в расписание повторений. Остальные слова теста в подключённые легионы пока не входят.`);
  go('home');
}
function readFile(file, cb) { if (!file) return; const r = new FileReader(); r.onload = () => { try { cb(JSON.parse(r.result)); } catch (e) { alert('Не удалось прочитать JSON.'); } }; r.readAsText(file); }
function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

// ---------- crosswords ----------
const xwPacks = {}, xwWordMap = {}; let xwDaily = null, xwWarmed = false, xs = null;
const isMet = (id) => { const p = store.progress[id]; return !!p && (p.correct + p.wrong) > 0; };
const xwKey = (x, y) => x + ',' + y;
const xwGroups = () => catalog.groups.filter(g => store.groups[g.id] && store.groups[g.id].enabled);
const xwWord = (id) => { if (!xwWordMap[id]) for (const g of groupsData) for (const w of g.words) xwWordMap[w.id] = w; return xwWordMap[id] || words.find(w => w.id === id); };
// met words a crossword can actually use — the same filter the generator applies
const xwMetCount = () => words.filter(w => isMet(w.id) && /^[a-z]+$/.test(w.w) && w.w.length <= MAX_LEN).length;
// Packs are deterministic, so they are built once per group version and kept in localStorage (own key, not the
// progress store): building takes ~0.2 s per 400 words on a laptop and several times that on a phone.
function getPacks(gid) {
  if (xwPacks[gid]) return xwPacks[gid];
  const gd = groupsData.find(g => g.id === gid); if (!gd) return xwPacks[gid] = [];
  const n = gd.words.length, sig = `${GEN_VERSION}:${gd.version || 1}:${n}:${n ? gd.words[n - 1].id : ''}`, ck = 'lexicon.xwpacks.' + gid;
  try { const c = JSON.parse(localStorage.getItem(ck)); if (c && c.sig === sig && Array.isArray(c.packs)) return xwPacks[gid] = c.packs; } catch (e) {}
  xwPacks[gid] = buildPacks(gd.words, { groupId: gid });
  try { localStorage.setItem(ck, JSON.stringify({ sig, packs: xwPacks[gid] })); } catch (e) {}
  return xwPacks[gid];
}
function xwDailyPuzzle() { const k = todayStr() + ':' + xwMetCount(); if (!xwDaily || xwDaily.k !== k) xwDaily = { k, p: dailyPuzzle(words, store.progress, todayStr()) }; return xwDaily.p; }
function xwTotals() {
  let open = 0, total = 0, done = 0;
  for (const g of xwGroups()) { const d = (store.crosswords.packs[g.id] || {}).done || {}; for (const p of getPacks(g.id)) { total++; if (packUnlocked(p, isMet)) open++; if (d[p.key]) done++; } }
  return { open, total, done };
}
function xwHomeText() {
  const d = store.crosswords.daily, n = xwMetCount();
  const day = d && d.date === todayStr() ? (d.done ? 'кроссворд дня решён' : 'кроссворд дня начат') : n >= MIN_MET ? 'кроссворд дня готов' : `встретьте ещё слов: ${MIN_MET - n} для кроссворда дня`;
  if (!xwGroups().every(g => xwPacks[g.id])) return day;
  const t = xwTotals(); return `${day} · открыто ${t.open} из ${t.total}`;
}
function warmXw(i = 0) {
  const gs = xwGroups(); if (i >= gs.length) return;                       // enabled groups only, one per tick
  getPacks(gs[i].id); $('#mc-xw').textContent = xwHomeText(); setTimeout(() => warmXw(i + 1), 50);
}
function renderXw() {
  const d = store.crosswords.daily, today = d && d.date === todayStr(), p = today ? null : xwDailyPuzzle(), b = $('#xw-daily');
  b.textContent = today ? (d.done ? 'Посмотреть' : 'Продолжить') : 'Начать'; b.disabled = !today && !p;
  $('#xw-daily-state').textContent = today ? (d.done ? 'Решён сегодня. Следующий будет завтра.' : 'Начат, прогресс сохранён.') : p ? 'Готов: один кроссворд в день из слов, которые вы уже встречали.' : `Нужно встретить не меньше ${MIN_MET} слов – пройдите «Новые слова» или «Повторение».`;
  $('#xw-groups').innerHTML = xwGroups().map(g => {
    const rec = store.crosswords.packs[g.id] || { done: {}, current: null }, packs = getPacks(g.id);
    const open = packs.filter(p => packUnlocked(p, isMet)).length, solved = packs.filter(p => rec.done[p.key]).length;
    return `<div class="card"><b>${g.title}</b><p class="muted small">решено ${solved} · открыто ${open} из ${packs.length}</p><div class="xw-tiles">${packs.map(p => {
      const dn = rec.done[p.key], cu = rec.current && rec.current.key === p.key, lk = !dn && !cu && !packUnlocked(p, isMet);
      return `<button class="xw-tile ${dn ? 'done' : cu ? 'current open' : lk ? 'locked' : 'open'}" data-g="${g.id}" data-n="${p.n}" ${lk ? 'disabled' : ''}>${lk ? '🔒' : dn ? p.n + '✓' : p.n}</button>`;
    }).join('')}</div></div>`;
  }).join('');
}
function openXw(ref) {
  const cw = store.crosswords, date = todayStr(); let play, done = false, title, note = '';
  if (ref.kind === 'daily') {
    title = 'Кроссворд дня'; const d = cw.daily;
    if (d && d.date === date) { play = d.play; done = d.done; note = d.date; }
    else { const p = xwDailyPuzzle(); if (!p) return; play = newPlay(p); }
    ref = { kind: 'daily', date };                       // the puzzle keeps the date it was made for, even if solved after midnight
  } else {
    const pack = getPacks(ref.groupId).find(p => p.n === ref.n), rec = cw.packs[ref.groupId] || { done: {}, current: null };
    if (!pack) return;
    ref = { ...ref, key: pack.key };
    title = `№ ${ref.n} · ${catalog.groups.find(g => g.id === ref.groupId).title}`;
    if (rec.done[pack.key]) { done = true; note = rec.done[pack.key]; play = newPlay(pack); play.fill = { ...pack.cells }; }
    else if (rec.current && rec.current.key === pack.key) play = rec.current.play;
    else {
      const c = rec.current;
      if (c && Object.keys(c.play.fill).length && !confirm(`В этом легионе уже начат кроссворд № ${c.n}. Начать другой? Заполненное сотрётся.`)) return;
      play = newPlay(pack);                                // becomes `current` on the first change (xwSave), not on opening
    }
  }
  xs = { ref, play, done, title, note, date, ei: 0, cur: 0, wrong: new Set(), status: '', res: null };
  const i = play.puzzle.entries.findIndex(e => !entryFilled(play, e));
  xwSelect(i < 0 ? 0 : i); go('xwplay'); xwPaint(); xwFocusInput();
}
const xwEntry = () => xs.play.puzzle.entries[xs.ei];
const xwCell = () => entryCells(xwEntry())[xs.cur];
function xwSelect(i, k) {
  xs.ei = i; const cs = entryCells(xs.play.puzzle.entries[i]);
  xs.cur = k != null ? k : Math.max(0, cs.findIndex(c => !(xwKey(c.x, c.y) in xs.play.fill)));
}
function xwPaint() {
  const pz = xs.play.puzzle, e = xwEntry(), cc = xwCell(), act = new Set(entryCells(e).map(c => xwKey(c.x, c.y))), starts = {}, w = xwWord(e.id);
  pz.entries.forEach(x => starts[xwKey(x.x, x.y)] = x.num);
  // only the rows the puzzle uses are drawn: every spare row is height the keyboard would rather have
  const ys = Object.keys(pz.cells).map(k => +k.split(',')[1]), y0 = Math.min(...ys), y1 = Math.max(...ys); xs.rows = y1 - y0 + 1;
  let h = '';
  for (let y = y0; y <= y1; y++) for (let x = 0; x < GRID_W; x++) {
    const k = xwKey(x, y);
    if (!(k in pz.cells)) { h += '<div class="xw-c off"></div>'; continue; }
    const cls = [act.has(k) && 'act', cc.x === x && cc.y === y && !xs.done && 'cur', xs.play.revealed[k] && 'rev', xs.wrong.has(k) && 'wrong'].filter(Boolean).join(' ');
    h += `<div class="xw-c ${cls}" data-x="${x}" data-y="${y}">${starts[k] ? `<s>${starts[k]}</s>` : ''}${xs.play.fill[k] || ''}</div>`;
  }
  $('#xw-grid').innerHTML = h; $('#xw-grid').style.gridTemplateColumns = `repeat(${GRID_W}, var(--xw-cell))`;
  $('#xw-title').textContent = xs.title;
  $('#xw-clue').innerHTML = `<b>${e.num} ${e.dir === 'a' ? '→' : '↓'}</b> ${w ? (POS[w.pos] || '') + ' · ' + w.ru.join('; ') : ''} · ${e.word.length} букв`;
  const shown = xs.play.ctxWords && xs.play.ctxWords[e.id] && w && w.ex && w.ex[0];
  $('#xw-ctx').innerHTML = shown ? clozeText(w) : ''; $('#xw-ctx').classList.toggle('hidden', !shown);
  for (const id of ['cell', 'word', 'ctx']) $('#xw-hint-' + id).disabled = xs.done || (id === 'ctx' && !(w && w.ex && w.ex[0]));
  const stText = xs.done ? (xs.note ? 'Решён ' + xs.note : 'Решён') : xs.status;
  $('#xw-status').textContent = stText; $('#xw-status').classList.toggle('hidden', !stText);
  $('#xw-check').disabled = xs.done;
  $('#xw-check').classList.toggle('pulse', !xs.done && Object.keys(xs.play.fill).length === Object.keys(pz.cells).length);
  $('#xw-kb').classList.toggle('hidden', store.settings.xwKeyboard !== 'own' || xs.done);
  $('#xw-result').classList.toggle('hidden', !xs.res);
  if (xs.res) $('#xw-res-text').innerHTML = `<b>Решено!</b> ${xs.res.already ? 'уже засчитано' : '+' + xs.sc.xp + ' XP'} · подсказок: ${xs.sc.hints} · слов не открыто: ${xs.sc.cleanWords} из ${xs.sc.words}${xs.mins < 180 ? ` · время: ${Math.max(1, xs.mins)} мин` : ''}`;
  xwFit();
}
function xwSave() {
  const cw = store.crosswords, r = xs.ref;
  if (r.kind === 'daily') cw.daily = { date: xs.date, play: xs.play, done: false };
  else (cw.packs[r.groupId] || (cw.packs[r.groupId] = { done: {}, current: null })).current = { n: r.n, key: r.key, play: xs.play };
  save();
}
function xwChanged() { xs.status = ''; xwSave(); xwPaint(); }
function xwAdvance() { xs.cur = Math.min(xs.cur + 1, xwEntry().word.length - 1); }
// System keyboard: a hidden field takes the letters. It is reset to a one-character sentinel after every
// event, so the keyboard never holds more than one letter of the answer (its suggestion strip has nothing
// to complete) and Backspace on the "empty" field still produces an input event.
const XW_SENT = '\u200b';
function xwFocusInput() {
  const i = $('#xw-input');
  if (!xs || xs.done || store.settings.xwKeyboard !== 'system') { i.blur(); return; }
  i.value = XW_SENT;
  if (document.activeElement === i) i.blur();   // already focused but the keyboard may have been dismissed with Back: focus() alone would be a no-op
  i.focus({ preventScroll: true });
}
function xwOnInput() {
  const i = $('#xw-input'), v = i.value; i.value = XW_SENT;
  if (!v.includes(XW_SENT) && !/[a-z]/i.test(v)) return xwBackspace();          // sentinel deleted: Backspace
  const letters = [...v.toLowerCase()].filter(ch => ch >= 'a' && ch <= 'z');
  if (letters.length === 1) xwType(letters[0]); else if (letters.length > 1) xwTypeMany(letters);
}
// Several letters at once = a swiped word. One as long as the entry (or longer) is laid from the first cell;
// a shorter piece goes from the cursor and stops at the end of the entry. Revealed cells stay as they are.
function xwTypeMany(letters) {
  if (!xs || xs.done) return;
  const cs = entryCells(xwEntry()), start = letters.length >= cs.length ? 0 : xs.cur;
  letters.slice(0, cs.length - start).forEach((ch, i) => { const c = cs[start + i]; setLetter(xs.play, c.x, c.y, ch); xs.wrong.delete(xwKey(c.x, c.y)); });
  xs.cur = Math.min(start + letters.length, cs.length - 1); xwChanged();
}
// Size the grid to what is visible above the keyboard (system: the visual viewport shrinks; own: it is part of the page).
function xwFit() {
  const g = $('#xw-grid'); if (!xs || $('#screen-xwplay').classList.contains('hidden')) return;
  const vv = window.visualViewport, vh = vv ? vv.height : innerHeight;
  const below = ['#xw-status', '.xw-actions', '#xw-kb', '#xw-ctx'].reduce((a, q) => { const el = $(q); return a + (el && !el.classList.contains('hidden') ? el.offsetHeight + 8 : 0); }, 10);
  const rows = xs.rows || GRID_H, byH = Math.floor((vh - g.offsetTop - below - (rows - 1) * 2) / rows), byW = Math.floor((Math.min(innerWidth, 640) - 34 - (GRID_W - 1) * 2) / GRID_W);
  g.style.setProperty('--xw-cell', Math.max(24, Math.min(44, byH, byW)) + 'px');
}
function xwType(ch) {
  if (!xs || xs.done) return;
  const c = xwCell(); setLetter(xs.play, c.x, c.y, ch); xs.wrong.delete(xwKey(c.x, c.y)); xwAdvance(); xwChanged();
}
function xwBackspace() {
  if (!xs || xs.done) return;
  let c = xwCell(), k = xwKey(c.x, c.y);
  if (!(k in xs.play.fill) || xs.play.revealed[k]) { if (xs.cur > 0) xs.cur--; c = xwCell(); k = xwKey(c.x, c.y); }
  clearLetter(xs.play, c.x, c.y); xs.wrong.delete(k); xwChanged();
}
function xwTap(x, y) {
  const es = xs.play.puzzle.entries, at = es.map((e, i) => i).filter(i => entryCells(es[i]).some(c => c.x === x && c.y === y));
  if (!at.length) return;
  const c = xwCell(), same = c.x === x && c.y === y;
  const i = same && at.length > 1 ? at.find(j => j !== xs.ei) : at.includes(xs.ei) ? xs.ei : (at.find(j => es[j].dir === xwEntry().dir) ?? at[0]);
  xwSelect(i, entryCells(es[i]).findIndex(c => c.x === x && c.y === y)); xwPaint(); xwFocusInput();
}
function xwStep(d) { const n = xs.play.puzzle.entries.length; xwSelect((xs.ei + d + n) % n); xwPaint(); xwFocusInput(); }
function xwMove(dir, d) {
  const es = xs.play.puzzle.entries;
  if (xwEntry().dir === dir) xs.cur = Math.max(0, Math.min(xwEntry().word.length - 1, xs.cur + d));
  else {
    const c = xwCell(), at = (e) => entryCells(e).findIndex(q => q.x === c.x && q.y === c.y), j = es.findIndex(e => e.dir === dir && at(e) >= 0);
    if (j < 0) return; xwSelect(j, at(es[j]));
  }
  xwPaint();
}
function xwHint(kind) {
  if (!xs || xs.done) return;
  const e = xwEntry(), c = xwCell(), p = xs.play;
  if (kind === 'cell') { if (revealCell(p, c.x, c.y)) { xs.wrong.delete(xwKey(c.x, c.y)); xwAdvance(); } }
  else if (kind === 'word') { if (revealWord(p, e)) entryCells(e).forEach(q => xs.wrong.delete(xwKey(q.x, q.y))); }
  else { p.ctxWords = p.ctxWords || {}; if (!p.ctxWords[e.id]) { p.ctxWords[e.id] = true; noteHint(p); } }
  xwChanged(); xwFocusInput();
}
function xwCheck() {
  if (!xs || xs.done) return;
  const r = checkPlay(xs.play); xs.wrong = new Set(r.wrong);
  if (r.solved) {
    xs.res = applySolved(store, xs.ref, xs.play, todayStr()); xs.sc = scorePlay(xs.play); xs.done = true; save();
    xs.mins = Math.round((Date.now() - xs.play.startedAt) / 60000);
  } else xs.status = `неверных букв: ${r.wrong.length}, пустых клеток: ${r.empty}`;
  xwPaint(); xwFocusInput();   // solved: the field is blurred and the keyboard closes; otherwise typing continues
}
function wireXw() {
  $('#btn-xw').onclick = () => go('xw'); $('#xw-back').onclick = () => go('xw');
  $('#xw-daily').onclick = () => openXw({ kind: 'daily' });
  $('#xw-groups').onclick = (e) => { const t = e.target.closest('.xw-tile'); if (t && !t.disabled) openXw({ kind: 'pack', groupId: t.dataset.g, n: +t.dataset.n }); };
  $('#xw-grid').onclick = (e) => { const c = e.target.closest('.xw-c'); if (c && c.dataset.x != null && xs && !xs.done) xwTap(+c.dataset.x, +c.dataset.y); };
  $('#xw-prev').onclick = () => xwStep(-1); $('#xw-next').onclick = () => xwStep(1);
  $('#xw-hint-cell').onclick = () => xwHint('cell'); $('#xw-hint-word').onclick = () => xwHint('word'); $('#xw-hint-ctx').onclick = () => xwHint('ctx');
  $('#xw-check').onclick = xwCheck;
  $('#xw-kb').innerHTML = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].map((r, i) => `<div>${[...r].map(c => `<button data-k="${c}">${c}</button>`).join('')}${i === 2 ? '<button class="xw-bs" data-k="bs">⌫</button>' : ''}</div>`).join('');
  $('#xw-kb').onmousedown = $('.xw-actions').onmousedown = $('.xw-clue').onmousedown = (e) => e.preventDefault();   // buttons must not steal focus from the field (keeps the system keyboard open)
  $('#xw-input').addEventListener('input', xwOnInput);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (xs && !$('#screen-xwplay').classList.contains('hidden')) { window.scrollTo(0, 0); xwFit(); } });
  window.addEventListener('resize', xwFit);
  $('#xw-kb').onclick = (e) => { const k = e.target.dataset.k; if (k === 'bs') xwBackspace(); else if (k) xwType(k); };
  document.addEventListener('keydown', (e) => {
    if ($('#screen-xwplay').classList.contains('hidden') || !xs || e.ctrlKey || e.metaKey || e.altKey) return;
    const inField = e.target.id === 'xw-input';          // letters and Backspace typed into the hidden field arrive via its input event
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && !inField) return;
    if (inField && (/^[a-zA-Z]$/.test(e.key) || e.key === 'Backspace')) return;
    const k = e.key, arrows = { ArrowRight: ['a', 1], ArrowLeft: ['a', -1], ArrowDown: ['d', 1], ArrowUp: ['d', -1] };
    if (/^[a-zA-Z]$/.test(k)) xwType(k); else if (k === 'Backspace') xwBackspace(); else if (k === 'Enter') xwCheck();
    else if (k === 'Tab') xwStep(e.shiftKey ? -1 : 1); else if (arrows[k] && !xs.done) xwMove(...arrows[k]); else return;
    e.preventDefault();
  });
}

// ---------- wiring ----------
function wire() {
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  $('#btn-review').onclick = startReview; $('#btn-learn').onclick = startLearn; $('#btn-trouble').onclick = () => go('trouble');
  $('#btn-trouble-start').onclick = startTrouble; $('#btn-again').onclick = again;
  $('#btn-exit').onclick = () => go('home');
  $('#btn-next').onclick = next; $('#btn-i-next').onclick = introNext; $('#btn-i-speak').onclick = () => cur && speak(cur.word.w);
  $('#btn-dk').onclick = () => answer(false, null);
  $('#btn-speak').onclick = () => cur && speak(cur.word.w);
  $('#q-form').onsubmit = (e) => { e.preventDefault(); if (locked) return; const v = $('#q-input').value; if (!v.trim()) return; const c = checkAnswer(v, cur.word.w); answer(c.ok, c.ok ? (c.typo ? '__typo__' : cur.word.w) : v); };
  $('#btn-hint').onclick = hintStep;
  document.addEventListener('keydown', (e) => {
    if ($('#screen-session').classList.contains('hidden')) return;
    if (!$('#q-intro').classList.contains('hidden')) { if (e.key === 'Enter') { e.preventDefault(); introNext(); } return; }
    if (!$('#q-feedback').classList.contains('hidden')) { if (e.key === 'Enter') { e.preventDefault(); next(); } return; }
    if (document.activeElement === $('#q-input')) return;
    if (/^[1-4]$/.test(e.key)) { const b = document.querySelectorAll('.opt')[+e.key - 1]; if (b) b.click(); }
    else if (e.key === '0') $('#btn-dk').click();
  });
  bindSettings(); wireXw();
  if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

applyTheme();
wire();
loadData().then(() => go('home')).catch((e) => { $('#t-hint').textContent = 'Не удалось загрузить словарь: ' + e.message; go('home'); });
