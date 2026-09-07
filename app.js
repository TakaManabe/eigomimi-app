// 母音ドリル — 単語を見て母音を即答する。データは localStorage、音声は端末の音声合成（任意）。
const COUNTS = [20, 50, 100, 0];   // 0 = 無制限
const RETRY_GAP = [4, 7];          // 誤答語を再出題するまでの間隔（問）
const LS = 'vd:';
const LIMITS = [0, 2, 3, 5];         // 回答の制限秒（0 = なし）
const INTERVALS = [1, 3, 7, 14, 30];  // 誤答語を復習する間隔（日）
const PASS_RATE = 0.9, PASS_RUNS = 2, PASS_MIN = 20;  // 合格: 20問以上を正答率90%で2回連続
const MIX_RATE = 0.3;                // 合格後、既習語を混ぜる割合（累積復習）
const STAGES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const wkey = w => w.k || w.word;   // 記録キー。同じ語でも赤字の位置が違えば別扱い

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
const S = {
  words: load('words', {}),          // word -> {s: 出題, c: 正解, w: 誤答, lw: 最終誤答日}
  log: load('log', []),              // {d, set, n, c, conf, sec}
  settings: Object.assign({ count: 50, audio: true, voice: '', autoNext: true, limit: 3 }, load('settings', {})),
  prog: load('prog', {}),            // stepId -> {runs: [{n, c, ts}], passed: ts}
};
const persistWords = () => save('words', S.words);
const persistLog = () => { if (S.log.length > 1000) S.log = S.log.slice(-1000); save('log', S.log); };
const persistSettings = () => save('settings', S.settings);
const persistProg = () => save('prog', S.prog);

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

// 合格判定: 直近 PASS_RUNS 回が いずれも PASS_MIN 問以上・正答率 PASS_RATE 以上
function recordRun(id, n, c) {
  const p = S.prog[id] || (S.prog[id] = { runs: [] });
  p.runs.push({ n, c, ts: Date.now() });
  if (p.runs.length > 20) p.runs = p.runs.slice(-20);
  const last = p.runs.slice(-PASS_RUNS);
  if (!p.passed && last.length === PASS_RUNS && last.every(r => r.n >= PASS_MIN && r.c / r.n >= PASS_RATE)) p.passed = Date.now();
  persistProg();
  return !!p.passed;
}

// ---------- 音声（合成音声のみ。発音判定はしない）----------
function speak(text) {
  if (!S.settings.audio || !('speechSynthesis' in window)) return;
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
    return h('div', { class: 'field' },
      h('span', { class: 'small' + (p ? ' ok' : '') }, p ? '✓ ' : (isNext ? '▶ ' : '　'), t.title,
        h('span', { class: 'small muted' }, `　${t.n}語`, rate == null ? '' : `　直近 ${rate}%`),
        t.hint ? h('div', { class: 'small muted' }, t.hint) : null),
      h('a', { class: 'btn small' + (isNext ? ' primary' : ''), href: `#/s/${t.id}` }, p ? '復習' : '始める'));
  };
  for (const stg of DATA.course.filter(c => !c.extra)) {
    main.append(h('section', { class: 'card' },
      h('h3', {}, stg.title), h('p', { class: 'small muted' }, stg.hint || ''), ...stg.steps.map(stepRow)));
  }
  for (const stg of DATA.course.filter(c => c.extra)) {
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
      if (obj.app !== 'vowel-drill' || typeof obj.words !== 'object' || !Array.isArray(obj.log)) throw new Error('形式が違います');
      for (const [w, d] of Object.entries(obj.words)) { const cur = S.words[w] || { s: 0, c: 0, w: 0, lw: null }; S.words[w] = { s: cur.s + (d.s | 0), c: cur.c + (d.c | 0), w: cur.w + (d.w | 0), lw: [cur.lw, d.lw].filter(Boolean).sort().pop() || null }; }
      S.log = [...S.log, ...obj.log.filter(l => l && l.d && l.set)].sort((a, b) => (a.ts || 0) - (b.ts || 0));
      if (obj.prog && typeof obj.prog === 'object') for (const [k, v] of Object.entries(obj.prog)) if (!S.prog[k] || (v.passed && !S.prog[k].passed)) S.prog[k] = v;
      persistWords(); persistLog(); persistProg(); toast('復元しました（既存データに追加）', 'ok'); route();
    } catch (err) { toast('復元できません: ' + err.message, 'err'); }
    e.target.value = '';
  } });
  main.append(h('section', { class: 'card' },
    h('h3', {}, '混同しやすい綴り→音（正しい音 → 選んだ音）'),
    confTop.length ? h('div', { class: 'chips' }, ...confTop.map(([k, v]) => { const [f, to] = k.split('→'); return h('span', { class: 'chip warn' }, `${ipa(f)} → ${ipa(to)} ×${v}`); })) : h('p', { class: 'small muted' }, 'まだ記録がありません'),
    h('div', { class: 'row', style: 'margin-top:.6rem' },
      h('button', { class: 'btn small' + (S.settings.audio ? ' primary' : ''), onClick: e => { S.settings.audio = !S.settings.audio; persistSettings(); e.target.classList.toggle('primary', S.settings.audio); e.target.textContent = S.settings.audio ? '回答後に音声: あり' : '回答後に音声: なし'; } }, S.settings.audio ? '回答後に音声: あり' : '回答後に音声: なし'),
      voiceSel),
    h('div', { class: 'row', style: 'margin-top:.6rem' },
      h('button', { class: 'btn small', onClick: () => {
        const blob = new Blob([JSON.stringify({ app: 'vowel-drill', schema: 1, exportedAt: new Date().toISOString(), words: S.words, log: S.log, prog: S.prog }, null, 1)], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `vowel-drill-${today()}.json` }); document.body.append(a); a.click(); a.remove();
      } }, 'バックアップ書き出し'),
      h('button', { class: 'btn small', onClick: () => file.click() }, '復元'), file,
      h('button', { class: 'btn small ghost err', onClick: () => { if (confirm('学習記録をすべて削除しますか？')) { S.words = {}; S.log = []; S.prog = {}; persistWords(); persistLog(); persistProg(); route(); } } }, '記録を消去')),
    h('p', { class: 'small muted' }, `単語 ${DATA.words.length} 語 ／ 記録は端末内のみ（サーバー送信なし）。自動の発音判定は行いません。`)));
}
const stat = (l, v, u) => h('div', {}, h('div', { class: 'val' }, String(v)), h('div', { class: 'small muted' }, l + (u ? `（${u}）` : '')));

// ---------- ドリルの対象 ----------
function specForStep(id) {
  const st = stepById(id); if (!st) return null;
  const stage = DATA.course.find(c => c.steps.some(t => t.id === id));
  return { id, title: `${stage.title.replace(/^\d+\.\s*/, '')} — ${st.title}`, hint: st.hint,
           words: selectWords(st.sel), sounds: st.sounds, mix: !!st.mix, isStep: true };
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
function renderDrill(main, spec, weakOnly) {
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

  const cfg = h('section', { class: 'card' },
    h('h2', {}, spec.title), h('p', { class: 'small muted' }, spec.hint || ''),
    h('p', { class: 'small' }, spec.mix
      ? `${all.length} 語 ・ ${spec.sounds.length} 音（毎問 3 択を作ります）`
      : spec.sounds.map(s => `${ipa(s)} ${all.filter(w => w.sound === s).length}語`).join('　')),
    passed ? h('p', { class: 'small ok' }, `合格済み。既習語を ${Math.round(MIX_RATE * 100)}% 混ぜて出題します`) : null,
    spec.isStep && !passed ? h('p', { class: 'small muted' }, `合格まで: ${PASS_MIN}問以上を正答率${Math.round(PASS_RATE * 100)}%で${PASS_RUNS}回連続`) : null,
    h('div', { class: 'field' }, h('span', { class: 'small' }, '出題数'), seg(COUNTS.map(c => [c, c || '無制限']), count, v => { count = v; S.settings.count = v; persistSettings(); })),
    h('div', { class: 'field' }, h('span', { class: 'small' }, '回答の制限時間'), seg(LIMITS.map(l => [l, l ? `${l}秒` : 'なし']), S.settings.limit, v => { S.settings.limit = v; persistSettings(); })),
    h('div', { class: 'field' }, h('span', { class: 'small' }, '不正解のあと'), seg([[true, '1.5秒で自動的に次へ'], [false, '「次へ」を押す']], S.settings.autoNext, v => { S.settings.autoNext = v; persistSettings(); })),
    weakOnly ? h('p', { class: 'small err' }, `苦手な語だけ（${all.filter(isWeak).length} 語）`) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn primary big', onClick: start }, 'スタート'), h('a', { class: 'btn ghost', href: '#/' }, '戻る')),
    h('p', { class: 'small muted' }, 'キーボード: 数字キーで回答、Space / Enter で次へ'));
  main.append(cfg);

  // 出題順: 未出題・誤答が多い語を重み付きで優先。音ごとに均等に取る
  function pick(pool, n, sounds) {
    if (n <= 0 || !pool.length) return [];
    const groups = sounds ? sounds.map(s => pool.filter(w => w.sound === s)) : [pool];
    const per = Math.ceil(n / groups.length), out = [];
    for (const g of groups) {
      out.push(...g.map(w => {
        const d = S.words[wkey(w)]; let wt = 1;
        if (!d || !d.s) wt += 1.5; else { wt += 3 * d.w / d.s; if (d.lw === today()) wt += 1; if (d.due && d.due <= today()) wt += 2; if (d.s >= 3 && d.w === 0) wt *= 0.4; }
        return { w, key: Math.pow(Math.random(), 1 / wt) };
      }).sort((a, b) => b.key - a.key).slice(0, per).map(x => x.w));
    }
    return out;
  }
  function buildQueue() {
    let pool = weakOnly ? all.filter(isWeak) : all;
    if (!pool.length) pool = all;
    const n = count || pool.length;
    const k = reviewPool.length ? Math.round(n * MIX_RATE) : 0;
    return shuffle([...pick(pool, n - k, spec.sounds), ...pick(reviewPool, k, null)]).slice(0, n);
  }
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

  const wordEl = h('div', { class: 'word' });
  const tbar = h('div', { class: 'tbar' }, h('div'));
  const fb = h('div', { class: 'fb' });
  const choices = h('div', { class: 'choices' });
  const bar = h('div', { class: 'progress' }, h('div'));
  const status = h('div', { class: 'row between small muted' });
  const nextBtn = h('button', { class: 'btn primary big', hidden: true, onClick: next }, '次へ');
  const stage = h('section', { class: 'card', hidden: true }, status, bar, wordEl, tbar, choices, fb,
    h('div', { class: 'center', style: 'margin-top:.5rem' }, nextBtn), h('div', { class: 'center', style: 'margin-top:.5rem' }, h('button', { class: 'btn ghost small', onClick: finish }, 'ここで終了')));
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
    queue = buildQueue(); if (!queue.length) return toast('出題できる語がありません');
    idx = answered = correct = streak = best = timeouts = 0; conf = {}; per = {}; wrong = new Map(); t0 = Date.now();
    cfg.hidden = true; stage.hidden = false; show();
  }
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
      if (timedOut) timeouts++; else { const k = `${cur.sound}→${s}`; conf[k] = (conf[k] || 0) + 1; }
      wrong.set(wkey(cur), cur);
      fb.replaceChildren(...[h('span', { class: 'err' }, timedOut ? `⏱ 時間切れ — ${ipa(cur.sound)}` : `✗ 正解は ${ipa(cur.sound)}`), timedOut ? null : h('span', { class: 'small muted' }, `（${ipa(s)} と答えた）`), note].filter(Boolean));
      queue.splice(Math.min(queue.length, idx + RETRY_GAP[0] + Math.floor(Math.random() * (RETRY_GAP[1] - RETRY_GAP[0] + 1))), 0, cur);
    }
    // 復習キュー: 間違えた語は翌日から 1→3→7→14→30 日
    const d = S.words[wkey(cur)] || { s: 0, c: 0, w: 0, lw: null };
    d.s++;
    if (ok) { d.c++; if (d.due) { d.iv = Math.min((d.iv ?? 0) + 1, INTERVALS.length - 1); d.due = addDays(today(), INTERVALS[d.iv]); } }
    else { d.w++; d.lw = today(); d.iv = 0; d.due = addDays(today(), INTERVALS[0]); }
    S.words[wkey(cur)] = d; persistWords();
    speak(cur.word);
    idx++;
    if (ok) timer = setTimeout(show, 550);
    else { nextBtn.hidden = false; nextBtn.focus(); if (S.settings.autoNext) timer = setTimeout(show, 1500); }
  }
  function next() { clearTimeout(timer); show(); }
  function finish() {
    if (!alive) return;
    clearTimeout(timer); clearTimeout(limitT);
    stage.hidden = true;
    const sec = Math.round((Date.now() - t0) / 1000);
    let justPassed = false;
    if (answered) {
      S.log.push({ d: today(), ts: Date.now(), set: spec.id, n: answered, c: correct, conf, sec, to: timeouts, lim: S.settings.limit }); persistLog();
      if (spec.isStep) { const was = isPassed(spec.id); justPassed = recordRun(spec.id, answered, correct) && !was; }
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
        h('a', { class: 'btn ghost', href: '#/' }, 'ホーム'))));
    window.scrollTo(0, 0);
  }
  return () => { alive = false; clearTimeout(timer); clearTimeout(limitT); window.removeEventListener('keydown', onKey); try { speechSynthesis.cancel(); } catch { /* ignore */ } };
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
  const m = location.hash.match(/^#\/(d|s|r)(?:\/([^?]+))?(\?weak=1)?/);
  if (m) {
    const spec = m[1] === 's' ? specForStep(m[2]) : m[1] === 'r' ? specForReview() : specForSet(m[2]);
    cleanup = renderDrill(main, spec, !!m[3]);
  } else renderHome(main);
}
async function boot() {
  const online = $('#online'); const upd = () => { online.textContent = 'オフライン'; online.hidden = navigator.onLine; }; upd();
  addEventListener('online', upd); addEventListener('offline', upd);
  try { const r = await fetch('data/drill-words.json', { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); DATA = await r.json(); }
  catch { $('#main').replaceChildren(h('div', { class: 'card' }, h('h2', {}, '単語データを読み込めません'), h('p', { class: 'small muted' }, '初回はオンラインで開いてください。'))); return; }
  addEventListener('hashchange', route); route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
