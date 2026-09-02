// 単語分類ゲーム: 単語を音の列へタップ／ドラッグで分類
import { h, clear, toast, shuffle, ipa } from './util.js';
import { Player, playWord } from './audio.js';
import * as store from './store.js';
import { state, itemById, wordsFor, navigate } from './app.js';

export async function renderSortGame(main, [itemId]) {
  const item = itemById(itemId);
  if (!item) { main.append(h('p', {}, '項目が見つかりません')); return; }
  main.append(h('h2', {}, `単語分類: ${item.title}`));
  const box = h('section', { class: 'card' });
  main.append(box);
  const g = await mountSortGame(box, item, { onDone: () => {
    box.append(h('div', { class: 'row gap' }, h('button', { class: 'btn primary', onClick: () => navigate(`sort/${item.id}`) }, 'もう一度'), h('button', { class: 'btn ghost', onClick: () => navigate('curriculum') }, '課程へ')));
  } });
  return () => g.destroy();
}

export async function mountSortGame(container, item, { count = 15, onDone = null } = {}) {
  const player = new Player();
  const sounds = item.sounds;
  const pool = wordsFor(item.id).filter(w => sounds.includes(w.sound));
  const weak = await store.weakWordsDue(item.id);
  const weakWords = weak.map(w => pool.find(p => p.word === w.word)).filter(Boolean);
  const rest = shuffle(pool.filter(p => !weakWords.includes(p)));
  let queue = [...weakWords, ...rest.slice(0, Math.max(0, count - weakWords.length))];
  queue = shuffle(queue);
  const missed = [];
  let total = queue.length, done = 0, correctFirst = 0;
  const attempted = new Set();
  let current = null;
  let destroyed = false;

  const progress = h('div', { class: 'small muted' });
  const cardEl = h('div', { class: 'sort-card', draggable: true, tabindex: 0 });
  const feedback = h('div', { class: 'result' });
  const cols = h('div', { class: 'sort-cols' + (sounds.length === 2 ? ' two' : '') });
  const colEls = {};
  for (const s of sounds) {
    const col = h('div', { class: 'sort-col', dataset: { s }, onClick: () => place(s) }, h('div', { class: 'col-head' }, ipa(s)), h('div', { class: 'col-body' }));
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', e => { e.preventDefault(); col.classList.remove('over'); place(s); });
    colEls[s] = col; cols.append(col);
  }
  cardEl.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', current?.word || ''); });
  cardEl.addEventListener('keydown', e => { const i = Number(e.key) - 1; if (i >= 0 && i < sounds.length) place(sounds[i]); });
  const nextBtn = h('button', { class: 'btn primary', hidden: true, onClick: next }, '次へ ›');
  clear(container).append(progress, h('p', { class: 'small muted' }, '単語を見て、当てはまる母音の列をタップ（PCではドラッグ、数字キー1〜3も可）'), cardEl, cols, feedback, nextBtn);

  function show() {
    if (destroyed) return;
    current = queue.shift();
    if (!current) return finish();
    progress.textContent = `${done + 1} / ${total}${missed.length ? `（やり直し ${missed.length}）` : ''}`;
    clear(cardEl).append(h('div', { class: 'sort-word' }, current.word));
    cardEl.classList.remove('ok', 'ng');
    clear(feedback); nextBtn.hidden = true;
    Object.values(colEls).forEach(c => c.classList.remove('ok', 'ng'));
  }
  async function place(s) {
    if (!current || !nextBtn.hidden) return;
    const ok = s === current.sound;
    const first = !attempted.has(current.word);
    attempted.add(current.word);
    if (ok) {
      if (first) correctFirst++;
      done++;
      cardEl.classList.add('ok'); colEls[s].classList.add('ok');
      colEls[s].querySelector('.col-body').append(h('span', { class: 'chip' }, current.word));
      clear(feedback).append(h('div', {}, '✓ ', h('b', {}, current.word), ' ', ipa(current.ipa)), current.note ? h('div', { class: 'small muted' }, '注: ' + current.note) : null);
      if (first) store.clearWeak(current.word).catch(() => {});
      playWord(current.word, { speaker: state.settings.speaker, player, voiceURI: state.settings.ttsVoice }).catch(() => {});
      nextBtn.hidden = false;
    } else {
      cardEl.classList.add('ng'); colEls[s].classList.add('ng');
      clear(feedback).append(h('div', {}, `✗ ${ipa(s)} ではありません。もう一度。`));
      if (first) {
        missed.push(current);
        queue.push(current); // 同日の最後に再出題
        total++;
        store.markWeak(current.word, item.id).catch(() => {}); // 翌日にも再出題
      }
      setTimeout(() => { cardEl.classList.remove('ng'); colEls[s].classList.remove('ng'); }, 500);
    }
  }
  function next() { show(); }
  function finish() {
    const uniqueMissed = [...new Set(missed.map(m => m.word))];
    clear(container).append(
      h('h3', {}, `終了: 初回正解 ${correctFirst} / ${attempted.size} 語`),
      uniqueMissed.length ? h('div', {}, h('p', { class: 'small muted' }, '間違えた単語（明日も出題されます）'), h('div', { class: 'chips' }, ...uniqueMissed.map(w => { const info = pool.find(p => p.word === w); return h('span', { class: 'chip warn' }, `${w} ${info ? ipa(info.ipa) : ''}`); }))) : h('p', {}, '全問一発正解でした。'));
    onDone && onDone({ correctFirst, attempted: attempted.size, missed: uniqueMissed });
  }
  if (!queue.length) { clear(container).append(h('p', {}, 'この項目には分類用の単語がありません')); }
  else show();
  return { destroy: () => { destroyed = true; player.stop(); } };
}
