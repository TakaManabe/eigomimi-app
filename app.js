// 母音ドリル — 単語を見て母音を即答する。データは localStorage、音声は端末の音声合成（任意）。
const COUNTS = [20, 50, 100, 0];   // 0 = 無制限
const RETRY_GAP = [4, 7];          // 誤答語を再出題するまでの間隔（問）
const LS = 'vd:';
const LIMITS = [0, 2, 3, 5];         // 回答の制限秒（0 = なし）

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
};
const persistWords = () => save('words', S.words);
const persistLog = () => { if (S.log.length > 1000) S.log = S.log.slice(-1000); save('log', S.log); };
const persistSettings = () => save('settings', S.settings);

// ---------- データ ----------
let DATA = null;
const wordsFor = set => DATA.words.filter(w => set.sounds.includes(w.sound));
const setById = id => DATA.sets.find(s => s.id === id);
const isWeak = w => { const d = S.words[w.word]; return d && d.w > 0 && d.w >= d.c; };

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
  for (const set of DATA.sets) {
    const ws = wordsFor(set);
    const sl = S.log.filter(l => l.set === set.id);
    const tot = sl.reduce((a, l) => a + l.n, 0), cor = sl.reduce((a, l) => a + l.c, 0);
    const seen = ws.filter(w => S.words[w.word]?.s).length;
    const weak = ws.filter(isWeak).length;
    main.append(h('section', { class: 'card' },
      h('div', { class: 'row between' }, h('h2', {}, set.title), h('span', { class: 'small muted' }, `${ws.length} 語`)),
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
      persistWords(); persistLog(); toast('復元しました（既存データに追加）', 'ok'); route();
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
        const blob = new Blob([JSON.stringify({ app: 'vowel-drill', schema: 1, exportedAt: new Date().toISOString(), words: S.words, log: S.log }, null, 1)], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `vowel-drill-${today()}.json` }); document.body.append(a); a.click(); a.remove();
      } }, 'バックアップ書き出し'),
      h('button', { class: 'btn small', onClick: () => file.click() }, '復元'), file,
      h('button', { class: 'btn small ghost err', onClick: () => { if (confirm('学習記録をすべて削除しますか？')) { S.words = {}; S.log = []; persistWords(); persistLog(); route(); } } }, '記録を消去')),
    h('p', { class: 'small muted' }, `単語 ${DATA.words.length} 語 ／ 記録は端末内のみ（サーバー送信なし）。自動の発音判定は行いません。`)));
}
const stat = (l, v, u) => h('div', {}, h('div', { class: 'val' }, String(v)), h('div', { class: 'small muted' }, l + (u ? `（${u}）` : '')));

// ---------- ドリル ----------
function renderDrill(main, setId, weakOnly) {
  const set = setById(setId);
  if (!set) { main.append(h('p', {}, 'セットが見つかりません'), h('a', { class: 'btn', href: '#/' }, 'ホーム')); return () => {}; }
  const all = wordsFor(set);
  let count = S.settings.count;

  // 設定
  const cfg = h('section', { class: 'card' },
    h('h2', {}, set.title), h('p', { class: 'small muted' }, set.hint || ''),
    h('p', { class: 'small' }, set.sounds.map(s => `${ipa(s)} ${all.filter(w => w.sound === s).length}語`).join('　')),
    h('div', { class: 'field' }, h('span', { class: 'small' }, '出題数'), seg(COUNTS.map(c => [c, c || '無制限']), count, v => { count = v; S.settings.count = v; persistSettings(); })),
    h('div', { class: 'field' }, h('span', { class: 'small' }, '回答の制限時間'), seg(LIMITS.map(l => [l, l ? `${l}秒` : 'なし']), S.settings.limit, v => { S.settings.limit = v; persistSettings(); })),
    h('div', { class: 'field' }, h('span', { class: 'small' }, '不正解のあと'), seg([[true, '1.5秒で自動的に次へ'], [false, '「次へ」を押す']], S.settings.autoNext, v => { S.settings.autoNext = v; persistSettings(); })),
    weakOnly ? h('p', { class: 'small err' }, `苦手な語だけ（${all.filter(isWeak).length} 語）`) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn primary big', onClick: start }, 'スタート'), h('a', { class: 'btn ghost', href: '#/' }, '戻る')),
    h('p', { class: 'small muted' }, 'キーボード: 1〜3 で回答、Space / Enter で次へ'));
  main.append(cfg);

  // 出題順: 未出題・誤答が多い語を重み付きで優先、各音から均等に
  function buildQueue() {
    let pool = weakOnly ? all.filter(isWeak) : all;
    if (!pool.length) pool = all;
    const n = count || pool.length, per = Math.ceil(n / set.sounds.length), picked = [];
    for (const s of set.sounds) {
      const cand = pool.filter(w => w.sound === s).map(w => {
        const d = S.words[w.word]; let wt = 1;
        if (!d || !d.s) wt += 1.5; else { wt += 3 * d.w / d.s; if (d.lw === today()) wt += 1; if (d.s >= 3 && d.w === 0) wt *= 0.4; }
        return { w, key: Math.pow(Math.random(), 1 / wt) };
      }).sort((a, b) => b.key - a.key).slice(0, per).map(x => x.w);
      picked.push(...cand);
    }
    return shuffle(picked).slice(0, n);
  }

  // セッション状態
  let queue = [], idx = 0, answered = 0, correct = 0, streak = 0, best = 0, t0 = 0, cur = null, locked = false, alive = true, timer = null, limitT = null, timeouts = 0;
  let conf = {}, per = {}, wrong = new Map();

  const wordEl = h('div', { class: 'word' });
  const tbar = h('div', { class: 'tbar' }, h('div'));
  const fb = h('div', { class: 'fb' });
  const choices = h('div', { class: 'choices' + (set.sounds.length === 2 ? ' two' : '') });
  const bar = h('div', { class: 'progress' }, h('div'));
  const status = h('div', { class: 'row between small muted' });
  const nextBtn = h('button', { class: 'btn primary big', hidden: true, onClick: next }, '次へ');
  const stage = h('section', { class: 'card', hidden: true }, status, bar, wordEl, tbar, choices, fb,
    h('div', { class: 'center', style: 'margin-top:.5rem' }, nextBtn), h('div', { class: 'center', style: 'margin-top:.5rem' }, h('button', { class: 'btn ghost small', onClick: finish }, 'ここで終了')));
  main.append(stage);
  for (const s of set.sounds) {
    const ex = set.examples?.[s] || all.filter(w => w.sound === s && !w.note).slice(0, 2).map(w => w.word).join(' / ');
    choices.append(h('button', { class: 'btn choice', dataset: { s }, onClick: () => answer(s) }, h('b', {}, ipa(s)), h('span', { class: 'small' }, ex)));
  }
  const onKey = e => {
    if (stage.hidden) return;
    const i = Number(e.key) - 1;
    if (i >= 0 && i < set.sounds.length) { e.preventDefault(); answer(set.sounds[i]); }
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
    wordEl.textContent = cur.word; wordEl.className = 'word';
    const lim = S.settings.limit;
    tbar.hidden = !lim;
    if (lim) {
      const inner = tbar.firstChild; inner.style.transition = 'none'; inner.style.width = '100%';
      requestAnimationFrame(() => { inner.style.transition = `width ${lim}s linear`; inner.style.width = '0%'; });
      limitT = setTimeout(() => answer(null), lim * 1000);
    }
    fb.replaceChildren(); nextBtn.hidden = true;
    choices.querySelectorAll('.choice').forEach(b => { b.classList.remove('ok', 'ng'); b.disabled = false; });
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
    wordEl.replaceChildren(hlWord(cur));
    choices.querySelectorAll('.choice').forEach(b => { b.disabled = true; if (b.dataset.s === cur.sound) b.classList.add('ok'); else if (b.dataset.s === s) b.classList.add('ng'); });
    const note = cur.note ? h('div', { class: 'small muted' }, '注: ' + cur.note) : null;
    if (ok) {
      correct++; streak++; best = Math.max(best, streak); per[cur.sound].c++;
      wordEl.classList.add('ok');
      fb.replaceChildren(...[h('span', { class: 'ok' }, `✓ ${ipa(cur.sound)}`), note].filter(Boolean));
    } else {
      streak = 0;
      if (timedOut) timeouts++; else { const k = `${cur.sound}→${s}`; conf[k] = (conf[k] || 0) + 1; }
      wrong.set(cur.word, cur);
      fb.replaceChildren(...[h('span', { class: 'err' }, timedOut ? `⏱ 時間切れ — ${ipa(cur.sound)}` : `✗ 正解は ${ipa(cur.sound)}`), timedOut ? null : h('span', { class: 'small muted' }, `（${ipa(s)} と答えた）`), note].filter(Boolean));
      queue.splice(Math.min(queue.length, idx + RETRY_GAP[0] + Math.floor(Math.random() * (RETRY_GAP[1] - RETRY_GAP[0] + 1))), 0, cur);
    }
    const d = S.words[cur.word] || { s: 0, c: 0, w: 0, lw: null };
    d.s++; if (ok) d.c++; else { d.w++; d.lw = today(); }
    S.words[cur.word] = d; persistWords();
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
    if (answered) { S.log.push({ d: today(), ts: Date.now(), set: set.id, n: answered, c: correct, conf, sec, to: timeouts, lim: S.settings.limit }); persistLog(); }
    const wl = [...wrong.values()];
    main.append(h('section', { class: 'card' },
      h('h2', {}, answered ? `結果: ${correct} / ${answered}（${Math.round(correct / answered * 100)}%）` : '結果なし'),
      h('div', { class: 'small muted' }, `最長連続 ${best}　${Math.floor(sec / 60)}分${sec % 60}秒`, timeouts ? `　時間切れ ${timeouts}` : ''),
      h('div', { class: 'chips' }, ...set.sounds.map(s => h('span', { class: 'chip' }, h('b', {}, ipa(s)), ` ${per[s] ? `${per[s].c}/${per[s].n}` : '—'}`))),
      Object.keys(conf).length ? h('div', { class: 'chips' }, ...Object.entries(conf).sort((a, b) => b[1] - a[1]).map(([k, v]) => { const [f, to] = k.split('→'); return h('span', { class: 'chip warn' }, `${ipa(f)} → ${ipa(to)} ×${v}`); })) : h('p', { class: 'ok' }, '混同なし'),
      wl.length ? h('div', {}, h('h3', {}, `間違えた語（${wl.length}）— タップで音声、声に出して確認`), h('div', { class: 'chips' }, ...wl.map(e => h('button', { class: 'chip sel', onClick: () => speak(e.word) }, h('b', {}, hlWord(e)), ` ${ipa(e.sound)}`)))) : null,
      h('div', { class: 'row', style: 'margin-top:.6rem' },
        h('button', { class: 'btn primary', onClick: () => { main.lastChild.remove(); cfg.hidden = false; } }, 'もう一回'),
        wl.length ? h('a', { class: 'btn', href: `#/d/${set.id}?weak=1` }, '苦手だけ') : null,
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
  const m = location.hash.match(/^#\/d\/([^?]+)(\?weak=1)?/);
  if (m) cleanup = renderDrill(main, m[1], !!m[2]);
  else renderHome(main);
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
