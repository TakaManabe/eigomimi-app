// 大量ドリル: 単語を見て母音を即答する。弱点・未出題を優先して出題し、単語ごとの正誤を記録する。
import { h, clear, toast, ipa, shuffle } from './util.js';
import { Player, playWord, ttsSupported } from './audio.js';
import * as db from './db.js';
import * as store from './store.js';
import { todayStr } from './srs.js';
import { state, drillSets, drillSet, drillWordsFor, itemById, navigate } from './app.js';

const COUNTS = [20, 50, 100, 0]; // 0 = 無制限
const RETRY_GAP = [4, 7];         // 誤答語を再出題するまでの間隔（問）

export async function renderDrill(main, [setId]) {
  if (!setId) return renderMenu(main);
  const set = drillSet(setId.split('?')[0]);
  if (!set) { main.append(h('p', {}, 'ドリルが見つかりません')); return; }
  return runDrill(main, set);
}

// ---------- セット選択 ----------
async function renderMenu(main) {
  const sets = drillSets();
  const [logs, dw] = await Promise.all([db.getAll('drillLog'), db.getAll('drillWords')]);
  const today = todayStr();
  const todayLogs = logs.filter(l => l.date === today);
  const todayN = todayLogs.reduce((s, l) => s + l.total, 0), todayC = todayLogs.reduce((s, l) => s + l.correct, 0);
  main.append(h('h2', {}, '大量ドリル'),
    h('p', { class: 'small muted' }, '単語を見て、どの母音かを即答します。速さより「迷わず正しく」を目指し、間違えた語は同じ回の後半と次回以降に優先して出ます。答えを見たら必ず声に出しましょう。'),
    h('section', { class: 'card stats3' },
      stat('今日の判定', todayN, '語'), stat('今日の正答率', todayN ? Math.round(todayC / todayN * 100) + '%' : '—', ''), stat('累計判定', logs.reduce((s, l) => s + l.total, 0), '語')));
  for (const set of sets) {
    const words = drillWordsFor(set);
    const sl = logs.filter(l => l.setId === set.id);
    const total = sl.reduce((s, l) => s + l.total, 0), correct = sl.reduce((s, l) => s + l.correct, 0);
    const seenWords = words.filter(w => dw.some(d => d.word === w.word && d.seen > 0)).length;
    const weak = words.filter(w => { const d = dw.find(d => d.word === w.word); return d && d.wrong > 0 && d.wrong >= d.correct; }).length;
    const item = itemById(set.itemId);
    main.append(h('section', { class: 'card' },
      h('div', { class: 'row between' }, h('h3', {}, set.title), h('span', { class: 'small muted' }, item ? `課程 ${item.order}` : '')),
      h('div', { class: 'small muted' }, `${words.length} 語 ／ ${set.hint || ''}`),
      h('div', { class: 'small' }, total ? `正答率 ${Math.round(correct / total * 100)}%（${correct}/${total}）` : '未実施', `　既出 ${seenWords}/${words.length} 語`, weak ? `　苦手 ${weak} 語` : ''),
      h('div', { class: 'row gap wrap' },
        h('a', { class: 'btn primary small', href: `#/drill/${set.id}` }, '始める'),
        weak ? h('a', { class: 'btn small', href: `#/drill/${set.id}?weak=1` }, '苦手だけ') : null)));
  }
}
function stat(label, value, unit) {
  return h('div', { class: 'stat' }, h('div', { class: 'val' }, String(value)), h('div', { class: 'small muted' }, `${label}${unit ? `（${unit}）` : ''}`));
}

// ---------- ドリル本体 ----------
async function runDrill(main, set) {
  const weakOnly = /weak=1/.test(location.hash);
  const player = new Player();
  const allWords = drillWordsFor(set);
  const hist = Object.fromEntries((await db.getAll('drillWords')).map(d => [d.word, d]));
  const settings = state.settings;
  let count = settings.drillCount ?? 50;
  let mode = settings.drillMode || 'fast';        // fast: 正解で自動的に次へ / say: 発音して「言えた」で次へ
  let audio = settings.drillAudio ?? true;         // 正解後に単語音声を鳴らす

  // ---- 設定画面 ----
  const cfg = h('section', { class: 'card' },
    h('h2', {}, set.title), h('p', { class: 'small muted' }, set.hint || ''),
    h('p', { class: 'small' }, `${allWords.length} 語（${set.sounds.map(s => `${ipa(s)} ${allWords.filter(w => w.sound === s).length}`).join('、')}）`),
    field('出題数', seg(COUNTS.map(c => [c, c === 0 ? '無制限' : String(c)]), count, v => { count = v; store.saveSetting('drillCount', v); })),
    field('進み方', seg([['fast', '正解→自動で次へ'], ['say', '発音して「言えた」で次へ（反復に加算）']], mode, v => { mode = v; store.saveSetting('drillMode', v); })),
    field('正解後に音声', seg([[true, 'あり'], [false, 'なし']], audio, v => { audio = v; store.saveSetting('drillAudio', v); })),
    weakOnly ? h('p', { class: 'small warn-text' }, '苦手な語だけを出題します') : null,
    h('div', { class: 'row gap' }, h('button', { class: 'btn primary big', onClick: start }, 'スタート'), h('a', { class: 'btn ghost', href: '#/drill' }, '戻る')));
  main.append(cfg);
  if (!ttsSupported()) main.append(h('p', { class: 'small muted' }, 'この端末では音声合成が使えないため、正解後の音声は登録済みの単語音声がある場合のみ鳴ります。'));

  // ---- 出題順の生成（弱点・未出題を優先した重み付きサンプリング）----
  function buildQueue() {
    let pool = allWords;
    if (weakOnly) pool = pool.filter(w => { const d = hist[w.word]; return d && d.wrong > 0 && d.wrong >= d.correct; });
    if (!pool.length) pool = allWords;
    const weighted = pool.map(w => {
      const d = hist[w.word];
      let wt = 1;
      if (!d || !d.seen) wt += 1.5;                                   // 未出題
      else { wt += 3 * (d.wrong / d.seen); if (d.lastWrong && d.lastWrong >= todayStr()) wt += 1; }
      if (d && d.seen >= 3 && d.wrong === 0) wt *= 0.4;              // 定着済みは控えめに
      return { w, wt };
    });
    // 音のバランス: 各音からほぼ均等に取る
    const n = count || pool.length;
    const perSound = Math.ceil(n / set.sounds.length);
    const picked = [];
    for (const s of set.sounds) {
      const cand = weighted.filter(x => x.w.sound === s);
      picked.push(...weightedSample(cand, Math.min(perSound, cand.length)).map(x => x.w));
    }
    return shuffle(picked).slice(0, n);
  }
  function weightedSample(items, k) {
    const arr = items.map(x => ({ ...x, key: Math.pow(Math.random(), 1 / x.wt) })); // Efraimidis–Spirakis
    return arr.sort((a, b) => b.key - a.key).slice(0, k);
  }

  // ---- セッション ----
  let queue = [], idx = 0, answered = 0, correct = 0, streak = 0, bestStreak = 0, startTs = 0, times = [];
  const wrongWords = new Map(); // word -> {sound, chosen[]}
  let confusion = {};
  let perSound = {};
  let cur = null, locked = false, qStart = 0, destroyed = false;

  const wordEl = h('div', { class: 'drill-word' });
  const noteEl = h('div', { class: 'small muted center drill-note' });
  const fb = h('div', { class: 'drill-fb' });
  const choices = h('div', { class: 'drill-choices' + (set.sounds.length === 2 ? ' two' : '') });
  const prog = h('div', { class: 'progress' }, h('div'));
  const status = h('div', { class: 'row between small muted' });
  const nextBtn = h('button', { class: 'btn primary big', hidden: true, onClick: next }, '言えた → 次へ');
  const quitBtn = h('button', { class: 'btn ghost small', onClick: finish }, 'ここで終了');
  const stage = h('section', { class: 'card drill', hidden: true }, status, prog, wordEl, noteEl, choices, fb, h('div', { class: 'row gap center wrap' }, nextBtn), h('div', { class: 'center' }, quitBtn));
  main.append(stage);
  for (const s of set.sounds) {
    choices.append(h('button', { class: 'btn choice drill-choice', dataset: { s }, onClick: () => answer(s) }, h('b', {}, ipa(s)), h('span', { class: 'small muted' }, exampleFor(s))));
  }
  function exampleFor(s) { const ex = allWords.filter(w => w.sound === s && !w.note).slice(0, 2).map(w => w.word); return ex.join(' / '); }

  const onKey = (e) => {
    if (stage.hidden) return;
    const i = Number(e.key) - 1;
    if (i >= 0 && i < set.sounds.length) { e.preventDefault(); answer(set.sounds[i]); }
    else if ((e.code === 'Space' || e.key === 'Enter') && !nextBtn.hidden) { e.preventDefault(); next(); }
  };
  window.addEventListener('keydown', onKey);

  function start() {
    queue = buildQueue();
    if (!queue.length) { toast('出題できる単語がありません', { type: 'warn' }); return; }
    idx = 0; answered = 0; correct = 0; streak = 0; bestStreak = 0; times = []; wrongWords.clear(); confusion = {}; perSound = {};
    startTs = Date.now();
    cfg.hidden = true; stage.hidden = false;
    show();
  }
  function show() {
    if (destroyed) return;
    if (idx >= queue.length || (count && answered >= count)) return finish();
    cur = queue[idx];
    locked = false; qStart = performance.now();
    wordEl.textContent = cur.word; wordEl.className = 'drill-word';
    clear(noteEl); clear(fb); nextBtn.hidden = true;
    choices.querySelectorAll('.drill-choice').forEach(b => { b.classList.remove('ok', 'ng'); b.disabled = false; });
    status.replaceChildren(h('span', {}, `${answered + 1}${count ? ' / ' + count : ''}`), h('span', {}, `正解 ${correct}　連続 ${streak}`));
    prog.firstChild.style.width = (count ? Math.min(100, answered / count * 100) : 0) + '%';
  }
  async function answer(s) {
    if (locked || !cur) return;
    locked = true;
    const ok = s === cur.sound;
    const dt = (performance.now() - qStart) / 1000;
    times.push(dt); answered++;
    perSound[cur.sound] = perSound[cur.sound] || { total: 0, correct: 0 };
    perSound[cur.sound].total++;
    const btn = choices.querySelector(`[data-s="${s}"]`);
    choices.querySelectorAll('.drill-choice').forEach(b => { b.disabled = true; if (b.dataset.s === cur.sound) b.classList.add('ok'); });
    if (ok) {
      correct++; streak++; bestStreak = Math.max(bestStreak, streak); perSound[cur.sound].correct++;
      wordEl.classList.add('ok');
      fb.replaceChildren(h('span', { class: 'ok' }, `✓ ${ipa(cur.sound)}`), cur.note ? h('div', { class: 'small muted' }, '注: ' + cur.note) : null);
    } else {
      streak = 0; btn && btn.classList.add('ng');
      wordEl.classList.add('ng');
      const k = `${cur.sound}→${s}`; confusion[k] = (confusion[k] || 0) + 1;
      const e = wrongWords.get(cur.word) || { sound: cur.sound, chosen: [] }; e.chosen.push(s); wrongWords.set(cur.word, e);
      fb.replaceChildren(h('span', { class: 'error' }, `✗ 正解は ${ipa(cur.sound)}`), h('span', { class: 'muted small' }, `（${ipa(s)} と答えた）`), cur.note ? h('div', { class: 'small muted' }, '注: ' + cur.note) : null);
      // 数問後に再出題（無制限モードでも末尾へ）
      const gap = RETRY_GAP[0] + Math.floor(Math.random() * (RETRY_GAP[1] - RETRY_GAP[0] + 1));
      queue.splice(Math.min(queue.length, idx + gap), 0, cur);
      if (count && queue.length > count) { /* 出題数は answered で制御するので増えても良い */ }
      store.markWeak(cur.word, set.itemId).catch(() => {});
    }
    // 単語履歴
    const d = hist[cur.word] || { word: cur.word, sound: cur.sound, seen: 0, correct: 0, wrong: 0, lastWrong: null, lastSeen: null };
    d.seen++; if (ok) d.correct++; else { d.wrong++; d.lastWrong = todayStr(); }
    d.lastSeen = todayStr(); hist[cur.word] = d;
    db.put('drillWords', d).catch(() => {});
    if (audio) playWord(cur.word, { speaker: settings.speaker, player, voiceURI: settings.ttsVoice, rate: 0.95 }).catch(() => {});
    idx++;
    if (mode === 'say' || !ok) {
      nextBtn.hidden = false;
      nextBtn.textContent = mode === 'say' ? '言えた → 次へ（+1）' : '次へ';
      nextBtn.focus();
    } else {
      setTimeout(show, 550);
    }
  }
  async function next() {
    if (mode === 'say' && cur) {
      try { await store.addReps(set.itemId, cur.sound, cur.word, 1); } catch { /* ignore */ }
    }
    show();
  }
  async function finish() {
    if (destroyed) return;
    stage.hidden = true;
    const durationSec = Math.round((Date.now() - startTs) / 1000);
    const avg = times.length ? (times.reduce((a, b) => a + b, 0) / times.length) : 0;
    if (answered) {
      try { await db.put('drillLog', { date: todayStr(), ts: Date.now(), setId: set.id, itemId: set.itemId, sounds: set.sounds, mode, total: answered, correct, confusions: confusion, perSound, bestStreak, avgSec: Math.round(avg * 100) / 100, durationSec, weakOnly }); }
      catch (e) { toast('記録の保存に失敗: ' + e.message, { type: 'error' }); }
    }
    const wrongList = [...wrongWords.entries()];
    const res = h('section', { class: 'card' },
      h('h2', {}, answered ? `結果: ${correct} / ${answered}（${Math.round(correct / answered * 100)}%）` : '結果なし'),
      h('div', { class: 'small muted' }, `最長連続 ${bestStreak}　平均 ${avg.toFixed(1)} 秒/語　所要 ${Math.floor(durationSec / 60)}分${durationSec % 60}秒`),
      h('div', { class: 'chips' }, ...set.sounds.map(s => { const p = perSound[s]; return h('span', { class: 'chip' }, h('b', {}, ipa(s)), ` ${p ? `${p.correct}/${p.total}` : '—'}`); })),
      Object.keys(confusion).length ? h('div', {}, h('div', { class: 'small muted' }, '綴り→音の混同（正しい音 → 選んだ音）'), h('div', { class: 'chips' }, ...Object.entries(confusion).sort((a, b) => b[1] - a[1]).map(([k, n]) => { const [f, t] = k.split('→'); return h('span', { class: 'chip warn' }, `${ipa(f)} → ${ipa(t)} ×${n}`); }))) : h('p', { class: 'ok' }, '混同なし'),
      wrongList.length ? h('div', {}, h('h4', {}, `間違えた単語（${wrongList.length}）— 声に出して確認`), h('div', { class: 'chips' }, ...wrongList.map(([w, e]) => h('button', { class: 'chip sel', onClick: () => playWord(w, { speaker: settings.speaker, player, voiceURI: settings.ttsVoice }) }, h('b', {}, w), ` ${ipa(e.sound)}`)))) : null,
      h('p', { class: 'small muted' }, '間違えた語は次回のドリルで優先的に出題され、分類ゲームにも翌日出ます。'),
      h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn primary', onClick: () => { res.remove(); cfg.hidden = false; } }, 'もう一回'),
        wrongList.length ? h('a', { class: 'btn', href: `#/drill/${set.id}?weak=1` }, '苦手だけやり直す') : null,
        h('a', { class: 'btn ghost', href: '#/drill' }, 'ドリル一覧')));
    main.append(res);
    window.scrollTo(0, 0);
  }

  return () => { destroyed = true; window.removeEventListener('keydown', onKey); player.stop(); try { speechSynthesis.cancel(); } catch { /* ignore */ } };
}

function field(label, control) { return h('div', { class: 'field' }, h('span', { class: 'small' }, label), control); }
function seg(options, value, onChange) {
  const el = h('div', { class: 'seg' });
  for (const [v, label] of options) {
    el.append(h('button', { class: 'seg-btn' + (v === value ? ' on' : ''), onClick: () => { el.querySelectorAll('.seg-btn').forEach((b, i) => b.classList.toggle('on', options[i][0] === v)); onChange(v); } }, label));
  }
  return el;
}
