// 録音の一覧・比較・削除
import { h, clear, toast, fmtBytes, confirmDialog, ipa } from './util.js';
import { recordingView } from './components.js';
import * as store from './store.js';
import * as db from './db.js';
import { state, items, itemById, wordInfo } from './app.js';

export async function renderRecords(main) {
  const views = [];
  let filterItem = '';
  let filterWord = '';
  const head = h('section', { class: 'card' }, h('h2', {}, '録音'));
  const info = h('p', { class: 'small muted' });
  const filters = h('div', { class: 'row gap wrap' });
  const list = h('section', { class: 'list' });
  main.append(head, list);
  head.append(info, filters);

  async function refresh() {
    views.forEach(v => v.destroy()); views.length = 0;
    const all = await store.recordingsFor(filterWord || null, filterItem || null);
    const size = await store.recordingsTotalSize();
    const est = await db.storageEstimate();
    info.textContent = `${all.length}件 / ${fmtBytes(size)}` + (est.quota ? `（端末の空き目安: ${fmtBytes(est.quota - est.usage)}）` : '') + `。保持上限 ${state.settings.keepRecordings}件（設定で変更）`;
    const words = [...new Set((await store.recordingsFor(null, filterItem || null)).map(r => r.word))].sort();
    clear(filters).append(
      h('select', { class: 'input', onChange: e => { filterItem = e.target.value; filterWord = ''; refresh(); } }, h('option', { value: '' }, 'すべての項目'), ...items().map(it => h('option', { value: it.id, selected: filterItem === it.id }, it.title))),
      h('select', { class: 'input', onChange: e => { filterWord = e.target.value; refresh(); } }, h('option', { value: '' }, 'すべての単語'), ...words.map(w => h('option', { value: w, selected: filterWord === w }, w))),
      all.length ? h('button', { class: 'btn ghost small danger-text', onClick: async () => {
        if (!await confirmDialog(`表示中の ${all.length} 件の録音を削除しますか？`, { ok: '削除', danger: true })) return;
        for (const r of all) await store.deleteRecording(r.id);
        toast('削除しました'); refresh();
      } }, '表示中を削除') : null);
    clear(list);
    if (!all.length) { list.append(h('p', { class: 'muted' }, '録音がありません。練習画面の「録音」で保存されます。')); return; }
    // 単語ごとにまとめて比較しやすく
    const byWord = new Map();
    for (const r of all) { if (!byWord.has(r.word)) byWord.set(r.word, []); byWord.get(r.word).push(r); }
    for (const [word, recs] of byWord) {
      const info = wordInfo(word);
      const card = h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h3', {}, word, ' ', h('span', { class: 'small muted' }, info ? ipa(info.ipa) : '')), h('span', { class: 'small muted' }, itemById(recs[0].itemId)?.title || '')));
      for (const r of recs) {
        if (!r.blob) { card.append(h('div', { class: 'recview' }, h('span', { class: 'small muted' }, `${r.date} — 音声データなし（バックアップに音声を含めなかった録音）`), h('button', { class: 'btn small ghost', onClick: async () => { await store.deleteRecording(r.id); refresh(); } }, '削除'))); continue; }
        const v = recordingView(r.blob, { label: `${r.date}  ${r.selfEval ? '「' + r.selfEval + '」' : ''}  ${fmtBytes(r.size)}`, onDelete: async () => {
          if (!await confirmDialog('この録音を削除しますか？', { ok: '削除', danger: true })) return;
          await store.deleteRecording(r.id); refresh();
        } });
        views.push(v); card.append(v.el);
      }
      if (recs.filter(r => r.blob).length >= 2) {
        const [a, b] = recs.filter(r => r.blob);
        card.append(h('button', { class: 'btn small', onClick: async () => {
          const va = views.find(v => v.url && v.el.textContent.includes(a.date)), vb = views.find(v => v.url && v.el.textContent.includes(b.date) && v !== va);
          try { if (va) await va.playOnce(); await new Promise(r => setTimeout(r, 300)); if (vb) await vb.playOnce(); } catch (e) { toast(e.message, { type: 'error' }); }
        } }, '最新 → 前回 を続けて再生'));
      }
      list.append(card);
    }
  }
  await refresh();
  return () => views.forEach(v => v.destroy());
}
