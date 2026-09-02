// 1回の練習フロー（10ステップ）
import { h, clear, toast, ipa, fmtDate, confirmDialog } from './util.js';
import { Recorder, RecError, recordingSupported, playWord, Player } from './audio.js';
import { trackPlayer, recordingView, stepper } from './components.js';
import { mountQuiz } from './quiz.js';
import * as store from './store.js';
import { applyRating, suggestRating, todayStr } from './srs.js';
import { state, itemById, wordsFor, wordInfo, navigate } from './app.js';

const STEPS = ['今日の音と口の使い方', '見本音声を再生', 'ゆっくり・区間リピート', '練習単語', '録音', '見本→自分 交互再生', '反復カウンター', '聞き分けクイズ', '自己評価', '今日の結果を保存'];
const RATING_DESC = {
  '×': '音を形成できない／ほとんど聞き分けられない',
  '△': '見本直後ならできるが、自力では不安定',
  '○': '少し迷うが、自力で概ね正しく再現・識別できる',
  '◎': '考えずに安定して再現でき、聞き分けもほぼ間違えない',
  '未': '実施しなかった（翌日へ持ち越し。失敗ではない）',
};

export async function renderPractice(main, [itemId, dayStr, kind = 'new']) {
  const item = itemById(itemId);
  if (!item) { main.append(h('p', {}, '項目が見つかりません')); return; }
  const day = Math.min(Math.max(1, Number(dayStr) || 1), item.dayCount);
  const dayData = item.days.find(d => d.day === day) || item.days[0];
  let progress = await store.getProgress(item);
  if (!(await store.getProgressList()).some(p => p.itemId === item.id)) await store.saveProgress(progress); // 反復累計の保存先を先に作る

  const key = `eigomimi:practice:${item.id}:${day}:${todayStr()}`;
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } })();
  const S = {
    item, day, dayData, kind: kind === 'review' ? 'review' : 'new', progress,
    step: saved?.step || 0,
    reps: saved?.reps || {},
    retries: saved?.retries || 0,
    sessionReps: saved?.sessionReps || 0,
    currentWord: saved?.currentWord || dayData.words[0],
    recordings: saved?.recordings || [],
    lastRecId: saved?.lastRecId || null,
    quiz: saved?.quiz || null,
    rating: saved?.rating || null,
    memo: saved?.memo || '',
    weak: new Set(saved?.weak || []),
    startTs: saved?.startTs || Date.now(),
    finished: false,
  };
  const persist = () => { try { sessionStorage.setItem(key, JSON.stringify({ ...S, item: undefined, dayData: undefined, progress: undefined, weak: [...S.weak] })); } catch { /* ignore */ } };
  const targetFor = (w) => S.targets?.[w] ?? state.settings.targetReps;
  S.targets = saved?.targets || {};

  // 共有プレイヤー（ステップ間で使い回す）
  const tp = trackPlayer({ tracks: item.tracks, speaker: state.settings.speaker, showRate: true, showLoop: true, onSpeakerChange: (id) => store.saveSetting('speaker', id) });
  const wordPlayer = new Player();
  const recorder = new Recorder();
  let quizMount = null;
  let recView = null;

  // ---- レイアウト ----
  const title = h('div', { class: 'ptitle' });
  const content = h('div', { class: 'pcontent' });
  const navRow = h('div', { class: 'row between' },
    h('button', { class: 'btn ghost', onClick: () => go(S.step - 1) }, '‹ 前へ'),
    h('button', { class: 'btn', onClick: () => go(S.step + 1) }, '次へ ›'));
  const bar = h('div', { class: 'bottombar' },
    h('button', { class: 'bb', id: 'bb-play', onClick: () => onPlay() }, h('span', { class: 'ico' }, '▶'), h('span', {}, '再生')),
    h('button', { class: 'bb rec', id: 'bb-rec', onClick: () => onRecord() }, h('span', { class: 'ico' }, '●'), h('span', {}, '録音')),
    h('button', { class: 'bb', id: 'bb-again', onClick: () => onAgain() }, h('span', { class: 'ico' }, '↻'), h('span', {}, 'もう一回')));
  const wrap = h('div', { class: 'practice' },
    h('div', { class: 'row between' }, h('h2', {}, item.title), h('span', { class: 'pill' }, `${S.kind === 'review' ? '復習' : '新規'}${item.dayCount > 1 ? ` ${day}日目` : ''}`)),
    title, content, navRow, h('div', { class: 'bottom-space' }));
  main.append(wrap);
  document.body.append(bar);
  document.body.classList.add('has-bar');

  const onKey = (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.code === 'Space') { e.preventDefault(); onAgain(); }
    else if (e.key === 'r' || e.key === 'R') onRecord();
    else if (e.key === 'p' || e.key === 'P') onPlay();
  };
  window.addEventListener('keydown', onKey);

  function go(n, { keepScroll = false } = {}) {
    if (n < 0 || n >= STEPS.length) return;
    if (quizMount) { quizMount.destroy(); quizMount = null; }
    S.step = n; persist();
    clear(title).append(h('div', { class: 'small muted' }, `ステップ ${n + 1} / ${STEPS.length}`), h('h3', {}, STEPS[n]), stepper(n, STEPS.length));
    clear(content);
    navRow.hidden = false;
    renderers[n]();
    if (!keepScroll) window.scrollTo(0, 0);
  }

  // ---- 共通アクション ----
  async function onPlay() {
    if ([1, 2, 5].includes(S.step) && tp.available) { tp.play(); return; }
    const src = await playWord(S.currentWord, { speaker: tp.speaker, player: wordPlayer, voiceURI: state.settings.ttsVoice });
    if (!src) toast('この単語の音声がありません。見本トラックを再生してください。', { type: 'warn' });
  }
  async function onAgain(fromRecording = false) {
    const w = S.currentWord;
    S.reps[w] = (S.reps[w] || 0) + 1;
    S.sessionReps++;
    persist();
    const sound = wordInfo(w, item.id)?.sound || item.sounds[0];
    try { await store.addReps(item.id, sound, w, 1); } catch (e) { toast('保存に失敗: ' + e.message, { type: 'error' }); }
    if (!fromRecording) flash(`${w}: ${S.reps[w]} / ${targetFor(w)}`);
    if (S.reps[w] === targetFor(w)) toast(`${w} が目標回数に達しました`, { type: 'ok' });
    if (S.sessionReps % state.settings.breakEvery === 0) breakPrompt();
    if (S.step === 6) go(6, { keepScroll: true });
    else if (S.step === 4 || S.step === 3) updateCounters();
  }
  let flashTimer;
  function flash(txt) {
    let f = document.getElementById('flash');
    if (!f) { f = h('div', { id: 'flash' }); document.body.append(f); }
    f.textContent = txt; f.classList.add('show');
    clearTimeout(flashTimer); flashTimer = setTimeout(() => f.classList.remove('show'), 700);
  }
  function breakPrompt() {
    const n = h('b', {}, '10');
    const dlg = h('dialog', { class: 'dlg' }, h('h3', {}, `${S.sessionReps}回 終了`), h('p', {}, '短い休憩。口と顎の力を抜いて、水を一口。'), h('p', { class: 'big center' }, n, ' 秒'),
      h('button', { class: 'btn primary', onClick: () => dlg.close() }, '続ける'));
    dlg.addEventListener('close', () => { clearInterval(iv); dlg.remove(); });
    document.body.append(dlg); dlg.showModal();
    let s = 10;
    const iv = setInterval(() => { s--; n.textContent = String(s); if (s <= 0) { clearInterval(iv); n.textContent = '0'; } }, 1000);
  }
  async function onRecord() {
    const btn = document.getElementById('bb-rec');
    if (recorder.recording) {
      btn.classList.remove('on'); btn.querySelector('span:last-child').textContent = '録音';
      try {
        const { blob, duration, mime } = await recorder.stop();
        if (blob.size < 200) { toast('録音が短すぎます', { type: 'warn' }); return; }
        let id = null, saveErr = null;
        try {
          id = await store.saveRecording({ itemId: item.id, day, word: S.currentWord, duration, mime, selfEval: null }, blob, state.settings);
          S.recordings.push(id); S.lastRecId = id; persist();
        } catch (e) { saveErr = e; }
        S.lastBlob = blob;
        await onAgain(true);
        toast(id ? `録音を保存（${S.currentWord} ${S.reps[S.currentWord]}回目）` : `録音は保存されませんでした（今回のみ再生可）: ${saveErr?.message || ''}`, { type: id ? 'ok' : 'error', ms: id ? 2600 : 6000 });
        if (S.step !== 4 && S.step !== 5) go(4); else go(S.step, { keepScroll: true });
      } catch (e) { toast(e.message, { type: 'error' }); }
      return;
    }
    if (!recordingSupported()) { toast('このブラウザは録音に対応していません（iPhone は Safari を使用）', { type: 'error', ms: 4000 }); return; }
    try {
      await recorder.start(level => { const m = document.getElementById('level'); if (m) m.style.width = Math.min(100, level * 300) + '%'; });
      btn.classList.add('on'); btn.querySelector('span:last-child').textContent = '停止';
      if (S.step !== 4) go(4);
      const st = document.getElementById('rec-status'); if (st) st.textContent = `録音中: ${S.currentWord} … もう一度「録音」を押して停止`;
    } catch (e) {
      const msg = e instanceof RecError ? e.message : '録音を開始できません: ' + e.message;
      toast(msg, { type: 'error', ms: 5000 });
      const st = document.getElementById('rec-status'); if (st) st.textContent = msg;
    }
  }
  function updateCounters() { content.querySelectorAll('[data-count]').forEach(el => { el.textContent = `${S.reps[el.dataset.count] || 0}/${targetFor(el.dataset.count)}`; }); }

  function wordChips({ onPick = null } = {}) {
    return h('div', { class: 'chips' }, ...dayData.words.map(w => {
      const info = wordInfo(w, item.id);
      return h('button', { class: 'chip sel' + (w === S.currentWord ? ' on' : ''), dataset: { word: w }, onClick: async () => {
        S.currentWord = w; persist();
        content.querySelectorAll('.chip.sel').forEach(c => c.classList.toggle('on', c.dataset.word === w));
        onPick && onPick(w);
      } }, h('b', {}, w), info ? h('span', { class: 'small muted'}, ' ' + ipa(info.ipa)) : null, h('span', { class: 'cnt small', dataset: { count: w } }, `${S.reps[w] || 0}/${targetFor(w)}`));
    }));
  }

  // ---- 各ステップ ----
  const renderers = [
    // 0 音と口
    () => {
      content.append(
        h('div', { class: 'card' }, h('div', { class: 'chips' }, ...item.sounds.map(s => h('span', { class: 'chip big' }, ipa(s)))),
          h('p', {}, h('b', {}, '目標: '), dayData.goal),
          h('ul', { class: 'mouth' }, ...dayData.mouth.map(m => h('li', {}, m)))),
        h('div', { class: 'card' }, h('h4', {}, '例'), h('div', { class: 'chips' }, ...item.sounds.map(s => {
          const ws = wordsFor(item.id).filter(w => w.sound === s).slice(0, 3);
          return h('span', { class: 'chip' }, h('b', {}, ipa(s)), ' ', ws.map(w => w.word).join(', '));
        }))),
        h('p', { class: 'small muted' }, 'Track ' + item.tracks.join('・') + ' を使います。まず口の形を確認し、次へ。'));
    },
    // 1 見本再生
    () => {
      tp.el.classList.add('compact');
      content.append(h('div', { class: 'card' }, tp.el, h('p', { class: 'small muted' }, '見本の直後に同じ口の形で真似します。まず1倍で通して聞きましょう。')));
    },
    // 2 0.75倍・区間
    () => {
      tp.el.classList.remove('compact');
      content.append(h('div', { class: 'card' }, tp.el, h('p', { class: 'small muted' }, '「A 始点」→再生を進めて「B 終点」で区間を決めると繰り返し再生します。0.75倍は音程を保って遅くします（端末により非対応の場合は音程が下がります）。')));
    },
    // 3 練習単語
    () => {
      const sentences = dayData.sentences || [];
      const sortLink = item.hasSortGame ? h('a', { class: 'btn ghost small', href: `#/sort/${item.id}` }, '単語分類ゲーム（別画面・進行状況は保持）') : null;
      content.append(
        h('div', { class: 'card' }, h('p', { class: 'small muted' }, '単語をタップすると音声を再生し、録音・反復の対象になります。'),
          wordChips({ onPick: (w) => playWord(w, { speaker: tp.speaker, player: wordPlayer, voiceURI: state.settings.ttsVoice }) })),
        sentences.length ? h('div', { class: 'card' }, h('h4', {}, '短文'), h('ul', {}, ...sentences.map(s => h('li', {}, h('button', { class: 'linklike', onClick: () => playWord(s, { player: wordPlayer, voiceURI: state.settings.ttsVoice, rate: 0.85 }) }, s))))) : null,
        sortLink ? h('div', { class: 'center' }, sortLink) : null,
        h('p', { class: 'small muted' }, '単語音声は登録済みファイルがあればそれを、なければ端末の音声合成（参考用）を使います。見本は上のTrackを優先してください。'));
    },
    // 4 録音
    () => {
      const status = h('div', { id: 'rec-status', class: 'small' }, recorder.recording ? `録音中: ${S.currentWord}` : `対象: ${S.currentWord}。下の「録音」で開始、もう一度押して停止。`);
      const meter = h('div', { class: 'meter' }, h('div', { id: 'level' }));
      const recBox = h('div');
      content.append(h('div', { class: 'card' }, wordChips({ onPick: (w) => { status.textContent = `対象: ${w}`; } }), status, meter, recBox));
      if (S.lastBlob) showRec(recBox, S.lastBlob, S.lastRecId);
      else if (S.lastRecId) store.recordingsFor().then(rs => { const r = rs.find(r => r.id === S.lastRecId); if (r && r.blob) { S.lastBlob = r.blob; showRec(recBox, r.blob, r.id); } });
      if (!recordingSupported()) content.append(h('p', { class: 'error small' }, 'このブラウザでは録音できません。単語リスト・反復カウンターはそのまま使えます。'));
    },
    // 5 交互再生
    () => {
      tp.el.classList.remove('compact');
      const recBox = h('div', { class: 'card' }, h('h4', {}, '自分の録音'));
      const altBtn = h('button', { class: 'btn primary big', onClick: () => alternate(3) }, '見本 → 自分 ×3');
      const alt1 = h('button', { class: 'btn', onClick: () => alternate(1) }, '1往復');
      content.append(h('div', { class: 'card' }, h('h4', {}, '見本（区間があればその範囲）'), tp.el), recBox, h('div', { class: 'row gap center' }, altBtn, alt1),
        h('p', { class: 'small muted' }, '見本トラックが未登録の場合は単語音声（登録音声または合成音声）を見本として使います。'));
      (async () => {
        const recs = (await store.recordingsFor(S.currentWord, item.id));
        if (recView) { recView.destroy(); recView = null; }
        if (S.lastBlob) { recView = recordingView(S.lastBlob, { label: `今日の録音: ${S.currentWord}` }); recBox.append(recView.el); }
        const past = recs.filter(r => r.blob && r.id !== S.lastRecId).slice(0, 5);
        if (past.length) {
          const sel = h('select', { class: 'input' }, h('option', { value: '' }, '過去の録音と比較…'), ...past.map(r => h('option', { value: r.id }, `${r.date} ${r.selfEval || ''}`)));
          const pastBox = h('div');
          sel.addEventListener('change', () => { clear(pastBox); const r = past.find(p => String(p.id) === sel.value); if (r) { const v = recordingView(r.blob, { label: `${r.date} の録音`, color: '#a855f7' }); pastBox.append(v.el); } });
          recBox.append(sel, pastBox);
        }
        if (!S.lastBlob && !past.length) recBox.append(h('p', { class: 'muted small' }, 'まだ録音がありません。「録音」ボタンで録音してください。'));
      })();
      async function alternate(times) {
        if (!S.lastBlob && !recView) { toast('先に録音してください', { type: 'warn' }); return; }
        altBtn.disabled = true; alt1.disabled = true;
        try {
          for (let i = 0; i < times; i++) {
            if (tp.available) await tp.playOnce();
            else await playWord(S.currentWord, { speaker: tp.speaker, player: wordPlayer, voiceURI: state.settings.ttsVoice });
            await sleep(300);
            if (recView) await recView.playOnce();
            await sleep(400);
          }
        } catch (e) { toast('再生エラー: ' + e.message, { type: 'error' }); }
        altBtn.disabled = false; alt1.disabled = false;
      }
    },
    // 6 反復カウンター
    () => {
      clear(content);
      const w = S.currentWord; const n = S.reps[w] || 0; const t = targetFor(w);
      const bySound = {};
      for (const [word, c] of Object.entries(S.reps)) { const s = wordInfo(word, item.id)?.sound || '?'; bySound[s] = (bySound[s] || 0) + c; }
      content.append(
        h('div', { class: 'card center' },
          h('div', { class: 'small muted' }, '対象の単語'), wordChips({ onPick: () => go(6, { keepScroll: true }) }),
          h('div', { class: 'counter' }, h('span', { class: 'n' }, String(n)), h('span', { class: 'muted' }, ` / ${t}`)),
          h('div', { class: 'progress' }, h('div', { style: { width: Math.min(100, n / t * 100) + '%' } })),
          h('div', { class: 'row gap center wrap' },
            h('button', { class: 'btn primary big', onClick: () => onAgain() }, '＋1 同じ形で言えた'),
            h('button', { class: 'btn ghost', onClick: () => { S.retries++; persist(); flash('やり直し（回数に含めない）'); go(6, { keepScroll: true }); } }, 'やり直し')),
          h('div', { class: 'row gap center small' },
            h('label', {}, '目標 ', h('input', { class: 'input num', type: 'number', min: 1, max: 100, value: t, onChange: (e) => { S.targets[w] = Math.max(1, Number(e.target.value) || 1); persist(); go(6, { keepScroll: true }); } })),
            h('span', { class: 'muted' }, `やり直し ${S.retries}回`))),
        h('div', { class: 'card' }, h('div', { class: 'row between' }, h('span', {}, 'この練習の反復'), h('b', {}, String(S.sessionReps))),
          h('div', { class: 'chips' }, ...Object.entries(bySound).map(([s, c]) => h('span', { class: 'chip' }, h('b', {}, ipa(s)), ` ${c}`))),
          h('p', { class: 'small muted' }, `${state.settings.breakEvery}回ごとに短い休憩を挟みます。速さより「同じ形で安定して出せた回数」を数えてください。50〜100回は複数日に分けて構いません。`)));
    },
    // 7 聞き分け
    () => {
      const box = h('div', { class: 'card' });
      content.append(box);
      if (S.quiz) {
        box.append(h('p', {}, `本日の結果: ${S.quiz.correct} / ${S.quiz.total}`), h('button', { class: 'btn ghost small', onClick: () => { S.quiz = null; persist(); go(7); } }, 'もう一度出題（記録には最初の回答が残ります）'));
        return;
      }
      quizMount = mountQuiz(box, item, { count: state.settings.quizCount, onDone: (r) => { S.quiz = { correct: r.correct, total: r.total, confusions: r.confusions }; persist(); } });
    },
    // 8 自己評価
    () => {
      const sug = S.quiz ? suggestRating(S.quiz.correct, S.quiz.total) : null;
      const btns = h('div', { class: 'ratings' }, ...['×', '△', '○', '◎', '未'].map(r =>
        h('button', { class: 'rate-btn' + (S.rating === r ? ' on' : ''), onClick: () => { S.rating = r; persist(); btns.querySelectorAll('.rate-btn').forEach(b => b.classList.toggle('on', b.textContent.startsWith(r))); } },
          h('span', { class: 'big' }, r), h('span', { class: 'small' }, RATING_DESC[r]))));
      const memo = h('textarea', { class: 'input', rows: 3, placeholder: '気づいたこと（例: /æ/ で顎が下がらない）', onInput: (e) => { S.memo = e.target.value; persist(); } }, S.memo);
      const weakBox = h('div', { class: 'chips' }, ...dayData.words.map(w => h('button', { class: 'chip sel' + (S.weak.has(w) ? ' on' : ''), onClick: (e) => { S.weak.has(w) ? S.weak.delete(w) : S.weak.add(w); e.currentTarget.classList.toggle('on'); persist(); } }, w)));
      content.append(
        h('div', { class: 'card' },
          sug ? h('p', { class: 'small' }, `聞き分け ${S.quiz.correct}/${S.quiz.total} → 目安は「${sug}」。発音を自力で安定して再現できたかを併せて判断してください。`) : h('p', { class: 'small muted' }, '聞き分けクイズは未実施です。'),
          btns),
        h('div', { class: 'card' }, h('h4', {}, '苦手な単語'), weakBox),
        h('div', { class: 'card' }, h('h4', {}, 'メモ'), memo));
    },
    // 9 保存
    () => {
      const rating = S.rating || '未';
      const preview = applyRating(S.progress, rating, todayStr());
      const totalReps = Object.values(S.reps).reduce((a, b) => a + b, 0);
      const saveBtn = h('button', { class: 'btn primary big', onClick: save }, '保存して終了');
      content.append(
        h('div', { class: 'card' },
          h('table', { class: 'tbl' }, h('tbody', {},
            row('項目', `${item.title}（Track ${item.tracks.join('・')}）`),
            row('種別', `${S.kind === 'review' ? '復習' : '新規'} / ${day}日目`),
            row('反復', `${totalReps}回（やり直し ${S.retries}）`),
            row('録音', `${S.recordings.length}本`),
            row('聞き分け', S.quiz ? `${S.quiz.correct} / ${S.quiz.total}` : '未実施'),
            row('自己評価', rating),
            row('苦手単語', [...S.weak].join(', ') || '—'),
            row('次回', preview.status === 'review' ? `${fmtDate(preview.nextDate)}（復習・段階 ${preview.stage + 1}/7）` : `${fmtDate(preview.nextDate)}（${preview.currentDay}日目）`))),
          S.finished ? h('p', { class: 'ok' }, '保存済み') : saveBtn),
        h('div', { class: 'center' }, h('button', { class: 'btn ghost', onClick: () => navigate('') }, 'ホームへ')));
      async function save() {
        saveBtn.disabled = true;
        try {
          const p = applyRating(await store.getProgress(item), rating, todayStr());
          p.notes = S.memo ? `${(S.progress.notes || '')}${S.progress.notes ? '\n' : ''}${todayStr()}: ${S.memo}` : (S.progress.notes || '');
          await store.saveProgress(p);
          for (const w of S.weak) await store.markWeak(w, item.id);
          await store.saveSession({ itemId: item.id, sound: item.sounds, tracks: item.tracks, stage: p.stage, day, type: S.kind, reps: totalReps, retries: S.retries, quizCorrect: S.quiz?.correct ?? null, quizTotal: S.quiz?.total ?? null, rating, weakWords: [...S.weak], recordingIds: S.recordings, memo: S.memo, durationSec: Math.round((Date.now() - S.startTs) / 1000) });
          S.finished = true; sessionStorage.removeItem(key);
          toast('保存しました', { type: 'ok' });
          navigate('');
        } catch (e) { saveBtn.disabled = false; toast('保存に失敗: ' + e.message, { type: 'error', ms: 5000 }); }
      }
    },
  ];
  function row(k, v) { return h('tr', {}, h('th', {}, k), h('td', {}, v)); }
  function showRec(box, blob, id) {
    if (recView) recView.destroy();
    recView = recordingView(blob, { label: `録音: ${S.currentWord}` });
    const evalRow = h('div', { class: 'row gap wrap' }, h('span', { class: 'small muted' }, '自己評価:'), ...['近い', '不安定', '違う'].map(v =>
      h('button', { class: 'btn small', onClick: async (e) => {
        evalRow.querySelectorAll('.btn').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on');
        if (id != null) await store.updateRecording(id, { selfEval: v }).catch(() => {});
        if (v === '違う') { S.weak.add(S.currentWord); persist(); }
      } }, v)));
    clear(box).append(recView.el, evalRow, h('p', { class: 'small muted' }, '「違う」を選ぶと苦手単語に追加されます。波形は音量の変化の目安で、発音の正しさを判定するものではありません。'));
  }

  go(S.step);

  // cleanup
  return () => {
    window.removeEventListener('keydown', onKey);
    tp.destroy(); wordPlayer.stop(); recorder.cancel();
    if (quizMount) quizMount.destroy();
    if (recView) recView.destroy();
    bar.remove(); document.body.classList.remove('has-bar');
    document.getElementById('flash')?.remove();
  };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
