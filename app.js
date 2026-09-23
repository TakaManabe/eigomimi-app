// 母音ドリル — 単語を見て母音を即答する。データは localStorage、音声は端末の音声合成（任意）。
import { allocate } from './order.js';
import { mergeSlots, PASS_RATE, PASS_RUNS, PASS_MIN } from './merge.js';
const COUNTS = [20, 50, 100, 0];   // 0 = 無制限
const RETRY_GAP = [4, 7];          // 誤答語を再出題するまでの間隔（問）
const LS = 'vd:';
const LIMITS = [0, 2, 3, 5];         // 回答の制限秒（0 = なし）
const SPEAKS = [['q', '出題時'], ['a', '回答後'], ['off', 'なし']];   // 音声を鳴らすタイミング
const ROUNDS = [5, 10, 20, 30];      // ミックス（カード）1 ラウンドの枚数
const INTERVALS = [1, 3, 7, 14, 30];  // 誤答語を復習する間隔（日）
const MIX_RATE = 0.3;                // 合格後、既習語を混ぜる割合（累積復習）
const FOCUS_RATE = 0.6;              // 英語耳 Lesson 別で、その Lesson の音に寄せる割合
const STAGES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const SYNC_URL = 'https://eigomimi-sync.mahiro-original.workers.dev';   // 端末間の同期（既定はオフ）
const SYNC_GAP = 10000;              // 自動同期の最短間隔（ミリ秒）
const wkey = w => w.k || w.word;   // 記録キー。同じ語でも赤字の位置が違えば別扱い

// ---------- 単語ごとの状態（単語帳・終了率）----------
// クリア = 2 回以上正解していて誤答が無いか、復習の間隔が 2 段階以上進んだ語
const WSTATES = [
  { id: 'clear', label: 'クリア', cls: 'clear' },
  { id: 'due',   label: '要復習', cls: 'due' },
  { id: 'learn', label: '練習中', cls: 'learn' },
  { id: 'new',   label: '未出題', cls: 'new' },
];
function wordState(w) {
  const d = S.words[wkey(w)];
  if (!d || !d.s) return 'new';
  if (d.due && d.due <= today()) return 'due';
  if ((d.c >= 2 && !d.w) || (d.iv ?? -1) >= 2) return 'clear';
  return 'learn';
}
function stepStats(words) {
  const c = { clear: 0, due: 0, learn: 0, new: 0 };
  for (const w of words) c[wordState(w)]++;
  return { ...c, n: words.length, rate: words.length ? Math.round(c.clear / words.length * 100) : 0 };
}
const wbar = st => h('div', { class: 'wbar' }, ...WSTATES.map(s2 =>
  st[s2.id] ? h('i', { class: 'sw-' + s2.cls, style: `flex:${st[s2.id]}` }) : null).filter(Boolean));

// ---------- 小道具 ----------
const $ = (sel, root = document) => root.querySelector(sel);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const ipa = s => `/${s}/`;
const fmt = t => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return fmt(new Date(y, m - 1, d + n)); };
const today = () => fmt(new Date());
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
let toastT;
function toast(msg, type = '') { const t = $('#toast'); t.textContent = msg; t.className = 'show ' + type; clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, 2800); }

// ---------- 保存 ----------
function load(key, def) { try { const v = localStorage.getItem(LS + key); return v ? JSON.parse(v) : def; } catch { return def; } }
function save(key, val) {
  try { localStorage.setItem(LS + key, JSON.stringify(val)); return true; }
  catch (e) { toast('保存できません（容量不足またはプライベートモード）', 'err'); console.warn(e); return false; }
}
// 記録は「この端末がやった分（MY）」と「他の端末からもらった分（PEER）」に分けて持ち、
// 画面に出す S.words / S.log / S.prog / S.conf は両者を合算した読み取り専用のビューにする。
// 書き込みは必ず MY にだけ行うので、同じデータを何度取り込んでも二重計上にならない。
const emptySlot = () => ({ words: {}, log: [], prog: {}, conf: {} });
let deviceId = load('device', null);
if (!deviceId) { deviceId = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); save('device', deviceId); }

let MY = emptySlot(), PEER = {};
const S = {
  words: {}, log: [], prog: {}, conf: {},   // 合算ビュー（直接書かない）
  settings: Object.assign({ count: 50, audio: true, voice: '', autoNext: true, limit: 3, cards: false, round: 10, sync: '', speak: '' }, load('settings', {})),
};

function recompute() {
  const m = mergeSlots([MY, ...Object.values(PEER)]);
  S.words = m.words; S.log = m.log; S.prog = m.prog; S.conf = m.conf;
}
// 旧形式（vd:words / vd:log / vd:prog / vd:conf）を、この端末の持ち分として取り込む
function loadStore() {
  const mine = load('mine', null);
  if (mine) MY = Object.assign(emptySlot(), mine);
  else {
    const oldWords = load('words', null), oldLog = load('log', null), oldProg = load('prog', null), oldConf = load('conf', null);
    MY = { words: oldWords || {}, log: oldLog || [], conf: oldConf || {},
           prog: Object.fromEntries(Object.entries(oldProg || {}).map(([k, v]) => [k, { runs: v.runs || [] }])) };
    if (oldWords || oldLog || oldProg || oldConf) {
      save('mine', MY);
      for (const k of ['words', 'log', 'prog', 'conf']) localStorage.removeItem(LS + k);
    }
  }
  PEER = load('peers', {}) || {};
  recompute();
}
const persistMine = () => { if (MY.log.length > 1000) MY.log = MY.log.slice(-1000); save('mine', MY); recompute(); };
const persistPeers = () => { save('peers', PEER); recompute(); };
// 旧設定（audio の真偽）から、鳴らすタイミングの設定へ移す。既定は「出題時」
if (!S.settings.speak) { S.settings.speak = S.settings.audio === false ? 'off' : 'q'; delete S.settings.audio; save('settings', S.settings); }
const persistSettings = () => save('settings', S.settings);

// ---------- 端末間の同期（任意・既定オフ）----------
// 自分の持ち分を送り、全端末の持ち分を受け取って置き換えるだけ。
// サーバー側にマージは無く、何度呼んでも結果は同じ。
const newSyncCode = () => { const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; return [...crypto.getRandomValues(new Uint8Array(24))].map(b => a[b % 36]).join(''); };
let syncing = false, lastSync = 0;
async function syncNow(manual) {
  const code = S.settings.sync;
  if (!code || syncing || !navigator.onLine) return false;
  if (!manual && Date.now() - lastSync < SYNC_GAP) return false;
  syncing = true;
  try {
    const r = await fetch(`${SYNC_URL}/${code}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device: deviceId, slot: MY }) });
    const all = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(all.error || `HTTP ${r.status}`);
    const next = {};
    for (const [k, v] of Object.entries(all)) if (k !== deviceId && v && typeof v === 'object') next[k] = Object.assign(emptySlot(), v);
    const changed = JSON.stringify(next) !== JSON.stringify(PEER);
    PEER = next; persistPeers();
    lastSync = Date.now(); S.settings.syncAt = lastSync; persistSettings();
    if (manual) toast(`同期しました（${Object.keys(next).length + 1} 台）`, 'ok');
    // 画面がホームのときだけ描き直す（ドリル中に消さない）
    if ((changed || manual) && !location.hash.startsWith('#/s') && !location.hash.startsWith('#/d') && !location.hash.startsWith('#/r')) route();
    return true;
  } catch (e) {
    if (manual) toast('同期できません: ' + e.message, 'err');
    return false;
  } finally { syncing = false; }
}
// 旧名は MY への書き込み後の再計算として残す（呼び出し箇所を変えずに済ませるため）
const persistWords = persistMine, persistLog = persistMine, persistProg = persistMine, persistConf = persistMine;

// ---------- データ ----------
let DATA = null;
const wordsFor = set => DATA.words.filter(w => set.sounds.includes(w.sound));
const setById = id => DATA.sets.find(s => s.id === id);
const isWeak = w => { const d = S.words[wkey(w)]; return d && d.w > 0 && d.w >= d.c; };

// ---------- フォニックス・コース ----------
// sel の解釈は tests/build-drill-words.py の select() と同じにすること
function selectWords(sel) {
  let out = DATA.words;
  if (sel.st) out = out.filter(w => sel.st.includes(w.st));
  if (sel.upto) { const lim = STAGES.indexOf(sel.upto); out = out.filter(w => STAGES.indexOf(w.st) >= 0 && STAGES.indexOf(w.st) <= lim); }
  if (sel.g) out = out.filter(w => sel.g.includes(w.g));
  if (sel.note) out = out.filter(w => w.note);
  if (sel.sounds) out = out.filter(w => sel.sounds.includes(w.sound));
  return out;
}
const allSteps = () => DATA.course.flatMap(st => st.steps);
const mainSteps = () => DATA.course.filter(st => !st.extra).flatMap(st => st.steps);
const stepById = id => allSteps().find(t => t.id === id);
const isPassed = id => !!S.prog[id]?.passed;
const nextStep = () => mainSteps().find(t => !isPassed(t.id));
const stepRate = id => { const r = (S.prog[id]?.runs || []).slice(-1)[0]; return r && r.n ? Math.round(r.c / r.n * 100) : null; };
const dueWords = () => { const t = today(); return DATA.words.filter(w => { const d = S.words[wkey(w)]; return d && d.due && d.due <= t; }); };

// ミックスの選択肢: フォニックスが「どの語を出すか」、英語耳が「何と迷わせるか」を決める。
// 正解 ＋ その綴りが取る別の音（読み違え）＋ 英語耳で同じまとまりの音（聞き違え）＋ 1 つ。
// 同点はこれまで実際に選んでしまった相手を優先する。
function mixChoices(w, poolSounds = [], n = 4) {
  const rank = x => -(S.conf[`${w.sound}→${x}`] || 0);
  const byRank = arr => shuffle([...new Set(arr)].filter(x => x && x !== w.sound)).sort((a, b) => rank(a) - rank(b));
  const spell = byRank((DATA.gsounds[w.g] || []).map(([x]) => x));   // 綴りの罠
  const ear = byRank(DATA.eigo[w.sound] || []);                      // 英語耳の罠
  const out = [];
  if (spell[0]) out.push(spell[0]);
  const e0 = ear.find(x => !out.includes(x)); if (e0) out.push(e0);
  for (const x of [...spell, ...ear, ...byRank(poolSounds), ...byRank(Object.keys(DATA.eigo))]) {
    if (out.length >= n - 1) break;
    if (!out.includes(x)) out.push(x);
  }
  return shuffle([w.sound, ...out.slice(0, n - 1)]);
}
const eigoGroupsOf = snd => (DATA.eigoGroups || []).filter(g => g.sounds.includes(snd));
const ruleOf = w => (DATA.rules || {})[`${w.st}|${w.g}`] || '';
// その綴りが取る音の内訳。上位で切っても、その語の答えは必ず入れる
function breakdown(w, n = 4) {
  const all = DATA.gsounds[w.g] || [];
  if (all.slice(0, n).some(([x]) => x === w.sound)) return all.slice(0, n);
  const own = all.find(([x]) => x === w.sound);
  return own ? [...all.slice(0, n - 1), own] : all.slice(0, n);
}
const mouthOf = snd => (DATA.mouth || {})[snd] || '';
// 間違えたときの 2 行: フォニックスの規則と、英語耳の口の作り方（正解と、選んだ音の両方）
function ruleLines(w, chosen) {
  const out = [];
  if (w.ex) {
    // 綴りの規則で説明できない語。規則をそのまま出すと答えと矛盾するので、例外として見せる
    const fam = (DATA.exGroups || {})[`${w.st}|${w.g}|${w.sound}`] || [];
    out.push(h('div', { class: 'small' }, h('b', { class: 'err' }, '例外 '), `${w.g} なのに ${ipa(w.sound)}`,
      fam.length > 1 ? h('span', { class: 'muted' }, `　仲間: ${fam.slice(0, 6).join(' ')}${fam.length > 6 ? ' …' : ''}`) : null));
    out.push(h('div', { class: 'small muted' }, `ふつうは… ${ruleOf(w)}`));
  } else {
    out.push(h('div', { class: 'small' }, h('b', {}, '綴り '), `${w.g} → `, ruleOf(w)));
  }
  const mouth = [h('span', {}, h('b', {}, ipa(w.sound)), ' ', mouthOf(w.sound))];
  if (chosen && chosen !== w.sound && mouthOf(chosen)) mouth.push(h('span', { class: 'muted' }, `　／ ${ipa(chosen)} ${mouthOf(chosen)}`));
  out.push(h('div', { class: 'small' }, h('b', {}, '口 '), ...mouth));
  const bd = breakdown(w);
  if (bd.length > 1) out.push(h('div', { class: 'small muted' }, `${w.g} の内訳: `,
    ...bd.map(([snd, n], i) => h('span', snd === w.sound ? { class: 'err' } : {}, `${i ? '・' : ''}${ipa(snd)} ${n}`))));
  return out;
}

// この端末の持ち分に 1 回分を足す。合格は合算した runs から導かれる
function recordRun(id, n, c) {
  const p = MY.prog[id] || (MY.prog[id] = { runs: [] });
  p.runs.push({ n, c, ts: Date.now() });
  if (p.runs.length > 40) p.runs = p.runs.slice(-40);
  persistMine();
  return isPassed(id);
}

// ---------- 音声（合成音声のみ。発音判定はしない）----------
const speakAt = when => S.settings.speak === when;
function speak(text) {
  if (S.settings.speak === 'off' || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 0.95;
    const vs = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
    const v = vs.find(v => v.voiceURI === S.settings.voice) || vs.find(v => v.lang === 'en-US') || vs[0];
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

// ---------- 強調表示 ----------
function hlWord(e) {
  if (!e.hl) return h('span', {}, e.word);
  const [a, b] = e.hl;
  return h('span', {}, e.word.slice(0, a), h('span', { class: 'hl' }, e.word.slice(a, b)), e.word.slice(b));
}

// ---------- ホーム ----------
function renderHome(main) {
  const t = today();
  const todayLogs = S.log.filter(l => l.d === t);
  const n = todayLogs.reduce((a, l) => a + l.n, 0), c = todayLogs.reduce((a, l) => a + l.c, 0);
  const days = new Set(S.log.map(l => l.d));
  let streak = 0; for (let d = days.has(t) ? t : addDays(t, -1); days.has(d); d = addDays(d, -1)) streak++;
  const week = []; for (let i = 6; i >= 0; i--) { const d = addDays(t, -i); week.push({ d, n: S.log.filter(l => l.d === d).reduce((a, l) => a + l.n, 0) }); }
  const maxN = Math.max(1, ...week.map(w => w.n));

  main.append(
    h('section', { class: 'card stats' },
      stat('今日', n, '語'), stat('今日の正答率', n ? Math.round(c / n * 100) + '%' : '—', ''), stat('連続日数', streak, '日')),
    h('section', { class: 'card' },
      h('div', { class: 'bars' }, ...week.map(w => h('div', { class: 'bar-col' },
        h('div', { class: 'bar-wrap' }, h('div', { class: 'bar' + (w.d === t ? ' today' : ''), style: `height:${Math.round(w.n / maxN * 100)}%` })),
        h('div', { class: 'small' }, w.n || ''), h('div', { class: 'small muted' }, w.d.slice(5).replace('-', '/'))))),
      h('p', { class: 'small muted' }, '単語を見て母音を即答。速さより「迷わず正しく」。間違えた語は同じ回の後半と次回以降に優先して出ます。答えを見たら声に出す。')),
  );
  // 今日の復習
  const due = dueWords();
  main.append(h('section', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', {}, '今日の復習'), h('span', { class: 'small muted' }, `${due.length} 語`)),
    due.length
      ? h('div', {}, h('p', { class: 'small muted' }, '前に間違えた語。正解するたび 1→3→7→14→30 日の間隔で戻ってきます'),
          h('a', { class: 'btn primary', href: '#/r' }, `復習する（${due.length}）`))
      : h('p', { class: 'small muted' }, '今日の復習はありません。間違えた語が翌日から順に出ます')));

  // フォニックス・コース
  const nx = nextStep();
  const main0 = mainSteps(), donePass = main0.filter(t => isPassed(t.id)).length;
  main.append(h('section', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', {}, 'フォニックス・コース'), h('span', { class: 'small muted' }, `${donePass} / ${main0.length} 合格`)),
    h('p', { class: 'small muted' }, `6 つの音節タイプの順（閉音節 → 開音節・マジック e → 母音チーム → r 性母音 → 二重母音 → 弱音節）に、${DATA.words.length} 語のすべての綴りをちょうど 1 回ずつ通ります。${PASS_MIN}問以上を正答率${Math.round(PASS_RATE * 100)}%で${PASS_RUNS}回連続すると合格。合格後はそのステップに既習語が${Math.round(MIX_RATE * 100)}%混ざります。`),
    h('div', { class: 'progress' }, h('div', { style: `width:${Math.round(donePass / main0.length * 100)}%` }))));
  const stepRow = t => {
    const p = isPassed(t.id), isNext = nx && nx.id === t.id, rate = stepRate(t.id);
    const st = stepStats(selectWords(t.sel));
    return h('div', { class: 'field', style: 'align-items:flex-start' },
      h('span', { class: 'small', style: 'flex:1;min-width:0' },
        h('span', { class: p ? 'ok' : '' }, p ? '✓ ' : (isNext ? '▶ ' : '　'), t.title),
        h('span', { class: 'small muted' }, `　${t.n}語`, rate == null ? '' : `　直近 ${rate}%`),
        t.hint ? h('div', { class: 'small muted' }, t.hint) : null,
        wbar(st),
        h('div', { class: 'small muted rate' }, `終了率 `, h('b', { class: st.rate >= 80 ? 'ok' : '' }, `${st.rate}%`),
          `（クリア ${st.clear} / ${st.n}）`, st.due ? h('span', { class: 'err' }, `　要復習 ${st.due}`) : '')),
      h('span', { class: 'row', style: 'flex-wrap:nowrap;gap:.3rem' },
        h('a', { class: 'btn small ghost', href: `#/w/${t.id}` }, '単語帳'),
        h('a', { class: 'btn small' + (isNext ? ' primary' : ''), href: `#/s/${t.id}` }, p ? '復習' : '始める')));
  };
  for (const stg of DATA.course.filter(c => !c.extra)) {
    main.append(h('section', { class: 'card' },
      h('h3', {}, stg.title), h('p', { class: 'small muted' }, stg.hint || ''), ...stg.steps.map(stepRow)));
  }
  const lessonStage = DATA.course.find(c => c.id === 'L');
  if (lessonStage) main.append(h('section', { class: 'card' }, h('details', {},
    h('summary', {}, h('b', {}, lessonStage.title)),
    h('p', { class: 'small muted' }, lessonStage.hint || ''),
    ...lessonStage.steps.map(t => h('div', { class: 'field' },
      h('span', { class: 'small' }, t.title,
        h('div', { class: 'small muted' }, t.hint, `　${t.n}語`)),
      h('a', { class: 'btn small', href: `#/s/${t.id}` }, 'ドリル'))),
    h('p', { class: 'small muted' }, Object.entries(DATA.noLesson || {})
      .map(([k, v]) => `${ipa(k)} … ${v}`).join(' ／ ')))));
  for (const stg of DATA.course.filter(c => c.extra && c.id !== 'L')) {
    main.append(h('section', { class: 'card' }, h('details', {},
      h('summary', {}, h('b', {}, stg.title)),
      h('p', { class: 'small muted' }, stg.hint || ''), ...stg.steps.map(stepRow))));
  }
  // 従来の音コントラスト別セット
  const legacy = h('div');
  main.append(h('section', { class: 'card' }, h('details', {}, h('summary', {}, h('b', {}, '音のコントラスト別セット（従来の d01〜d10）')), legacy)));
  for (const set of DATA.sets) {
    const ws = wordsFor(set);
    const sl = S.log.filter(l => l.set === set.id);
    const tot = sl.reduce((a, l) => a + l.n, 0), cor = sl.reduce((a, l) => a + l.c, 0);
    const seen = ws.filter(w => S.words[wkey(w)]?.s).length;
    const weak = ws.filter(isWeak).length;
    legacy.append(h('div', { class: 'card', style: 'margin-top:.6rem' },
      h('div', { class: 'row between' }, h('h3', {}, set.title), h('span', { class: 'small muted' }, `${ws.length} 語`)),
      h('div', { class: 'small muted' }, set.hint || ''),
      h('div', { class: 'small' }, tot ? `正答率 ${Math.round(cor / tot * 100)}%（${cor}/${tot}）` : '未実施', `　既出 ${seen}/${ws.length}`, weak ? h('span', { class: 'err' }, `　苦手 ${weak}`) : ''),
      h('div', { class: 'row' },
        h('a', { class: 'btn primary', href: `#/d/${set.id}` }, '始める'),
        weak ? h('a', { class: 'btn', href: `#/d/${set.id}?weak=1` }, `苦手だけ（${weak}）`) : null)));
  }
  // 混同・設定・バックアップ
  const conf = {};
  for (const l of S.log) for (const [k, v] of Object.entries(l.conf || {})) conf[k] = (conf[k] || 0) + v;
  const confTop = Object.entries(conf).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const voiceSel = h('select', { class: 'btn small', onChange: e => { S.settings.voice = e.target.value; persistSettings(); } });
  const fillVoices = () => { voiceSel.replaceChildren(h('option', { value: '' }, '音声: 自動'), ...(('speechSynthesis' in window) ? speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang)).map(v => h('option', { value: v.voiceURI, selected: v.voiceURI === S.settings.voice }, v.name)) : [])); };
  fillVoices(); if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', fillVoices);
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onChange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      if (obj.app !== 'vowel-drill') throw new Error('形式が違います');
      // 端末ごとのスロットを丸ごと置き換える。足し算ではないので、同じファイルを
      // 何度復元しても結果は変わらない
      const slots = obj.slots || (obj.words ? { [obj.device || 'restored']: { words: obj.words, log: obj.log || [], conf: obj.conf || {}, prog: Object.fromEntries(Object.entries(obj.prog || {}).map(([k, v]) => [k, { runs: v.runs || [] }])) } } : null);
      if (!slots || typeof slots !== 'object') throw new Error('形式が違います');
      let n = 0;
      for (const [id, raw] of Object.entries(slots)) {
        if (!raw || typeof raw !== 'object') continue;
        const slot = Object.assign(emptySlot(), raw);
        if (!Array.isArray(slot.log)) slot.log = [];
        if (id === deviceId && !Object.keys(MY.words).length && !MY.log.length) MY = slot;
        else PEER[id === deviceId ? `${id}-復元` : id] = slot;
        n++;
      }
      persistPeers(); persistMine();
      toast(`復元しました（${n} 台分）`, 'ok'); route();
    } catch (err) { toast('復元できません: ' + err.message, 'err'); }
    e.target.value = '';
  } });
  main.append(h('section', { class: 'card' },
    h('h3', {}, '混同しやすい綴り→音（正しい音 → 選んだ音）'),
    confTop.length ? h('div', { class: 'chips' }, ...confTop.map(([k, v]) => { const [f, to] = k.split('→'); return h('span', { class: 'chip warn' }, `${ipa(f)} → ${ipa(to)} ×${v}`); })) : h('p', { class: 'small muted' }, 'まだ記録がありません'),
    h('div', { class: 'row', style: 'margin-top:.6rem' },
      voiceSel),
    h('div', { class: 'field' }, h('span', { class: 'small' }, '音声を鳴らす'),
      seg(SPEAKS, S.settings.speak, v => { S.settings.speak = v; persistSettings(); })),
    h('p', { class: 'small muted' }, '「出題時」は単語が出た瞬間に読み上げます（既定）。綴りを見ながら音も聞くので、英語耳の音と綴りが結びつきます。綴りだけで答える練習をしたいときは「回答後」にしてください。単語帳や結果画面のタップはどの設定でも鳴ります。'),
    h('div', { class: 'row', style: 'margin-top:.6rem' },
      h('button', { class: 'btn small', onClick: () => {
        const blob = new Blob([JSON.stringify({ app: 'vowel-drill', schema: 1, exportedAt: new Date().toISOString(), words: S.words, log: S.log, prog: S.prog }, null, 1)], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `vowel-drill-${today()}.json` }); document.body.append(a); a.click(); a.remove();
      } }, 'バックアップ書き出し'),
      h('button', { class: 'btn small', onClick: () => file.click() }, '復元'), file),
    syncCard(),
    h('h3', { style: 'margin-top:1rem' }, '記録のリセット'),
    h('p', { class: 'small muted' }, '消した記録は元に戻せません。先にバックアップを書き出しておくと安全です。',
      S.settings.sync ? 'このリセットはこの端末の持ち分と手元の控えに対して行います。ほかの端末に残っている記録は、次の同期で戻ってきます（その端末でも消してください）。' : ''),
    ...RESETS.map(r => h('div', { class: 'field' },
      h('span', { class: 'small' }, r.label, h('div', { class: 'small muted' }, r.desc)),
      h('button', { class: 'btn small ghost err', onClick: () => {
        if (!confirm(`${r.label}\n\n${r.desc}\n\n元に戻せません。実行しますか？`)) return;
        r.run(); persistPeers(); persistMine(); toast(`${r.label}を実行しました`, 'ok'); route();
      } }, 'リセット'))),
    h('p', { class: 'small muted', style: 'margin-top:.8rem' }, `単語 ${DATA.words.length} 語 ／ `,
      S.settings.sync ? '記録は同期用のサーバーにも置かれます（同期オン）。' : '記録は端末内のみ（サーバー送信なし）。',
      '自動の発音判定は行いません。')));
}
// 記録のリセット。粒度を分けて、間違って全部消さずに済むようにする
// 消すのはこの端末の持ち分と、手元にある他端末の控え。同期を使っている場合、
// 他の端末に残っている記録は次の同期で戻ってくる（その端末側でも消す必要がある）
const allSlots = () => [MY, ...Object.values(PEER)];

// 同期の設定。既定はオフで、オンにした端末だけが記録を送る
function syncCard() {
  const on = !!S.settings.sync;
  const box = h('div', {});
  const redraw = () => { box.replaceChildren(...body()); };
  const body = () => {
    if (!on) return [
      h('p', { class: 'small muted' }, '既定はオフです。オンにすると、この端末の記録を同期用のサーバーに置いて、ほかの端末と合算できます。端末ごとの持ち分を別々に持つので、何度同期しても二重に数えられることはありません。'),
      h('div', { class: 'row' },
        h('button', { class: 'btn small primary', onClick: async () => {
          if (!confirm('同期を始めると、この端末の学習記録がサーバーに置かれます。よろしいですか？')) return;
          S.settings.sync = newSyncCode(); persistSettings();
          if (await syncNow(true)) route(); else { S.settings.sync = ''; persistSettings(); }
        } }, 'この端末で同期を始める'),
        h('button', { class: 'btn small', onClick: async () => {
          const code = (prompt('もう一方の端末に出ている同期コードを貼り付けてください') || '').trim().toLowerCase();
          if (!code) return;
          if (!/^[a-z0-9]{16,64}$/.test(code)) return toast('コードの形式が違います', 'err');
          S.settings.sync = code; persistSettings();
          if (await syncNow(true)) route(); else { S.settings.sync = ''; persistSettings(); }
        } }, '別の端末のコードを入れる')),
    ];
    const at = S.settings.syncAt ? new Date(S.settings.syncAt) : null;
    return [
      h('p', { class: 'small' }, h('b', { class: 'ok' }, '同期オン'),
        `　合算中: ${Object.keys(PEER).length + 1} 台`,
        at ? `　最終同期 ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` : ''),
      h('p', { class: 'small muted' }, 'ほかの端末では「別の端末のコードを入れる」から、このコードを貼り付けてください。'),
      h('div', { class: 'field' },
        h('code', { class: 'small', style: 'word-break:break-all' }, S.settings.sync),
        h('button', { class: 'btn small', onClick: () => {
          navigator.clipboard?.writeText(S.settings.sync).then(() => toast('コピーしました', 'ok'), () => toast('コピーできません', 'err'));
        } }, 'コピー')),
      h('div', { class: 'row' },
        h('button', { class: 'btn small primary', onClick: () => syncNow(true) }, '今すぐ同期'),
        h('button', { class: 'btn small ghost err', onClick: () => {
          if (!confirm('この端末の同期を止めます。記録は端末に残ります。サーバー上のデータは消えません。')) return;
          S.settings.sync = ''; delete S.settings.syncAt; persistSettings(); route();
        } }, '同期を止める')),
      h('p', { class: 'small muted' }, '「コードを知っている人だけが読み書きできる」仕組みです。コードは他人に渡さないでください。'),
    ];
  };
  redraw();
  return h('div', {}, h('h3', { style: 'margin-top:1rem' }, '端末間の同期'), box);
}
const RESETS = [
  { id: 'due', label: '復習キューだけ', desc: '「今日の復習」の予定を空にします。正答率や合格はそのまま',
    run: () => { for (const sl of allSlots()) for (const d of Object.values(sl.words)) { delete d.due; delete d.iv; } } },
  { id: 'prog', label: 'コースの合格だけ', desc: 'ステップの合格と直近の成績を消して、最初のステップからやり直します',
    run: () => { for (const sl of allSlots()) sl.prog = {}; } },
  { id: 'conf', label: '混同の記録だけ', desc: '「正しい音 → 選んだ音」の集計を消します。ミックスの選択肢の寄せ方が初期化されます',
    run: () => { for (const sl of allSlots()) sl.conf = {}; } },
  { id: 'all', label: 'すべての記録', desc: '単語ごとの成績・履歴・合格・復習キュー・混同のすべてを消します',
    run: () => { MY = emptySlot(); PEER = {}; } },
];
const stat = (l, v, u) => h('div', {}, h('div', { class: 'val' }, String(v)), h('div', { class: 'small muted' }, l + (u ? `（${u}）` : '')));

// ---------- 出題順（通常・カード共用）----------
// 音ごとの取り分。語数が偏っているとき均等割りにすると、少ない音の語（2 語しか
// 無い /e/ の any / many など）が毎回出てしまうので、語数の平方根に比例させて
// ならす。取り切れない分は他の音へ回し、必ず n 問そろえる。
// 重み付き無作為抽出（Efraimidis–Spirakis）。未出題と誤答の多い語を優先し、
// 今日すでに出した語は控えめにする
function weightOf(w) {
  const d = S.words[wkey(w)]; let wt = 1;
  if (!d || !d.s) return wt + 3;                       // 未出題を強く優先（プールを一巡させる）
  wt += 3 * d.w / d.s;
  if (d.lw === today()) wt += 1;                       // 今日間違えた
  if (d.due && d.due <= today()) wt += 2;              // 復習期限
  if (d.s >= 3 && d.w === 0) wt *= 0.4;                // 3 回以上無誤答
  if (d.ls === today()) wt *= 0.5;                     // 今日すでに出した
  return Math.max(0.05, wt);
}
function pickWords(pool, n, sounds, focus) {
  if (n <= 0 || !pool.length) return [];
  // 英語耳 Lesson 別: 出題の FOCUS_RATE をその Lesson の音に寄せる
  if (focus && focus.length && sounds) {
    const f = sounds.filter(x => focus.includes(x)), o = sounds.filter(x => !focus.includes(x));
    if (f.length && o.length) {
      const nf = Math.max(1, Math.round(n * FOCUS_RATE));
      return [...pickWords(pool, nf, f), ...pickWords(pool, n - nf, o)];
    }
  }
  const groups = sounds ? sounds.map(s => pool.filter(w => w.sound === s)) : [pool];
  const quota = allocate(groups.map(g => g.length), Math.min(n, pool.length));
  const out = [];
  groups.forEach((g, i) => {
    out.push(...g.map(w => ({ w, key: Math.pow(Math.random(), 1 / weightOf(w)) }))
      .sort((a, b) => b.key - a.key).slice(0, quota[i]).map(x => x.w));
  });
  return out;
}
function reviewPoolFor(spec) {
  if (!(spec.isStep && isPassed(spec.id))) return [];
  const inStep = new Set(spec.words.map(wkey));
  return DATA.words.filter(w => S.words[wkey(w)]?.s && !inStep.has(wkey(w)));
}
const poolFilter = { weak: isWeak, todo: w => wordState(w) !== 'clear' };
function makeQueue(spec, only, count, reviewPool = reviewPoolFor(spec)) {
  let pool = poolFilter[only] ? spec.words.filter(poolFilter[only]) : spec.words;
  if (!pool.length) pool = spec.words;
  const n = count || pool.length;
  const k = reviewPool.length ? Math.round(n * MIX_RATE) : 0;
  return shuffle([...pickWords(pool, n - k, spec.sounds, spec.focus), ...pickWords(reviewPool, k, null)]).slice(0, n);
}

// 中止したときに書き戻せるよう、変更前の値を 1 回だけ控える
function snap(map, obj, key) { if (!map.has(key)) map.set(key, obj[key] === undefined ? undefined : (typeof obj[key] === 'object' ? { ...obj[key] } : obj[key])); }
function rollback(snapWords, snapConf) {
  for (const [k, v] of snapWords) { if (v === undefined) delete MY.words[k]; else MY.words[k] = v; }
  for (const [k, v] of snapConf) { if (v === undefined) delete MY.conf[k]; else MY.conf[k] = v; }
  snapWords.clear(); snapConf.clear();
  persistMine();
}

// 復習キュー: 間違えた語は翌日から 1→3→7→14→30 日
function recordWord(w, ok, snapWords) {
  const k = wkey(w);
  if (snapWords) snap(snapWords, MY.words, k);
  const merged = S.words[k] || {};                     // 復習の進み具合は全端末の合算で判断する
  const d = MY.words[k] || { s: 0, c: 0, w: 0, lw: null };
  d.s++; d.ls = today();
  if (ok) { d.c++; if (merged.due) { d.iv = Math.min((merged.iv ?? 0) + 1, INTERVALS.length - 1); d.due = addDays(today(), INTERVALS[d.iv]); } }
  else { d.w++; d.lw = today(); d.iv = 0; d.due = addDays(today(), INTERVALS[0]); }
  MY.words[k] = d; persistMine();
}

// ---------- 単語帳 ----------
function renderBook(main, stepId) {
  const step = stepById(stepId);
  if (!step) { main.append(h('p', {}, '見つかりません'), h('a', { class: 'btn', href: '#/' }, 'ホーム')); return; }
  const words = selectWords(step.sel), st = stepStats(words);
  let filter = st.due ? 'due' : 'all', limit = 300;

  const list = h('div', { class: 'wlist' });
  const more = h('div', { class: 'center', style: 'margin-top:.6rem' });
  const chips = h('div', { class: 'chips' });
  const draw = () => {
    chips.replaceChildren(
      h('button', { class: 'chip sel' + (filter === 'all' ? ' warn' : ''), onClick: () => { filter = 'all'; limit = 300; draw(); } }, `すべて ${st.n}`),
      ...WSTATES.map(s2 => h('button', { class: 'chip sel' + (filter === s2.id ? ' warn' : ''), onClick: () => { filter = s2.id; limit = 300; draw(); } },
        h('span', { class: 'badge ' + s2.cls }, s2.label), ` ${st[s2.id]}`)));
    const shown = words.filter(w => filter === 'all' || wordState(w) === filter);
    list.replaceChildren(...shown.slice(0, limit).map(w => {
      const d = S.words[wkey(w)] || { s: 0, c: 0 }, s2 = WSTATES.find(x => x.id === wordState(w));
      return h('button', { class: 'wrow', onClick: () => speak(w.word) },
        h('span', { class: 'ww' }, hlWord(w)),
        h('span', { class: 'ws' }, ipa(w.sound)),
        h('span', { class: 'ws' }, d.s ? `${d.c}/${d.s}` : '—'),
        h('span', { class: 'badge ' + s2.cls }, s2.label));
    }));
    more.replaceChildren(shown.length > limit
      ? h('button', { class: 'btn small', onClick: () => { limit += 500; draw(); } }, `他 ${shown.length - limit} 語を表示`)
      : (shown.length ? h('span', { class: 'small muted' }, `${shown.length} 語`) : h('p', { class: 'small muted' }, 'この状態の語はありません')));
  };
  draw();

  main.append(h('section', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', {}, step.title), h('a', { class: 'small', href: '#/' }, '← ホーム')),
    step.hint ? h('p', { class: 'small muted' }, step.hint) : null,
    h('div', { class: 'stats' },
      stat('終了率', st.rate + '%', ''), stat('クリア', `${st.clear}/${st.n}`, '語'), stat('要復習', st.due, '語')),
    wbar(st),
    h('p', { class: 'small muted' }, 'クリア = 2 回以上正解して誤答が無いか、復習の間隔が 2 段階以上進んだ語。タップで音声が鳴ります。'),
    h('div', { class: 'row' },
      h('a', { class: 'btn primary', href: `#/s/${stepId}` }, 'このステップをドリル'),
      st.n - st.clear ? h('a', { class: 'btn', href: `#/s/${stepId}?todo=1` }, `まだの語だけ（${st.n - st.clear}）`) : null)));
  main.append(h('section', { class: 'card' }, chips, list, more));
}

// ---------- ドリルの対象 ----------
function specForStep(id) {
  const st = stepById(id); if (!st) return null;
  const stage = DATA.course.find(c => c.steps.some(t => t.id === id));
  const extra = !!stage.extra;
  return { id, title: extra ? st.title : `${stage.title.replace(/^\d+\.\s*/, '')} — ${st.title}`,
           hint: st.hint, words: selectWords(st.sel), sounds: st.sounds, focus: st.focus,
           mix: !!st.mix, isStep: !extra };
}
function specForSet(id) {
  const set = setById(id); if (!set) return null;
  return { id, title: set.title, hint: set.hint, words: wordsFor(set), sounds: set.sounds, mix: false, isStep: false, examples: set.examples };
}
function specForReview() {
  const words = dueWords();
  const sounds = [...new Set(words.map(w => w.sound))];
  return { id: 'review', title: '今日の復習', hint: '前に間違えた語。正解するたび 1→3→7→14→30 日の間隔で戻ってきます',
           words, sounds, mix: sounds.length > 5, isStep: false };
}

// ---------- ドリル ----------
function renderDrill(main, spec, only) {
  if (!spec) { main.append(h('p', {}, '見つかりません'), h('a', { class: 'btn', href: '#/' }, 'ホーム')); return () => {}; }
  const all = spec.words;
  if (!all.length) { main.append(h('div', { class: 'card' }, h('h2', {}, spec.title), h('p', {}, '出題できる語がありません'), h('a', { class: 'btn', href: '#/' }, 'ホーム'))); return () => {}; }
  let count = S.settings.count;
  const passed = spec.isStep && isPassed(spec.id);
  // 合格前は blocked（そのステップの語だけ）、合格後は mixed（既習語を混ぜる）
  const stepSet = new Set(all.map(wkey));
  const reviewPool = passed ? DATA.words.filter(w => S.words[wkey(w)]?.s && !stepSet.has(wkey(w))) : [];
  const exMap = {};
  for (const snd of new Set(DATA.words.map(w => w.sound)))
    exMap[snd] = spec.examples?.[snd] || (all.filter(w => w.sound === snd && !w.note).slice(0, 2).map(w => w.word).join(' / ')
                 || DATA.words.filter(w => w.sound === snd && !w.note).slice(0, 2).map(w => w.word).join(' / '));

  const roundRow = h('div', { class: 'field', hidden: !S.settings.cards },
    h('span', { class: 'small' }, '1 ラウンドの枚数（区切り）'),
    seg(ROUNDS.map(r => [r, `${r}枚`]), S.settings.round, v => { S.settings.round = v; persistSettings(); }));
  const whyRow = h('p', { class: 'small muted', hidden: !S.settings.cards },
    'ミックス: 出題する語はフォニックス（綴りの型）、選択肢は英語耳（日本語で潰れる音）＋その綴りが取る別の音。間違えると両方の理由が出ます。');
  const cfg = h('section', { class: 'card' },
    h('h2', {}, spec.title), h('p', { class: 'small muted' }, spec.hint || ''),
    h('p', { class: 'small' }, spec.mix
      ? `${all.length} 語 ・ ${spec.sounds.length} 音（毎問 3 択を作ります）`
      : spec.sounds.map(s => `${ipa(s)} ${all.filter(w => w.sound === s).length}語`).join('　')),
    passed ? h('p', { class: 'small ok' }, `合格済み。既習語を ${Math.round(MIX_RATE * 100)}% 混ぜて出題します`) : null,
    spec.isStep && !passed ? h('p', { class: 'small muted' }, `合格まで: ${PASS_MIN}問以上を正答率${Math.round(PASS_RATE * 100)}%で${PASS_RUNS}回連続`) : null,
    h('div', { class: 'field' }, h('span', { class: 'small' }, '1 セッションの枚数'), seg(COUNTS.map(c => [c, c || '無制限']), count, v => { count = v; S.settings.count = v; persistSettings(); })),
    h('div', { class: 'field' }, h('span', { class: 'small' }, '回答の制限時間'), seg(LIMITS.map(l => [l, l ? `${l}秒` : 'なし']), S.settings.limit, v => { S.settings.limit = v; persistSettings(); })),
    h('div', { class: 'field' }, h('span', { class: 'small' }, '不正解のあと'), seg([[true, '1.5秒で自動的に次へ'], [false, '「次へ」を押す']], S.settings.autoNext, v => { S.settings.autoNext = v; persistSettings(); })),
    h('div', { class: 'field' }, h('span', { class: 'small' }, '音声を鳴らす'), seg(SPEAKS, S.settings.speak, v => { S.settings.speak = v; persistSettings(); })),
    h('div', { class: 'field' }, h('span', { class: 'small' }, '形式'), seg([[false, 'ふつう'], [true, 'ミックス（カード）']], !!S.settings.cards, v => { S.settings.cards = v; persistSettings(); roundRow.hidden = !v; whyRow.hidden = !v; })),
    roundRow, whyRow,
    only === 'weak' ? h('p', { class: 'small err' }, `苦手な語だけ（${all.filter(isWeak).length} 語）`) : null,
    only === 'todo' ? h('p', { class: 'small warn err' }, `まだクリアしていない語だけ（${all.filter(poolFilter.todo).length} 語）`) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn primary big', onClick: start }, 'スタート'), h('a', { class: 'btn ghost', href: '#/' }, '戻る')),
    h('p', { class: 'small muted' }, 'キーボード: 数字キーで回答、Space / Enter で次へ'));
  main.append(cfg);

  const buildQueue = () => makeQueue(spec, only, count, reviewPool);
  // 選択肢: 通常はステップの音すべて。音が 6 つ以上のときは正解＋紛らわしい 2 音の 3 択
  function choiceSounds(sound) {
    if (!spec.mix) return spec.sounds;
    const pool = spec.sounds.filter(s => s !== sound);
    const near = shuffle((DATA.neighbors?.[sound] || []).filter(s => pool.includes(s))).slice(0, 2);
    while (near.length < 2 && near.length < pool.length) { const o = shuffle(pool.filter(s => !near.includes(s)))[0]; if (!o) break; near.push(o); }
    return shuffle([sound, ...near]);
  }

  let queue = [], idx = 0, answered = 0, correct = 0, streak = 0, best = 0, t0 = 0, cur = null, locked = false, alive = true, timer = null, limitT = null, timeouts = 0;
  let conf = {}, per = {}, wrong = new Map(), curChoices = [];
  const snapWords = new Map(), snapConf = new Map();   // 中止したときに書き戻す

  const wordEl = h('div', { class: 'word' });
  const tbar = h('div', { class: 'tbar' }, h('div'));
  const fb = h('div', { class: 'fb' });
  const choices = h('div', { class: 'choices' });
  const bar = h('div', { class: 'progress' }, h('div'));
  const status = h('div', { class: 'row between small muted' });
  const nextBtn = h('button', { class: 'btn primary big', hidden: true, onClick: next }, '次へ');
  const stage = h('section', { class: 'card', hidden: true }, status, bar, wordEl, tbar, choices, fb,
    h('div', { class: 'center', style: 'margin-top:.5rem' }, nextBtn), h('div', { class: 'center', style: 'margin-top:.5rem' }, h('button', { class: 'btn ghost small err', onClick: abort }, '中止')));
  main.append(stage);

  function drawChoices(sounds) {
    curChoices = sounds;
    choices.className = 'choices' + (sounds.length === 2 ? ' two' : '');
    choices.replaceChildren(...sounds.map(s =>
      h('button', { class: 'btn choice', dataset: { s }, onClick: () => answer(s) }, h('b', {}, ipa(s)), h('span', { class: 'small' }, exMap[s] || ''))));
  }
  const onKey = e => {
    if (stage.hidden) return;
    const i = Number(e.key) - 1;
    if (i >= 0 && i < curChoices.length) { e.preventDefault(); answer(curChoices[i]); }
    else if ((e.code === 'Space' || e.key === 'Enter') && !nextBtn.hidden) { e.preventDefault(); next(); }
  };
  window.addEventListener('keydown', onKey);

  function start() {
    if (S.settings.cards) { cfg.hidden = true; cardsCleanup = renderCards(main, spec, only, count, () => { cfg.hidden = false; }); return; }
    queue = buildQueue(); if (!queue.length) return toast('出題できる語がありません');
    idx = answered = correct = streak = best = timeouts = 0; conf = {}; per = {}; wrong = new Map(); t0 = Date.now();
    cfg.hidden = true; stage.hidden = false; show();
  }
  let cardsCleanup = null;
  function show() {
    if (!alive) return;
    if (idx >= queue.length || (count && answered >= count)) return finish();
    clearTimeout(timer); timer = null; clearTimeout(limitT); limitT = null;
    cur = queue[idx]; locked = false;
    wordEl.replaceChildren(hlWord(cur)); wordEl.className = 'word';
    drawChoices(choiceSounds(cur.sound));
    const lim = S.settings.limit;
    tbar.hidden = !lim;
    if (lim) {
      const inner = tbar.firstChild; inner.style.transition = 'none'; inner.style.width = '100%';
      requestAnimationFrame(() => { inner.style.transition = `width ${lim}s linear`; inner.style.width = '0%'; });
      limitT = setTimeout(() => answer(null), lim * 1000);
    }
    fb.replaceChildren(); nextBtn.hidden = true;
    if (speakAt('q')) speak(cur.word);
    status.replaceChildren(h('span', {}, `${answered + 1}${count ? ' / ' + count : ''}`), h('span', {}, `正解 ${correct}　連続 ${streak}`));
    bar.firstChild.style.width = (count ? Math.min(100, answered / count * 100) : 0) + '%';
  }
  function answer(s) {
    if (locked || !cur) return; locked = true;
    clearTimeout(limitT); limitT = null;
    const inner = tbar.firstChild; inner.style.transition = 'none'; inner.style.width = getComputedStyle(inner).width;
    const timedOut = s == null;
    const ok = !timedOut && s === cur.sound; answered++;
    per[cur.sound] = per[cur.sound] || { n: 0, c: 0 }; per[cur.sound].n++;
    wordEl.textContent = cur.word;
    wordEl.classList.add(ok ? 'ok' : 'ng');
    choices.querySelectorAll('.choice').forEach(b => { b.disabled = true; if (b.dataset.s === cur.sound) b.classList.add('ok'); else if (b.dataset.s === s) b.classList.add('ng'); });
    const note = cur.note ? h('div', { class: 'small muted' }, '注: ' + cur.note) : null;
    if (ok) {
      correct++; streak++; best = Math.max(best, streak); per[cur.sound].c++;
      fb.replaceChildren(...[h('span', { class: 'ok' }, `✓ ${ipa(cur.sound)}`), note].filter(Boolean));
    } else {
      streak = 0;
      if (timedOut) timeouts++; else { const k = `${cur.sound}→${s}`; conf[k] = (conf[k] || 0) + 1; snap(snapConf, MY.conf, k); MY.conf[k] = (MY.conf[k] || 0) + 1; persistMine(); }
      wrong.set(wkey(cur), cur);
      fb.replaceChildren(...[
        h('div', {}, h('span', { class: 'err' }, timedOut ? `⏱ 時間切れ — ${ipa(cur.sound)}` : `✗ 正解は ${ipa(cur.sound)}`), timedOut ? null : h('span', { class: 'small muted' }, `（${ipa(s)} と答えた）`)),
        h('div', { class: 'mk-why' }, ...ruleLines(cur, timedOut ? null : s)), note].filter(Boolean));
      queue.splice(Math.min(queue.length, idx + RETRY_GAP[0] + Math.floor(Math.random() * (RETRY_GAP[1] - RETRY_GAP[0] + 1))), 0, cur);
    }
    recordWord(cur, ok, snapWords);
    if (speakAt('a')) speak(cur.word);
    idx++;
    if (ok) timer = setTimeout(show, 550);
    else { nextBtn.hidden = false; nextBtn.focus(); if (S.settings.autoNext) timer = setTimeout(show, 1500); }
  }
  function next() { clearTimeout(timer); show(); }
  // 中止: この回に付けた記録をすべて取り消して設定画面に戻る
  function abort() {
    if (answered && !confirm('中止すると、この回の記録は残りません。中止しますか？')) return;
    clearTimeout(timer); clearTimeout(limitT);
    rollback(snapWords, snapConf);
    stage.hidden = true; cfg.hidden = false;
    toast(answered ? '中止しました（記録は残していません）' : '中止しました');
    window.scrollTo(0, 0);
  }
  function finish() {
    if (!alive) return;
    clearTimeout(timer); clearTimeout(limitT);
    stage.hidden = true;
    const sec = Math.round((Date.now() - t0) / 1000);
    let justPassed = false;
    if (answered) {
      MY.log.push({ d: today(), ts: Date.now(), set: spec.id, n: answered, c: correct, conf, sec, to: timeouts, lim: S.settings.limit }); persistMine();
      if (spec.isStep) { const was = isPassed(spec.id); justPassed = recordRun(spec.id, answered, correct) && !was; }
      syncNow();
    }
    const wl = [...wrong.values()];
    main.append(h('section', { class: 'card' },
      h('h2', {}, answered ? `結果: ${correct} / ${answered}（${Math.round(correct / answered * 100)}%）` : '結果なし'),
      justPassed ? h('p', { class: 'ok' }, '✓ このステップに合格しました。次のステップへ進めます') : null,
      h('div', { class: 'small muted' }, `最長連続 ${best}　${Math.floor(sec / 60)}分${sec % 60}秒`, timeouts ? `　時間切れ ${timeouts}` : ''),
      h('div', { class: 'chips' }, ...spec.sounds.filter(s => per[s]).map(s => h('span', { class: 'chip' }, h('b', {}, ipa(s)), ` ${per[s].c}/${per[s].n}`))),
      Object.keys(conf).length ? h('div', { class: 'chips' }, ...Object.entries(conf).sort((a, b) => b[1] - a[1]).map(([k, v]) => { const [f, to] = k.split('→'); return h('span', { class: 'chip warn' }, `${ipa(f)} → ${ipa(to)} ×${v}`); })) : h('p', { class: 'ok' }, '混同なし'),
      wl.length ? h('div', {}, h('h3', {}, `間違えた語（${wl.length}）— タップで音声、声に出して確認`), h('div', { class: 'chips' }, ...wl.map(e => h('button', { class: 'chip sel', onClick: () => speak(e.word) }, h('b', {}, hlWord(e)), ` ${ipa(e.sound)}`)))) : null,
      h('div', { class: 'row', style: 'margin-top:.6rem' },
        h('button', { class: 'btn primary', onClick: () => { main.lastChild.remove(); cfg.hidden = false; } }, 'もう一回'),
        wl.length ? h('a', { class: 'btn', href: location.hash.split('?')[0] + '?weak=1' }, '苦手だけ') : null,
        spec.isStep ? h('a', { class: 'btn ghost', href: `#/w/${spec.id}` }, '単語帳') : null,
        h('a', { class: 'btn ghost', href: '#/' }, 'ホーム'))));
    window.scrollTo(0, 0);
  }
  return () => { alive = false; clearTimeout(timer); clearTimeout(limitT); window.removeEventListener('keydown', onKey); if (cardsCleanup) cardsCleanup(); try { speechSynthesis.cancel(); } catch { /* ignore */ } };
}
// ---------- ミックス（カード）モード — mikan 風 ----------
// 出題する語はフォニックス、選択肢は英語耳＋綴りの罠。1 ラウンドずつ進み、
// 間違えたカードはそのラウンドの終わりにもう一周する。
function renderCards(main, spec, only, count, onBack) {
  const size = S.settings.round || 10;
  let queue = makeQueue(spec, only, count);
  if (!queue.length) { toast('出題できる語がありません'); onBack(); return null; }

  let round = 0, redo = 0, cards = [], ci = 0, retry = [];
  let done = 0, correct = 0, streak = 0, best = 0, t0 = Date.now();
  let cur = null, locked = false, alive = true, timer = null, limitT = null, timeouts = 0;
  const conf = {}, per = {}, wrong = new Map();
  const snapWords = new Map(), snapConf = new Map();   // 中止したときに書き戻す
  let curChoices = [];

  const ring = h('div', { class: 'mk-ring' }, h('span', {}, '0%'));
  const rlabel = h('div', { class: 'mk-round' });
  const rsub = h('div', { class: 'small muted' });
  const streakEl = h('div', { class: 'mk-streak' });
  const tag = h('span', { class: 'mk-tag' });
  const wordEl = h('div', { class: 'word' });
  const card = h('div', { class: 'mk-card' }, tag, wordEl);
  const tbar = h('div', { class: 'tbar' }, h('div'));
  const choices = h('div', { class: 'mk-choices' });
  const why = h('div', { class: 'mk-why', hidden: true });
  const nextBtn = h('button', { class: 'btn primary big mk-next', hidden: true, onClick: () => show() }, '次へ');
  const stage = h('section', { class: 'card' },
    h('div', { class: 'mk-top' }, ring, h('div', { class: 'mk-meta' }, rlabel, rsub), streakEl),
    card, tbar, choices, why,
    h('div', { class: 'center', style: 'margin-top:.5rem' }, nextBtn),
    h('div', { class: 'center', style: 'margin-top:.5rem' }, h('button', { class: 'btn ghost small err', onClick: abort }, '中止')));
  main.append(stage);

  const onKey = e => {
    const i = Number(e.key) - 1;
    if (i >= 0 && i < curChoices.length && !locked) { e.preventDefault(); answer(curChoices[i]); }
    else if ((e.code === 'Space' || e.key === 'Enter') && !nextBtn.hidden) { e.preventDefault(); nextBtn.click(); }
  };
  window.addEventListener('keydown', onKey);

  function nextRound() {
    if (retry.length) { cards = shuffle(retry); retry = []; redo++; }
    else { if (!queue.length) return finish(); cards = queue.splice(0, size); round++; redo = 0; }
    ci = 0; show();
  }
  function show() {
    if (!alive) return;
    clearTimeout(timer); timer = null; clearTimeout(limitT); limitT = null;
    if (ci >= cards.length) return roundEnd();
    cur = cards[ci]; locked = false;
    tag.textContent = cur.g.replace('_e', '_e');
    wordEl.replaceChildren(hlWord(cur)); wordEl.className = 'word';
    card.className = 'mk-card';
    why.hidden = true; why.replaceChildren(); nextBtn.hidden = true;
    curChoices = mixChoices(cur, spec.sounds, 4);
    choices.replaceChildren(...curChoices.map(x =>
      h('button', { class: 'btn choice', dataset: { s: x }, onClick: () => answer(x) },
        h('b', {}, ipa(x)), h('span', { class: 'small' }, exampleFor(x)))));
    rlabel.textContent = redo ? `ラウンド ${round} やり直し ${redo}` : `ラウンド ${round}`;
    rsub.textContent = `${ci + 1} / ${cards.length}　残り ${queue.length + retry.length} 枚`;
    streakEl.textContent = streak ? `🔥 ${streak}` : '';
    const p = Math.round(ci / cards.length * 100);
    ring.style.setProperty('--p', p); ring.firstChild.textContent = p + '%';
    if (speakAt('q')) speak(cur.word);
    const lim = S.settings.limit;
    tbar.hidden = !lim;
    if (lim) {
      const inner = tbar.firstChild; inner.style.transition = 'none'; inner.style.width = '100%';
      requestAnimationFrame(() => { inner.style.transition = `width ${lim}s linear`; inner.style.width = '0%'; });
      limitT = setTimeout(() => answer(null), lim * 1000);
    }
  }
  function answer(x) {
    if (locked || !cur) return; locked = true;
    clearTimeout(limitT); limitT = null;
    const inner = tbar.firstChild; inner.style.transition = 'none'; inner.style.width = getComputedStyle(inner).width;
    const timedOut = x == null, ok = !timedOut && x === cur.sound;
    done++;
    per[cur.sound] = per[cur.sound] || { n: 0, c: 0 }; per[cur.sound].n++;
    wordEl.textContent = cur.word;
    card.classList.add(ok ? 'ok' : 'ng');
    choices.querySelectorAll('.choice').forEach(b => { b.disabled = true; if (b.dataset.s === cur.sound) b.classList.add('ok'); else if (b.dataset.s === x) b.classList.add('ng'); });
    if (ok) { correct++; streak++; best = Math.max(best, streak); per[cur.sound].c++; }
    else {
      streak = 0; retry.push(cur); wrong.set(wkey(cur), cur);
      if (timedOut) timeouts++;
      else { const k = `${cur.sound}→${x}`; conf[k] = (conf[k] || 0) + 1; snap(snapConf, MY.conf, k); MY.conf[k] = (MY.conf[k] || 0) + 1; persistMine(); }
      why.replaceChildren(...whyLines(cur, timedOut ? null : x));
      why.hidden = false;
    }
    recordWord(cur, ok, snapWords);
    if (speakAt('a')) speak(cur.word);
    ci++;
    if (ok) timer = setTimeout(show, 420);
    else { nextBtn.hidden = false; nextBtn.focus(); if (S.settings.autoNext) timer = setTimeout(show, 2200); }
  }
  // 間違えた理由を両軸で見せる: 綴りの罠 と 英語耳の罠
  function whyLines(w, chosen) {
    return [
      h('div', { class: 'small' }, h('b', {}, '正解 '), ipa(w.sound), chosen ? h('span', { class: 'muted' }, `　（${ipa(chosen)} と答えた）`) : h('span', { class: 'muted' }, '　（時間切れ）')),
      ...ruleLines(w, chosen),
      w.note ? h('div', { class: 'small muted' }, '注: ' + w.note) : null,
    ].filter(Boolean);
  }
  function roundEnd() {
    const n = cards.length, c = cards.filter(w => !retry.includes(w)).length;
    card.className = 'mk-card';
    tag.textContent = ''; tbar.hidden = true; why.hidden = true; nextBtn.hidden = true;
    wordEl.replaceChildren(h('div', { class: 'mk-done' }, retry.length ? '💪' : '🎉'));
    ring.style.setProperty('--p', 100); ring.firstChild.textContent = '100%';
    rlabel.textContent = `ラウンド ${round}${redo ? ` やり直し ${redo}` : ''} 完了`;
    rsub.textContent = `${c} / ${n} 正解`;
    choices.replaceChildren(
      h('button', { class: 'btn primary big', onClick: nextRound },
        retry.length ? `間違えた ${retry.length} 枚をもう一周` : (queue.length ? '次のラウンド' : '結果を見る')),
      h('button', { class: 'btn ghost err', onClick: abort }, '中止'));
    curChoices = [];
  }
  // 中止: この回に付けた記録をすべて取り消して設定画面に戻る
  function abort() {
    if (done && !confirm('中止すると、この回の記録は残りません。中止しますか？')) return;
    alive = false; clearTimeout(timer); clearTimeout(limitT);
    window.removeEventListener('keydown', onKey);
    rollback(snapWords, snapConf);
    stage.remove(); onBack();
    toast(done ? '中止しました（記録は残していません）' : '中止しました');
    window.scrollTo(0, 0);
  }
  function finish() {
    if (!alive) return;
    alive = false; clearTimeout(timer); clearTimeout(limitT);
    window.removeEventListener('keydown', onKey);
    stage.remove();
    const sec = Math.round((Date.now() - t0) / 1000);
    let justPassed = false;
    if (done) {
      MY.log.push({ d: today(), ts: Date.now(), set: spec.id, n: done, c: correct, conf, sec, to: timeouts, lim: S.settings.limit, mode: 'cards' }); persistMine();
      if (spec.isStep) { const was = isPassed(spec.id); justPassed = recordRun(spec.id, done, correct) && !was; }
      syncNow();
    }
    const wl = [...wrong.values()];
    main.append(h('section', { class: 'card' },
      h('h2', {}, done ? `結果: ${correct} / ${done}（${Math.round(correct / done * 100)}%）` : '結果なし'),
      justPassed ? h('p', { class: 'ok' }, '✓ このステップに合格しました') : null,
      h('div', { class: 'small muted' }, `最長連続 ${best}　${Math.floor(sec / 60)}分${sec % 60}秒`, timeouts ? `　時間切れ ${timeouts}` : ''),
      h('div', { class: 'chips' }, ...Object.keys(per).map(x => h('span', { class: 'chip' }, h('b', {}, ipa(x)), ` ${per[x].c}/${per[x].n}`))),
      Object.keys(conf).length ? h('div', { class: 'chips' }, ...Object.entries(conf).sort((a, b) => b[1] - a[1]).map(([k, v]) => { const [f, to] = k.split('→'); return h('span', { class: 'chip warn' }, `${ipa(f)} → ${ipa(to)} ×${v}`); })) : h('p', { class: 'ok' }, '混同なし'),
      wl.length ? h('div', {}, h('h3', {}, `間違えたカード（${wl.length}）`), h('div', { class: 'chips' }, ...wl.map(e => h('button', { class: 'chip sel', onClick: () => speak(e.word) }, h('b', {}, hlWord(e)), ` ${ipa(e.sound)}`)))) : null,
      h('div', { class: 'row', style: 'margin-top:.6rem' },
        h('button', { class: 'btn primary', onClick: () => { main.lastChild.remove(); onBack(); } }, 'もう一回'),
        h('a', { class: 'btn ghost', href: '#/' }, 'ホーム'))));
    window.scrollTo(0, 0);
  }
  const exampleFor = snd => ((DATA.words.find(w => w.sound === snd && !w.note && w.word.length <= 5)
    || DATA.words.find(w => w.sound === snd)) || {}).word || '';
  nextRound();
  return () => { alive = false; clearTimeout(timer); clearTimeout(limitT); window.removeEventListener('keydown', onKey); };
}

function seg(options, value, onChange) {
  const el = h('div', { class: 'seg' });
  for (const [v, label] of options) el.append(h('button', { class: v === value ? 'on' : '', onClick: () => { [...el.children].forEach((b, i) => b.classList.toggle('on', options[i][0] === v)); onChange(v); } }, String(label)));
  return el;
}

// ---------- ルーティング ----------
let cleanup = null;
function route() {
  const main = $('#main');
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  main.replaceChildren(); window.scrollTo(0, 0);
  const book = location.hash.match(/^#\/w\/([^?]+)/);
  if (book) return renderBook(main, book[1]);
  const m = location.hash.match(/^#\/(d|s|r)(?:\/([^?]+))?(?:\?(weak|todo)=1)?/);
  if (m) {
    const spec = m[1] === 's' ? specForStep(m[2]) : m[1] === 'r' ? specForReview() : specForSet(m[2]);
    cleanup = renderDrill(main, spec, m[3] || '');
  } else renderHome(main);
}
async function boot() {
  const online = $('#online'); const upd = () => { online.textContent = 'オフライン'; online.hidden = navigator.onLine; }; upd();
  addEventListener('online', upd); addEventListener('offline', upd);
  try { const r = await fetch('data/drill-words.json', { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); DATA = await r.json(); }
  catch { $('#main').replaceChildren(h('div', { class: 'card' }, h('h2', {}, '単語データを読み込めません'), h('p', { class: 'small muted' }, '初回はオンラインで開いてください。'))); return; }
  loadStore();
  addEventListener('hashchange', route); route();
  syncNow();
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
