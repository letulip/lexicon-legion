// Lexicon Legion — app shell: store I/O, screens, session loops. Core logic lives in src/core/*.
import { SCHEMA_VERSION, defaultStore, migrate, looksLikeStore } from './src/core/store-migrate.js';
import { applyAnswer, newProgress, decay, seedLevel, rankOf, SCHEDULE_GATE } from './src/core/srs.js';
import { buildReview, buildLearn, troubleList, summary, dueCount } from './src/core/selection.js';
import { checkAnswer } from './src/core/matching.js';
import { revealMore, mask, HINT_STEPS } from './src/core/hints.js';
import { levelFromXp, xpIntoLevel, xpForNextLevel, rankTitle } from './src/core/leveling.js';
import { advanceStreak, todayStr } from './src/core/streak.js';
import { mergeGroups, pickDistractors, pickWordDistractors, shuffle } from './src/core/groups.js';

export const APP_VERSION = '0.3.0';
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
  if (id === 'trouble') renderTrouble();
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
  $('#trouble-list').innerHTML = list.length ? list.map(w => { const p = store.progress[w.id]; return `<div><b>${w.w}</b><span>${w.ru[0]}</span><span class="tag">промахов ${p.wrong} · ур. ${p.lvl}</span></div>`; }).join('') : '<p class="muted">Список пуст.</p>';
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
  inp.value = ''; inp.className = ''; $('#q-mask').textContent = ''; $('#btn-hint').disabled = false; $('#btn-hint').textContent = 'Подсказка';
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
  const steps = revealed.length / 2;
  if (steps >= HINT_STEPS) return;
  revealed = revealMore(cur.word.w, revealed, 2);
  $('#q-mask').textContent = mask(cur.word.w, revealed);
  $('#q-input').classList.add('hinted');
  const left = HINT_STEPS - revealed.length / 2;
  if (left <= 0 || revealed.length >= cur.word.w.length) { $('#btn-hint').disabled = true; $('#btn-hint').textContent = 'Подсказок больше нет'; }
  else $('#btn-hint').textContent = `Подсказка (ещё ${left})`;
  $('#q-input').focus();
}
function introNext() { stageDone++; qi++; question(); }

function answer(ok, given) {
  if (locked) return; locked = true;
  const { word, mode } = cur, now = Date.now(), hinted = revealed.length > 0;
  const prev = store.progress[word.id] || newProgress(now);
  const fresh = (prev.correct + prev.wrong) === 0;
  if (fresh) { store.stats.newToday.n++; result.fresh++; }
  const r = applyAnswer(prev, { ok, mode, now, hinted });
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
  $('#r-new').textContent = kind === 'learn' ? result.fresh : kind === 'trouble' ? result.fixed : sm.due;
  $('#r-new').nextElementSibling.textContent = kind === 'learn' ? 'новых слов' : kind === 'trouble' ? 'исправлено' : 'ещё к повторению';
  $('#r-note').textContent = kind === 'learn' ? `Порция пройдена: слова на уровне «узнаю», дальше — повторения по расписанию. Сегодня осталось новых: ${newLeft()}.`
    : kind === 'trouble' ? (sm.trouble ? `В списке ошибок осталось ${sm.trouble}.` : 'Список ошибок пуст.')
    : (sm.due ? `Ещё ${sm.due} к повторению.` : 'Повторения на сегодня закрыты.');
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
  on('#set-learnBatch', t => store.settings.learnBatch = +t.value);
  on('#set-reviewSize', t => store.settings.reviewSize = +t.value);
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
  bindSettings();
  if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

applyTheme();
wire();
loadData().then(() => go('home')).catch((e) => { $('#t-hint').textContent = 'Не удалось загрузить словарь: ' + e.message; go('home'); });
