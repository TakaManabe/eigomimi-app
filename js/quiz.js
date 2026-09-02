// 聞き分けクイズ（2択／3択）。最初の回答のみ正答率に使う。
import { h, clear, toast, shuffle, ipa } from './util.js';
import { Player, playWord, ttsSupported } from './audio.js';
import * as store from './store.js';
import { state, itemById, pairsFor, wordsFor, wordInfo, navigate } from './app.js';

export async function renderQuiz(main, [itemId]) {
  const item = itemById(itemId);
  if (!item) { main.append(h('p', {}, '項目が見つかりません')); return; }
  const box = h('section', { class: 'card' });
  main.append(h('h2', {}, `聞き分け: ${item.title}`), box);
  const stats = await store.quizStats(item.id);
  const info = h('p', { class: 'small muted' }, stats.total ? `この項目の正答率 ${Math.round(stats.ratio * 100)}%（${stats.correct}/${stats.total}）` : 'この項目はまだ未実施');
  main.append(info);
  const q = mountQuiz(box, item, { count: state.settings.quizCount, onDone: (r) => {
    box.append(h('div', { class: 'row gap' }, h('button', { class: 'btn primary', onClick: () => navigate(`quiz/${item.id}`) }, 'もう一度'), h('button', { class: 'btn ghost', onClick: () => navigate('curriculum') }, '課程へ')));
  } });
  return () => q.destroy();
}

/**
 * container に埋め込む。opts.count 問。opts.onDone(result) で {correct,total,confusions,answers}
 */
export function mountQuiz(container, item, { count = 10, onDone = null } = {}) {
  const player = new Player();
  const pairs = pairsFor(item.id);
  const words = wordsFor(item.id);
  let mode = pairs.length ? 'word' : 'sound';
  const soundModeOk = item.sounds.length >= 2;
  if (mode === 'sound' && !soundModeOk) mode = 'word';
  let questions = [];
  let idx = 0;
  const answers = []; // {playedWord, playedSound, chosenSound, correct, first}
  let firstAnswered = false;
  let destroyed = false;
  const settings = state.settings;

  function buildQuestions() {
    const qs = [];
    if (mode === 'word') {
      const pool = shuffle(pairs);
      for (let i = 0; i < count; i++) {
        const pair = pool[i % pool.length];
        const target = pair.words[Math.floor(Math.random() * pair.words.length)];
        qs.push({ target, choices: shuffle(pair.words), answer: target });
      }
    } else {
      const pool = shuffle(words.filter(w => item.sounds.includes(w.sound)));
      for (let i = 0; i < count; i++) {
        const w = pool[i % pool.length];
        const others = shuffle(item.sounds.filter(s => s !== w.sound)).slice(0, 2);
        qs.push({ target: w.word, choices: shuffle([w.sound, ...others]), answer: w.sound });
      }
    }
    return qs;
  }

  const head = h('div', { class: 'row between wrap gap' });
  const body = h('div');
  const foot = h('div', { class: 'row gap wrap' });
  clear(container).append(head, body, foot);

  function speakerFor() {
    if (!settings.altSpeaker) return settings.speaker;
    const sp = state.curriculum.speakers.map(s => s.id);
    return sp[Math.floor(Math.random() * sp.length)];
  }

  async function playTarget(q) {
    const src = await playWord(q.target, { speaker: speakerFor(), player, voiceURI: settings.ttsVoice });
    if (!src) toast('音声を再生できません（単語音声の登録または音声合成が必要です）', { type: 'warn' });
    return src;
  }

  function renderQ() {
    if (destroyed) return;
    const q = questions[idx];
    firstAnswered = false;
    clear(head).append(
      h('span', { class: 'small muted' }, `第 ${idx + 1} / ${questions.length} 問`),
      h('div', { class: 'seg' },
        h('button', { class: 'seg-btn' + (mode === 'word' ? ' on' : ''), disabled: !pairs.length, onClick: () => { mode = 'word'; start(); } }, '単語'),
        h('button', { class: 'seg-btn' + (mode === 'sound' ? ' on' : ''), disabled: !soundModeOk, onClick: () => { mode = 'sound'; start(); } }, '音')));
    const srcNote = h('div', { class: 'small muted' }, '');
    const playBtn = h('button', { class: 'btn primary big', onClick: async () => { playBtn.disabled = true; const s = await playTarget(q); srcNote.textContent = s === 'tts' ? '合成音声（参考用）' : s === 'file' ? '登録音声' : ''; playBtn.disabled = false; } }, '🔊 聞く');
    const choices = h('div', { class: 'choices' });
    const result = h('div', { class: 'result' });
    for (const c of q.choices) {
      const info = mode === 'word' ? wordInfo(c, item.id) : null;
      const label = mode === 'word' ? h('span', {}, h('b', {}, c), ' ', h('span', { class: 'muted small' }, info ? ipa(info.ipa) : '')) : h('b', {}, ipa(c));
      const btn = h('button', { class: 'btn choice', dataset: { c }, onClick: () => answer(c, btn) }, label);
      choices.append(btn);
    }
    const reveal = h('button', { class: 'btn ghost small', onClick: () => { if (!firstAnswered) { logAnswer(null, false, true); } showAnswer(); } }, '答えを見る');
    clear(body).append(h('p', { class: 'muted small' }, mode === 'word' ? '聞こえた単語を選んでください' : '聞こえた母音を選んでください'), h('div', { class: 'center' }, playBtn, srcNote), choices, result, reveal);
    clear(foot);
    setTimeout(() => playTarget(q), 200);

    function soundOf(choice) { return mode === 'word' ? (wordInfo(choice, item.id)?.sound || '?') : choice; }
    function logAnswer(chosen, correct, first) {
      const entry = { itemId: item.id, mode, playedWord: q.target, playedSound: soundOf(q.answer), chosenSound: chosen == null ? null : soundOf(chosen), chosenWord: mode === 'word' ? chosen : null, correct, first };
      answers.push(entry);
      store.logQuiz(entry).catch(() => {});
    }
    function answer(c, btn) {
      const correct = c === q.answer;
      if (!firstAnswered) { logAnswer(c, correct, true); firstAnswered = true; }
      else logAnswer(c, correct, false);
      btn.classList.add(correct ? 'ok' : 'ng');
      if (correct) showAnswer();
      else { result.textContent = 'ちがいます。もう一度聞いて選び直してみましょう。'; if (mode === 'word') store.markWeak(q.target, item.id).catch(() => {}); }
    }
    function showAnswer() {
      const info = wordInfo(q.target, item.id);
      choices.querySelectorAll('button').forEach(b => { b.disabled = true; });
      [...choices.children].forEach(b => { if (b.dataset.c === q.answer) b.classList.add('ok'); });
      clear(result).append(h('div', {}, '正解: ', h('b', {}, q.target), ' ', info ? ipa(info.ipa) : '', info?.note ? h('div', { class: 'small muted' }, '注: ' + info.note) : null));
      reveal.remove();
      clear(foot).append(h('button', { class: 'btn primary', onClick: next }, idx + 1 < questions.length ? '次の問題 ›' : '結果を見る'));
    }
  }
  function next() { idx++; if (idx < questions.length) renderQ(); else finish(); }
  function finish() {
    const first = answers.filter(a => a.first);
    const correct = first.filter(a => a.correct).length;
    const conf = {};
    for (const a of first) if (!a.correct && a.chosenSound) { const k = `${a.playedSound}→${a.chosenSound}`; conf[k] = (conf[k] || 0) + 1; }
    const res = { correct, total: first.length, confusions: conf, answers };
    clear(head); clear(foot);
    clear(body).append(
      h('h3', {}, `結果: ${correct} / ${first.length}`),
      h('p', { class: 'small muted' }, '目安: 7〜8問正解で ○、9〜10問で ◎ の候補（発音の再現も併せて自己評価してください）'),
      Object.keys(conf).length ? h('div', {}, h('div', { class: 'small muted' }, '混同したペア'), h('div', { class: 'chips' }, ...Object.entries(conf).map(([k, n]) => { const [f, t] = k.split('→'); return h('span', { class: 'chip warn' }, `${ipa(f)} → ${ipa(t)} ×${n}`); }))) : h('p', { class: 'small' }, '混同なし'));
    onDone && onDone(res);
  }
  function start() { idx = 0; answers.length = 0; questions = buildQuestions(); if (!questions.length) { clear(body).append(h('p', {}, 'この項目には出題データがありません')); return; } renderQ(); }
  if (!ttsSupported()) toast('この端末では音声合成が使えません。設定で単語音声を登録してください。', { type: 'warn', ms: 4000 });
  start();
  return { destroy: () => { destroyed = true; player.stop(); try { speechSynthesis.cancel(); } catch { /* ignore */ } }, getResult: () => ({ answers }) };
}
